import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';

interface JournalEntry {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  topic: string | null;
  tags: string[];
  is_documentation: boolean;
  vault_folder_id: number | null;
  created_at: string;
}

const MOODS: { id: string; label: string; icon: string }[] = [
  { id: 'safe',         label: 'Safe',         icon: 'shield-alt' },
  { id: 'calm',         label: 'Calm',         icon: 'wind' },
  { id: 'okay',         label: 'Okay',         icon: 'meh' },
  { id: 'hopeful',      label: 'Hopeful',      icon: 'sun' },
  { id: 'anxious',      label: 'Anxious',      icon: 'wave-square' },
  { id: 'scared',       label: 'Scared',       icon: 'exclamation-circle' },
  { id: 'sad',          label: 'Sad',          icon: 'cloud-rain' },
  { id: 'angry',        label: 'Angry',        icon: 'fire' },
  { id: 'numb',         label: 'Numb',         icon: 'circle' },
  { id: 'overwhelmed',  label: 'Overwhelmed',  icon: 'water' },
];

export default function CompanionJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  // Compose state
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [isDocumentation, setIsDocumentation] = useState(false);
  const [saveToVault, setSaveToVault] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    const res = await api.listJournalEntries(50);
    if (res.status === 200 && res.data) {
      setEntries(((res.data as any).entries || []) as JournalEntry[]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchEntries(); }, [fetchEntries]));

  async function handleSave() {
    if (!content.trim() || saving) return;
    setSaving(true);
    const res = await api.createJournalEntry({
      title: title.trim() || undefined,
      content: content.trim(),
      mood: mood || undefined,
      is_documentation: isDocumentation,
      // Save-to-vault: server expects a folder_id. The full vault-folder
      // picker lives on the Vault screen; for v1 we just signal intent
      // and surface a follow-up — treat as journal-only for now and tell
      // the user to attach it from Vault → Journal.
    });
    setSaving(false);

    if (res.error || res.status >= 400) {
      Alert.alert('Could not save', 'Try again.');
      return;
    }

    // Reset composer + reload list.
    setContent(''); setTitle(''); setMood(null); setIsDocumentation(false); setSaveToVault(false);
    setComposing(false);
    fetchEntries();

    if (saveToVault) {
      Alert.alert(
        'Saved',
        'Entry saved. To attach it to a Safety Vault folder, open Vault → Journal and select this entry.'
      );
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.coral} />
      </View>
    );
  }

  if (composing) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.composerContainer}>
          <View style={styles.header}>
            <Pressable onPress={() => setComposing(false)} hitSlop={12}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.headerTitle}>New entry</Text>
            <Pressable
              onPress={handleSave}
              disabled={!content.trim() || saving}
              hitSlop={12}
            >
              <Text style={[styles.saveText, (!content.trim() || saving) && { opacity: 0.4 }]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title (optional)"
            placeholderTextColor={Colors.textMuted}
            style={styles.titleInput}
            maxLength={120}
          />

          <Text style={styles.label}>How are you feeling?</Text>
          <View style={styles.moodRow}>
            {MOODS.map((m) => (
              <Pressable
                key={m.id}
                style={[styles.moodChip, mood === m.id && styles.moodChipActive]}
                onPress={() => setMood(mood === m.id ? null : m.id)}
              >
                <FontAwesome5 name={m.icon} size={11} color={mood === m.id ? Colors.coral : Colors.textMuted} />
                <Text style={[styles.moodLabel, mood === m.id && styles.moodLabelActive]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Write what you need to write. Take your time."
            placeholderTextColor={Colors.textMuted}
            style={styles.contentInput}
            multiline
            maxLength={50000}
          />

          <Pressable
            style={styles.toggleRow}
            onPress={() => setIsDocumentation(!isDocumentation)}
          >
            <View style={[styles.checkbox, isDocumentation && styles.checkboxActive]}>
              {isDocumentation && <FontAwesome5 name="check" size={10} color={Colors.textInverse} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Mark as documentation</Text>
              <Text style={styles.toggleDesc}>Flag this entry as something you may need to reference later.</Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.toggleRow}
            onPress={() => setSaveToVault(!saveToVault)}
          >
            <View style={[styles.checkbox, saveToVault && styles.checkboxActive]}>
              {saveToVault && <FontAwesome5 name="check" size={10} color={Colors.textInverse} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Save to Safety Vault</Text>
              <Text style={styles.toggleDesc}>Pick a vault folder from Vault → Journal after saving.</Text>
            </View>
          </Pressable>

          <View style={styles.disclaimerBox}>
            <FontAwesome5 name="lock" size={11} color={Colors.textMuted} style={{ marginTop: 2 }} />
            <Text style={styles.disclaimer}>
              Journals are private to you, encrypted on our servers. They are not shared with anyone.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <FontAwesome5 name="chevron-left" size={16} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Journal</Text>
        <Pressable onPress={() => setComposing(true)} hitSlop={12}>
          <FontAwesome5 name="plus" size={16} color={Colors.coral} />
        </Pressable>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
        renderItem={({ item }) => (
          <View style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryDate}>
                {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                {item.mood && (
                  <View style={styles.moodBadge}>
                    <Text style={styles.moodBadgeText}>{item.mood}</Text>
                  </View>
                )}
                {item.is_documentation && (
                  <View style={[styles.moodBadge, { backgroundColor: Colors.warningMuted }]}>
                    <Text style={[styles.moodBadgeText, { color: Colors.warning }]}>doc</Text>
                  </View>
                )}
              </View>
            </View>
            {item.title && <Text style={styles.entryTitle}>{item.title}</Text>}
            <Text style={styles.entryContent} numberOfLines={4}>{item.content}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome5 name="book" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No entries yet</Text>
            <Text style={styles.emptyBody}>Tap + to write your first entry.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'ios' ? 50 : Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  cancelText: { fontSize: FontSize.md, color: Colors.textSecondary },
  saveText: { fontSize: FontSize.md, color: Colors.coral, fontWeight: '700' },
  composerContainer: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  titleInput: {
    fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary,
    paddingVertical: Spacing.sm, marginTop: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm, fontWeight: '600' },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  moodChipActive: { backgroundColor: Colors.coralMuted, borderColor: Colors.coral },
  moodLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  moodLabelActive: { color: Colors.coral, fontWeight: '600' },
  contentInput: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.md,
    color: Colors.textPrimary, fontSize: FontSize.md, lineHeight: 22,
    minHeight: 220, textAlignVertical: 'top',
    borderWidth: 1, borderColor: Colors.border,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.md, marginTop: Spacing.md,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 2, borderColor: Colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxActive: { backgroundColor: Colors.coral, borderColor: Colors.coral },
  toggleLabel: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  toggleDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  disclaimerBox: {
    flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md,
    marginTop: Spacing.lg, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceDark,
    borderWidth: 1, borderColor: Colors.border,
  },
  disclaimer: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, flex: 1 },
  entryCard: {
    backgroundColor: Colors.surface, padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  entryDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  moodBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full, backgroundColor: Colors.coralMuted },
  moodBadgeText: { fontSize: 10, color: Colors.coral, fontWeight: '600', textTransform: 'capitalize' },
  entryTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  entryContent: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: Spacing.sm },
  emptyTitle: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: '700' },
  emptyBody: { fontSize: FontSize.sm, color: Colors.textSecondary },
});

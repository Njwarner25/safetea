import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import {
  useAiCompanionStore,
  COMPANION_AVATARS,
  COMPANION_THEMES,
  COMPANION_TONES,
} from '../../store/aiCompanionStore';
import { api } from '../../services/api';

export default function CompanionSettings() {
  const { companionName, avatar, theme, tone, setCompanionName, setAvatar, setTheme, setTone, applyServerSettings } = useAiCompanionStore();
  const [name, setName] = useState(companionName || '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setCompanionName(trimmed);
    const res = await api.saveCompanionSettings({
      companion_name: trimmed,
      avatar_style: avatar,
      theme_color: theme,
      tone: tone,
    });
    setSaving(false);
    if (res.status === 200 && res.data) {
      applyServerSettings((res.data as any).settings);
      setSavedAt(Date.now());
    }
  }

  return (
    <ScrollView style={{ backgroundColor: Colors.background }} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <FontAwesome5 name="chevron-left" size={16} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Companion settings</Text>
        <View style={{ width: 16 }} />
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholder="Companion name"
        placeholderTextColor={Colors.textMuted}
        maxLength={40}
      />

      <Text style={styles.label}>Avatar</Text>
      <View style={styles.optionGrid}>
        {COMPANION_AVATARS.map((a) => (
          <Pressable
            key={a.id}
            style={[styles.optionCard, avatar === a.id && styles.optionCardActive]}
            onPress={() => setAvatar(a.id)}
          >
            <FontAwesome5 name={a.icon} size={20} color={avatar === a.id ? Colors.coral : Colors.textSecondary} />
            <Text style={[styles.optionLabel, avatar === a.id && styles.optionLabelActive]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Theme</Text>
      <View style={styles.themeRow}>
        {COMPANION_THEMES.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.themeCard, theme === t.id && styles.themeCardActive]}
            onPress={() => setTheme(t.id)}
          >
            <View style={[styles.themeSwatch, { backgroundColor: t.primary }]} />
            <View style={[styles.themeSwatchSmall, { backgroundColor: t.secondary }]} />
            <Text style={[styles.themeLabel, theme === t.id && styles.themeLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Tone</Text>
      <View style={styles.toneList}>
        {COMPANION_TONES.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.toneRow, tone === t.id && styles.toneRowActive]}
            onPress={() => setTone(t.id)}
          >
            <View style={[styles.radio, tone === t.id && styles.radioActive]}>
              {tone === t.id && <View style={styles.radioDot} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toneLabel}>{t.label}</Text>
              <Text style={styles.toneDesc}>{t.desc}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.saveBtn, (!name.trim() || saving) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={!name.trim() || saving}
      >
        {saving
          ? <ActivityIndicator color={Colors.textInverse} />
          : <Text style={styles.saveBtnText}>Save changes</Text>}
      </Pressable>
      {savedAt && <Text style={styles.savedNote}>Saved.</Text>}

      <View style={styles.disclaimerBox}>
        <FontAwesome5 name="info-circle" size={12} color={Colors.textMuted} style={{ marginTop: 2 }} />
        <Text style={styles.disclaimer}>
          This assistant provides guidance and support, not professional medical, legal, or emergency advice.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: FontSize.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionCard: {
    width: '31%', paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', gap: Spacing.xs,
  },
  optionCardActive: { borderColor: Colors.coral, backgroundColor: Colors.coralMuted },
  optionLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  optionLabelActive: { color: Colors.coral, fontWeight: '600' },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  themeCard: {
    width: '47%', padding: Spacing.md,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  themeCardActive: { borderColor: Colors.coral },
  themeSwatch: { width: 24, height: 24, borderRadius: 12 },
  themeSwatchSmall: { width: 16, height: 16, borderRadius: 8, marginLeft: -10 },
  themeLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  themeLabelActive: { color: Colors.coral, fontWeight: '600' },
  toneList: { gap: Spacing.sm },
  toneRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing.md,
  },
  toneRowActive: { borderColor: Colors.coral, backgroundColor: Colors.coralMuted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.coral },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.coral },
  toneLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  toneDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: Colors.coral, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full, alignItems: 'center',
    marginTop: Spacing.xl,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
  savedNote: { color: Colors.success, textAlign: 'center', marginTop: Spacing.sm, fontSize: FontSize.sm },
  disclaimerBox: {
    flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md,
    marginTop: Spacing.lg, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceDark,
    borderWidth: 1, borderColor: Colors.border,
  },
  disclaimer: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, flex: 1 },
});

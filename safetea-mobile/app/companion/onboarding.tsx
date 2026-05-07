import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import {
  useAiCompanionStore,
  COMPANION_NAME_SUGGESTIONS,
  COMPANION_AVATARS,
  COMPANION_TONES,
} from '../../store/aiCompanionStore';
import { api } from '../../services/api';

export default function CompanionOnboarding() {
  const { companionName, avatar, tone, setCompanionName, setAvatar, setTone, applyServerSettings } = useAiCompanionStore();
  const [name, setName] = useState(companionName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 40;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    setCompanionName(trimmed);

    const res = await api.saveCompanionSettings({
      companion_name: trimmed,
      avatar_style: avatar,
      theme_color: useAiCompanionStore.getState().theme,
      tone: tone,
    });

    if (res.error || res.status >= 400) {
      setError('Could not save. Check your connection and try again.');
      setSaving(false);
      return;
    }

    if (res.data?.settings) {
      applyServerSettings(res.data.settings as any);
    }
    setSaving(false);
    router.replace('/companion');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.heroIcon}>
          <FontAwesome5 name="user-shield" size={36} color={Colors.coral} />
        </View>
        <Text style={styles.title}>Meet Your Safety Companion</Text>
        <Text style={styles.subtitle}>
          This is your private AI support assistant. You can give it a name that feels comfortable to you.
        </Text>

        <Text style={styles.label}>Name your companion</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Type a name…"
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          maxLength={40}
          autoFocus
        />

        <Text style={styles.suggestionLabel}>Suggestions</Text>
        <View style={styles.suggestionRow}>
          {COMPANION_NAME_SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              style={[styles.suggestionChip, name === s && styles.suggestionChipActive]}
              onPress={() => setName(s)}
            >
              <Text style={[styles.suggestionText, name === s && styles.suggestionTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Avatar style</Text>
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

        <View style={styles.disclaimerBox}>
          <FontAwesome5 name="info-circle" size={12} color={Colors.textMuted} style={{ marginTop: 2 }} />
          <Text style={styles.disclaimer}>
            This assistant provides guidance and support, not professional medical, legal, or emergency advice.
          </Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          {saving
            ? <ActivityIndicator color={Colors.textInverse} />
            : <Text style={styles.saveBtnText}>Save Companion</Text>}
        </Pressable>

        <Pressable style={styles.skipBtn} onPress={() => router.back()}>
          <Text style={styles.skipText}>Not now</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xxl },
  heroIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.coralMuted,
    marginBottom: Spacing.md, alignSelf: 'center',
  },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 22 },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  suggestionChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  suggestionChipActive: { backgroundColor: Colors.coralMuted, borderColor: Colors.coral },
  suggestionText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  suggestionTextActive: { color: Colors.coral, fontWeight: '600' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionCard: {
    width: '31%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  optionCardActive: { borderColor: Colors.coral, backgroundColor: Colors.coralMuted },
  optionLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  optionLabelActive: { color: Colors.coral, fontWeight: '600' },
  toneList: { gap: Spacing.sm },
  toneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    gap: Spacing.md,
  },
  toneRowActive: { borderColor: Colors.coral, backgroundColor: Colors.coralMuted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.coral },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.coral },
  toneLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  toneDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  disclaimerBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceDark,
    borderWidth: 1, borderColor: Colors.border,
  },
  disclaimer: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, flex: 1 },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, marginTop: Spacing.md, textAlign: 'center' },
  saveBtn: {
    backgroundColor: Colors.coral,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
  skipBtn: { padding: Spacing.md, alignItems: 'center', marginTop: Spacing.xs },
  skipText: { color: Colors.textMuted, fontSize: FontSize.sm },
});

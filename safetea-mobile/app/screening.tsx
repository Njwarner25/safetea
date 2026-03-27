import { View, Text, TextInput, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useScreeningStore, ScreeningResult, TeaScoreLevel } from '../store/screeningStore';
import { useAuthStore } from '../store/authStore';

const PLATFORMS = ['Tinder', 'Hinge', 'Bumble', 'Other'];

const SCORE_COLORS: Record<TeaScoreLevel, string> = {
  safe: Colors.success,
  caution: Colors.warning,
  warning: '#F97316',
  danger: Colors.danger,
};

const MOCK_RED_FLAGS = [
  { id: 'rf1', label: 'Possible stolen photos', severity: 'high' as const, description: 'Profile photos match images found on stock photo sites.' },
  { id: 'rf2', label: 'New account', severity: 'medium' as const, description: 'Account created less than 7 days ago.' },
  { id: 'rf3', label: 'No social media linked', severity: 'low' as const, description: 'No connected Instagram or Spotify accounts.' },
];

const MOCK_GREEN_FLAGS = [
  { id: 'gf1', label: 'Detailed bio', description: 'Profile contains specific interests and hobbies.' },
  { id: 'gf2', label: 'Multiple photos', description: 'Profile has 5+ photos in different settings.' },
];

function getScoreLevel(score: number): TeaScoreLevel {
  if (score >= 75) return 'safe';
  if (score >= 50) return 'caution';
  if (score >= 25) return 'warning';
  return 'danger';
}

export default function ScreeningScreen() {
  const user = useAuthStore((s) => s.user);

  if (user?.tier === 'free') {
    return (
      <View style={styles.container}>
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>🔒</Text>
          <Text style={styles.gateTitle}>AI Screening is a SafeTea+ Feature</Text>
          <Text style={styles.gateDesc}>
            Scan dating profiles for red flags with our AI-powered screening tool. Upgrade to SafeTea+ to unlock.
          </Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>Upgrade to SafeTea+</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  const { history, currentScan, isScanning, startScan, completeScan, clearCurrentScan } = useScreeningStore();
  const [profileName, setProfileName] = useState('');
  const [platform, setPlatform] = useState('Tinder');

  const handleScan = () => {
    if (!profileName.trim()) return;
    startScan(profileName, platform);

    // Mock 2-second scan
    setTimeout(() => {
      const score = Math.floor(Math.random() * 60) + 20; // 20-80 range
      const result: ScreeningResult = {
        id: 'scan-' + Date.now(),
        profileName,
        platform,
        teaScore: score,
        teaScoreLevel: getScoreLevel(score),
        redFlags: score < 60 ? MOCK_RED_FLAGS : MOCK_RED_FLAGS.slice(0, 1),
        greenFlags: score >= 50 ? MOCK_GREEN_FLAGS : [],
        scannedAt: new Date().toISOString(),
      };
      completeScan(result);
      setProfileName('');
    }, 2000);
  };

  return (
    <FlatList
      style={styles.container}
      data={[]}
      renderItem={() => null}
      ListHeaderComponent={
        <View>
          <View style={styles.scanCard}>
            <Text style={styles.sectionTitle}>AI Profile Screening</Text>
            <Text style={styles.desc}>Enter a name and platform to scan for red flags.</Text>

            <TextInput
              style={styles.input}
              placeholder="Profile name"
              placeholderTextColor={Colors.textMuted}
              value={profileName}
              onChangeText={setProfileName}
            />

            <View style={styles.platformRow}>
              {PLATFORMS.map((p) => (
                <Pressable
                  key={p}
                  style={[styles.chip, platform === p && styles.chipActive]}
                  onPress={() => setPlatform(p)}
                >
                  <Text style={[styles.chipText, platform === p && styles.chipTextActive]}>{p}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.scanBtn, (isScanning || !profileName.trim()) && styles.scanBtnDisabled]}
              onPress={handleScan}
              disabled={isScanning || !profileName.trim()}
            >
              {isScanning ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.scanBtnText}>🔍 Scan Profile</Text>
              )}
            </Pressable>
          </View>

          {currentScan && (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Results: {currentScan.profileName}</Text>
              <Text style={styles.resultPlatform}>{currentScan.platform}</Text>

              <View style={styles.scoreCircle}>
                <View style={[styles.scoreRing, { borderColor: SCORE_COLORS[currentScan.teaScoreLevel] }]}>
                  <Text style={[styles.scoreNumber, { color: SCORE_COLORS[currentScan.teaScoreLevel] }]}>
                    {currentScan.teaScore}
                  </Text>
                  <Text style={styles.scoreLabel}>Tea Score</Text>
                </View>
              </View>
              <Text style={[styles.scoreLevelText, { color: SCORE_COLORS[currentScan.teaScoreLevel] }]}>
                {currentScan.teaScoreLevel.toUpperCase()}
              </Text>

              {currentScan.redFlags.length > 0 && (
                <View style={styles.flagSection}>
                  <Text style={styles.flagTitle}>🚩 Red Flags</Text>
                  {currentScan.redFlags.map((flag) => (
                    <View key={flag.id} style={styles.flagItem}>
                      <Text style={styles.flagLabel}>{flag.label}</Text>
                      <Text style={styles.flagDesc}>{flag.description}</Text>
                      <View style={[styles.severityBadge, { backgroundColor: flag.severity === 'high' ? Colors.dangerMuted : flag.severity === 'medium' ? Colors.warningMuted : Colors.infoMuted }]}>
                        <Text style={[styles.severityText, { color: flag.severity === 'high' ? Colors.danger : flag.severity === 'medium' ? Colors.warning : Colors.info }]}>{flag.severity}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {currentScan.greenFlags.length > 0 && (
                <View style={styles.flagSection}>
                  <Text style={styles.flagTitle}>✅ Green Flags</Text>
                  {currentScan.greenFlags.map((flag) => (
                    <View key={flag.id} style={styles.flagItem}>
                      <Text style={styles.flagLabel}>{flag.label}</Text>
                      <Text style={styles.flagDesc}>{flag.description}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Pressable style={styles.clearBtn} onPress={clearCurrentScan}>
                <Text style={styles.clearBtnText}>Clear Results</Text>
              </Pressable>
            </View>
          )}

          {history.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Scan History</Text>
              {history.map((item) => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyName}>{item.profileName}</Text>
                    <Text style={[styles.historyScore, { color: SCORE_COLORS[item.teaScoreLevel] }]}>
                      {item.teaScore}
                    </Text>
                  </View>
                  <Text style={styles.historyMeta}>
                    {item.platform} · {new Date(item.scannedAt).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  scanCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  input: {
    backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: FontSize.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  platformRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, flexWrap: 'wrap' },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceLight },
  chipActive: { borderColor: Colors.coral, backgroundColor: Colors.coralMuted },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chipTextActive: { color: Colors.coral, fontWeight: '600' },
  scanBtn: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  scanBtnDisabled: { opacity: 0.5 },
  scanBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  resultCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg },
  resultTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  resultPlatform: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  scoreCircle: { alignItems: 'center', marginVertical: Spacing.lg },
  scoreRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 6, justifyContent: 'center', alignItems: 'center' },
  scoreNumber: { fontSize: 36, fontWeight: '800' },
  scoreLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  scoreLevelText: { textAlign: 'center', fontWeight: '700', fontSize: FontSize.md, marginBottom: Spacing.lg },
  flagSection: { marginBottom: Spacing.md },
  flagTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  flagItem: { backgroundColor: Colors.surfaceLight, padding: Spacing.md, borderRadius: BorderRadius.sm, marginBottom: Spacing.xs },
  flagLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  flagDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  severityBadge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm, marginTop: Spacing.xs },
  severityText: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  clearBtn: { borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.sm },
  clearBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  section: { marginBottom: Spacing.lg },
  historyCard: { backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  historyScore: { fontSize: FontSize.lg, fontWeight: '800' },
  historyMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  gateCard: {
    margin: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  gateIcon: { fontSize: 48, marginBottom: Spacing.md },
  gateTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' },
  gateDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  upgradeBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  upgradeBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
});

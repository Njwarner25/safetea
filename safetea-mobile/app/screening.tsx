import { View, Text, TextInput, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useScreeningStore, ScreeningResult, TeaScoreLevel, RedFlag, GreenFlag } from '../store/screeningStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

const PLATFORMS = ['Tinder', 'Hinge', 'Bumble', 'Other'];

const SCORE_COLORS: Record<TeaScoreLevel, string> = {
  safe: Colors.success,
  caution: Colors.warning,
  warning: '#F97316',
  danger: Colors.danger,
};

function getScoreLevel(score: number): TeaScoreLevel {
  if (score >= 75) return 'safe';
  if (score >= 50) return 'caution';
  if (score >= 25) return 'warning';
  return 'danger';
}

function buildFlags(data: any): { redFlags: RedFlag[]; greenFlags: GreenFlag[]; score: number } {
  const redFlags: RedFlag[] = [];
  const greenFlags: GreenFlag[] = [];
  let score = 70; // baseline

  const profiles = data?.profiles || data?.results || [];
  if (Array.isArray(profiles) && profiles.length > 0) {
    greenFlags.push({ id: 'gf-found', label: 'Public profiles found', description: `Found ${profiles.length} matching public profile(s).` });
  } else {
    redFlags.push({ id: 'rf-noprofile', label: 'No public profiles found', severity: 'medium', description: 'Could not find matching public profiles for this name.' });
    score -= 15;
  }

  if (data?.criminal_records || data?.criminalRecords) {
    const records = data.criminal_records || data.criminalRecords;
    if (Array.isArray(records) && records.length > 0) {
      redFlags.push({ id: 'rf-criminal', label: 'Criminal records found', severity: 'high', description: `Found ${records.length} criminal record(s) associated with this name.` });
      score -= 30;
    } else {
      greenFlags.push({ id: 'gf-nocriminal', label: 'No criminal records', description: 'No criminal records found for this name.' });
    }
  }

  if (data?.sex_offender || data?.sexOffender) {
    redFlags.push({ id: 'rf-so', label: 'Sex offender registry match', severity: 'high', description: 'Name matches a sex offender registry entry.' });
    score -= 40;
  }

  if (data?.data_brokers || data?.dataBrokers) {
    const brokers = data.data_brokers || data.dataBrokers;
    if (Array.isArray(brokers) && brokers.length > 0) {
      greenFlags.push({ id: 'gf-verified', label: 'Identity verified via data brokers', description: `Name appears in ${brokers.length} data broker profile(s), suggesting a real identity.` });
      score += 5;
    }
  }

  return { redFlags, greenFlags, score: Math.max(0, Math.min(100, score)) };
}

export default function ScreeningScreen() {
  const user = useAuthStore((s) => s.user);
  const { history, currentScan, isScanning, startScan, completeScan, clearCurrentScan } = useScreeningStore();
  const [profileName, setProfileName] = useState('');
  const [platform, setPlatform] = useState('Tinder');
  const [scanError, setScanError] = useState<string | null>(null);

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

  const handleScan = async () => {
    if (!profileName.trim()) return;
    startScan(profileName, platform);
    setScanError(null);

    try {
      const res = await api.screenProfile(profileName.trim(), platform);
      if (res.status === 200 && res.data) {
        const d = res.data as any;
        const score = d.catfishScore ?? d.teaScore ?? 50;
        const redFlags = (d.redFlags || []).map((f: any, i: number) => ({
          id: 'rf-' + i,
          label: typeof f === 'string' ? f : f.label || f.flag || 'Unknown',
          severity: (f.severity || 'medium') as 'low' | 'medium' | 'high',
          description: typeof f === 'string' ? f : f.description || f.detail || '',
        }));
        const greenFlags = (d.greenFlags || []).map((f: any, i: number) => ({
          id: 'gf-' + i,
          label: typeof f === 'string' ? f : f.label || f.flag || 'Unknown',
          description: typeof f === 'string' ? f : f.description || f.detail || '',
        }));
        const result: ScreeningResult = {
          id: 'scan-' + Date.now(),
          profileName,
          platform,
          teaScore: score,
          teaScoreLevel: getScoreLevel(score),
          redFlags,
          greenFlags,
          scannedAt: new Date().toISOString(),
        };
        completeScan(result);
        setProfileName('');
      } else {
        setScanError((res.data as any)?.error || 'Could not complete the scan. Please try again.');
        clearCurrentScan();
      }
    } catch {
      setScanError('Network error. Check your connection and try again.');
      clearCurrentScan();
    }
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
              placeholder="Full name"
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

            {scanError && (
              <Text style={styles.errorText}>{scanError}</Text>
            )}
          </View>

          {currentScan && !scanError && (
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
  errorText: { color: Colors.danger, fontSize: FontSize.sm, marginTop: Spacing.sm, textAlign: 'center' },
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

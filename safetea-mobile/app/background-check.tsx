import { View, Text, TextInput, StyleSheet, Pressable, FlatList, ActivityIndicator, Linking } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useCityStore } from '../store/cityStore';
import { useBackgroundCheckStore } from '../store/backgroundCheckStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import NameFeedIntegration from '../components/community/NameFeedIntegration';

const RISK_COLORS: Record<string, string> = {
  low: Colors.success,
  medium: Colors.warning,
  high: Colors.danger,
};

const SECTION_CONFIG: Array<{ key: string; label: string; icon: string }> = [
  { key: 'socialMedia', label: 'Social Media', icon: '👤' },
  { key: 'mugshots', label: 'Mugshots', icon: '📸' },
  { key: 'criminalRecords', label: 'Criminal Records', icon: '⚖️' },
  { key: 'sexOffenderRegistry', label: 'Sex Offender Registry', icon: '🚨' },
  { key: 'dataBrokers', label: 'Data Brokers', icon: '🔍' },
  { key: 'courtRecords', label: 'Court Records', icon: '🏛️' },
  { key: 'news', label: 'News & Public Mentions', icon: '📰' },
];

function getSectionStatus(section: any): { label: string; color: string } {
  if (!section) return { label: 'N/A', color: Colors.textMuted };
  const s = section.status;
  if (s === 'found') return { label: `${section.count} found`, color: Colors.danger };
  if (s === 'exposed') return { label: `${section.count} sites`, color: Colors.warning };
  if (s === 'clear' || s === 'not_found') return { label: 'Clear', color: Colors.success };
  if (s === 'none') return { label: 'None found', color: Colors.textMuted };
  return { label: s, color: Colors.textMuted };
}

export default function BackgroundCheckScreen() {
  const user = useAuthStore((s) => s.user);

  // SafeTea+ tier gate (accepts 'plus' or legacy 'pro')
  if (user?.tier !== 'plus' && user?.tier !== 'pro') {
    return (
      <View style={styles.container}>
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>🔒</Text>
          <Text style={styles.gateTitle}>Background Check is a SafeTea+ Feature</Text>
          <Text style={styles.gateDesc}>
            Run comprehensive public records searches across criminal records, court filings, social media, and more. Upgrade to SafeTea+ to unlock.
          </Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>Upgrade to SafeTea+</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [isMentionsOpen, setIsMentionsOpen] = useState(false);
  const selectedCity = useCityStore((s) => s.getSelectedCity());
  const { bgResult, bgLoading, bgError, bgHistory, setBgLoading, setBgResult, setBgError, clearBgResult } = useBackgroundCheckStore();

  const state = selectedCity?.state || '';
  const city = selectedCity?.name || '';

  const handleSearch = async () => {
    if (!fullName.trim()) return;
    setBgLoading(true);
    try {
      const res = await api.backgroundCheck(fullName.trim(), city, state, age ? parseInt(age) : undefined);
      if (res.error) {
        setBgError(res.error);
        return;
      }
      const d = res.data;
      setBgResult({
        id: 'bg-' + Date.now(),
        subject: d.subject,
        location: d.location,
        searchedAt: d.searchedAt,
        riskScore: d.riskAssessment?.score || 0,
        riskLevel: d.riskAssessment?.level || 'low',
        riskFlags: d.riskAssessment?.flags || [],
        sections: d.sections || {},
      });
      setFullName('');
      setAge('');
    } catch (e) {
      setBgError('Network error. Please try again.');
    }
  };

  const riskColor = bgResult ? RISK_COLORS[bgResult.riskLevel] || Colors.textMuted : Colors.textMuted;

  return (
    <FlatList
      style={styles.container}
      data={[]}
      renderItem={() => null}
      ListHeaderComponent={
        <View>
          <View style={styles.card}>
            <Text style={styles.title}>Background Check</Text>
            <Text style={styles.desc}>
              Comprehensive public records search across social media, criminal records, court filings, and more.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Full name (e.g. John Smith)"
              placeholderTextColor={Colors.textMuted}
              value={fullName}
              onChangeText={setFullName}
            />

            <TextInput
              style={styles.input}
              placeholder="Age (optional)"
              placeholderTextColor={Colors.textMuted}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
            />

            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Location:</Text>
              <Text style={styles.locationValue}>
                {city && state ? `${city}, ${state}` : 'Select a city in Settings'}
              </Text>
            </View>

            <Pressable
              style={[styles.searchBtn, (bgLoading || !fullName.trim()) && styles.btnDisabled]}
              onPress={handleSearch}
              disabled={bgLoading || !fullName.trim()}
            >
              {bgLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.searchBtnText}>Run Background Check</Text>
              )}
            </Pressable>
          </View>

          {bgError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{bgError}</Text>
            </View>
          )}

          {bgResult && (
            <>
              {/* Risk Score Ring */}
              <View style={styles.card}>
                <Text style={styles.resultName}>{bgResult.subject}</Text>
                <Text style={styles.resultMeta}>{bgResult.location}</Text>

                <View style={styles.scoreCircle}>
                  <View style={[styles.scoreRing, { borderColor: riskColor }]}>
                    <Text style={[styles.scoreNumber, { color: riskColor }]}>{bgResult.riskScore}</Text>
                    <Text style={styles.scoreLabel}>Risk Score</Text>
                  </View>
                </View>
                <Text style={[styles.riskLevel, { color: riskColor }]}>
                  {bgResult.riskLevel.toUpperCase()} RISK
                </Text>

                {bgResult.riskFlags.length > 0 && (
                  <View style={styles.flagList}>
                    {bgResult.riskFlags.map((flag, i) => (
                      <View key={i} style={styles.flagItem}>
                        <Text style={styles.flagDot}>•</Text>
                        <Text style={styles.flagText}>{flag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Section Results */}
              {SECTION_CONFIG.map(({ key, label, icon }) => {
                const section = bgResult.sections[key];
                if (!section) return null;
                const status = getSectionStatus(section);
                const items = section.results || section.profiles || section.sites || [];

                return (
                  <View key={key} style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionIcon}>{icon}</Text>
                      <Text style={styles.sectionLabel}>{label}</Text>
                      <Text style={[styles.sectionStatus, { color: status.color }]}>{status.label}</Text>
                    </View>

                    {items.length > 0 && items.map((item: any, i: number) => (
                      <Pressable
                        key={i}
                        style={styles.resultItem}
                        onPress={() => item.url && Linking.openURL(item.url)}
                      >
                        <Text style={styles.resultItemTitle} numberOfLines={2}>
                          {item.title || item.platform || item.site || 'Result'}
                        </Text>
                        <Text style={styles.resultSnippet} numberOfLines={2}>
                          {item.snippet || item.note || ''}
                        </Text>
                        {item.url && <Text style={styles.resultLink}>View →</Text>}
                      </Pressable>
                    ))}

                    {section.note && items.length === 0 && (
                      <Text style={styles.sectionNote}>{section.note}</Text>
                    )}
                  </View>
                );
              })}

              <Pressable style={styles.clearBtn} onPress={clearBgResult}>
                <Text style={styles.clearBtnText}>Clear Results</Text>
              </Pressable>
            </>
          )}

          {bgHistory.length > 0 && !bgResult && (
            <View style={styles.section}>
              <Text style={styles.title}>Check History</Text>
              {bgHistory.map((item) => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyRow}>
                    <Text style={styles.historyName}>{item.subject}</Text>
                    <Text style={[styles.historyScore, { color: RISK_COLORS[item.riskLevel] }]}>
                      {item.riskScore}
                    </Text>
                  </View>
                  <Text style={styles.historyMeta}>
                    {item.location} · {new Date(item.searchedAt).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {bgResult && city ? (
            <View style={styles.card}>
              <Text style={styles.title}>Community Mentions</Text>
              <Text style={styles.desc}>
                Check whether this name appears in Tea Talk or Good Guys posts in {city}.
              </Text>
              <Pressable
                style={styles.mentionsBtn}
                onPress={() => setIsMentionsOpen((prev) => !prev)}
              >
                <Text style={styles.mentionsBtnText}>
                  {isMentionsOpen ? 'Hide Community Mentions' : 'Show Community Mentions'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {isMentionsOpen && bgResult ? (
            <NameFeedIntegration
              fullName={bgResult.subject}
              city={city}
              state={state}
              isOpen={isMentionsOpen}
              onClose={() => setIsMentionsOpen(false)}
            />
          ) : null}

          <Text style={styles.fcraNotice}>
            FCRA Notice: Information provided is for personal safety purposes only. This is not a consumer report under the Fair Credit Reporting Act. All data sourced from publicly available records.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  input: {
    backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: FontSize.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg, gap: Spacing.sm },
  locationLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  locationValue: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  searchBtn: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  searchBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  errorCard: { backgroundColor: Colors.dangerMuted, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  errorText: { color: Colors.danger, fontSize: FontSize.sm },
  resultName: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  resultMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  scoreCircle: { alignItems: 'center', marginVertical: Spacing.lg },
  scoreRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 6, justifyContent: 'center', alignItems: 'center' },
  scoreNumber: { fontSize: 36, fontWeight: '800' },
  scoreLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  riskLevel: { textAlign: 'center', fontWeight: '700', fontSize: FontSize.md, marginBottom: Spacing.md },
  flagList: { marginTop: Spacing.sm },
  flagItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.xs, gap: Spacing.sm },
  flagDot: { color: Colors.danger, fontSize: FontSize.md },
  flagText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  sectionCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  sectionIcon: { fontSize: 20 },
  sectionLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  sectionStatus: { fontSize: FontSize.sm, fontWeight: '600' },
  sectionNote: { fontSize: FontSize.sm, color: Colors.textMuted },
  resultItem: { backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.xs },
  resultItemTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  resultSnippet: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  resultLink: { fontSize: FontSize.xs, color: Colors.info, marginTop: Spacing.xs },
  clearBtn: { borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg },
  clearBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  section: { marginBottom: Spacing.lg },
  historyCard: { backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  historyScore: { fontSize: FontSize.lg, fontWeight: '800' },
  historyMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  mentionsBtn: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  mentionsBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  fcraNotice: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, padding: Spacing.md },
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
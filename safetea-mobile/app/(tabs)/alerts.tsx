import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useNameWatchStore } from '../../store/nameWatchStore';
import { usePostStore } from '../../store/postStore';
import { useAuthStore } from '../../store/authStore';
import { getCityByNumericId } from '../../constants/cities';
import { api } from '../../services/api';

const CATEGORY_MAP: Record<string, { label: string; severity: 'high' | 'medium'; icon: string }> = {
  sexual_assault: { label: 'Sexual Assault', severity: 'high', icon: '🚨' },
  assault: { label: 'Assault', severity: 'high', icon: '⚠️' },
  domestic_violence: { label: 'Domestic Violence', severity: 'high', icon: '🚨' },
  stalking: { label: 'Stalking', severity: 'high', icon: '🚨' },
  kidnapping: { label: 'Kidnapping', severity: 'high', icon: '🚨' },
  human_trafficking: { label: 'Human Trafficking', severity: 'high', icon: '🚨' },
  harassment: { label: 'Harassment', severity: 'medium', icon: '⚠️' },
  robbery: { label: 'Robbery', severity: 'medium', icon: '⚠️' },
  indecent_exposure: { label: 'Indecent Exposure', severity: 'medium', icon: '⚠️' },
};

function MatchTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = { exact: 'Exact Match', initials: 'Initials Match', partial: 'Partial Match' };
  return (
    <View style={styles.matchTypeBadge}>
      <Text style={styles.matchTypeText}>{labels[type] || type}</Text>
    </View>
  );
}

export default function AlertsScreen() {
  const { matches, watchedNames, markMatchRead } = useNameWatchStore();
  const posts = usePostStore((s) => s.posts);
  const user = useAuthStore((s) => s.user);

  const [crimeAlerts, setCrimeAlerts] = useState<any[]>([]);
  const [crimeLoading, setCrimeLoading] = useState(true);
  const [crimeError, setCrimeError] = useState<string | null>(null);
  const [cityName, setCityName] = useState('');

  const getPost = (postId: string) => posts.find((p) => p.id === postId);
  const getEntryName = (entryId: string) => watchedNames.find((e) => e.id === entryId)?.displayName || 'Unknown';

  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const fetchCrimeAlerts = useCallback(async () => {
    if (!user?.cityId) return;
    const city = getCityByNumericId(user.cityId);
    if (!city?.lat || !city?.lon) return;

    setCityName(city.name);
    setCrimeLoading(true);
    setCrimeError(null);

    try {
      const res = await api.getAreaAlerts(city.lat, city.lon, 2, 30);
      if (res.error) {
        setCrimeError('Unable to load safety alerts');
      } else {
        setCrimeAlerts(Array.isArray(res.data) ? res.data : (res.data as any)?.alerts || []);
      }
    } catch {
      setCrimeError('Unable to load safety alerts');
    } finally {
      setCrimeLoading(false);
    }
  }, [user?.cityId]);

  useEffect(() => {
    fetchCrimeAlerts();
  }, [fetchCrimeAlerts]);

  const getAlertStyle = (category: string) => {
    const info = CATEGORY_MAP[category];
    if (!info) return {};
    return info.severity === 'high' ? styles.dangerCard : styles.warningCard;
  };

  const getAlertInfo = (category: string) => {
    return CATEGORY_MAP[category] || { label: category.replace(/_/g, ' '), severity: 'medium' as const, icon: '⚠️' };
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View>
            {/* Name Watch Alerts Section */}
            {matches.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Name Watch Alerts</Text>
                  <Pressable onPress={() => router.push('/name-watch')}>
                    <Text style={styles.sectionLink}>Manage</Text>
                  </Pressable>
                </View>

                {matches.length > 0 && !matches[0].isRead && (
                  <View style={styles.inlineExplainer}>
                    <Text style={styles.inlineExplainerText}>
                      Name Watch Alert — A post matched one of your watched names. Tap to view.
                    </Text>
                  </View>
                )}

                {matches.map((match) => {
                  const post = getPost(match.postId);
                  return (
                    <Pressable
                      key={match.id}
                      style={[styles.alertCard, styles.nameWatchCard, !match.isRead && styles.unreadCard]}
                      onPress={() => markMatchRead(match.id)}
                    >
                      <Text style={styles.alertIcon}>👁️</Text>
                      <View style={styles.alertContent}>
                        <View style={styles.matchHeader}>
                          <Text style={styles.alertTitle}>
                            Match: {getEntryName(match.entryId)}
                          </Text>
                          <MatchTypeLabel type={match.matchType} />
                        </View>
                        <Text style={styles.alertMessage} numberOfLines={2}>
                          {post
                            ? `"${post.title}" — ${post.content.slice(0, 80)}${post.content.length > 80 ? '...' : ''}`
                            : 'Post no longer available'}
                        </Text>
                        <Text style={styles.matchedTerm}>
                          Matched: "{match.matchedTerm}"
                        </Text>
                        <Text style={styles.alertTime}>{formatTime(match.timestamp)}</Text>
                      </View>
                      {!match.isRead && <View style={styles.unreadDot} />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {matches.length === 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Name Watch</Text>
                  <Pressable onPress={() => router.push('/name-watch')}>
                    <Text style={styles.sectionLink}>Set Up</Text>
                  </Pressable>
                </View>
                <View style={styles.emptyNameWatch}>
                  <Text style={styles.emptyText}>
                    Monitor names of people you're dating. Get alerts when they're posted about.
                  </Text>
                </View>
              </View>
            )}

            {/* Safety Alerts Near You */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Safety Alerts{cityName ? ` — ${cityName}` : ''}
                </Text>
                <Pressable onPress={fetchCrimeAlerts}>
                  <Text style={styles.sectionLink}>Refresh</Text>
                </Pressable>
              </View>

              {crimeLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={Colors.coral} size="small" />
                  <Text style={styles.loadingText}>Loading safety alerts...</Text>
                </View>
              )}

              {crimeError && !crimeLoading && (
                <View style={styles.emptyNameWatch}>
                  <Text style={styles.emptyText}>{crimeError}</Text>
                </View>
              )}

              {!crimeLoading && !crimeError && crimeAlerts.length === 0 && (
                <View style={styles.emptyNameWatch}>
                  <Text style={styles.emptyText}>No recent safety alerts in your area</Text>
                </View>
              )}

              {!crimeLoading && !crimeError && crimeAlerts.length > 0 && (
                <>
                  <View style={styles.summaryBar}>
                    <Text style={styles.summaryText}>
                      {crimeAlerts.length} incident{crimeAlerts.length !== 1 ? 's' : ''} within 2 miles in the last 30 days
                    </Text>
                  </View>

                  {crimeAlerts.map((alert: any, index: number) => {
                    const info = getAlertInfo(alert.safety_category || alert.category);
                    const distance = alert.distance_miles != null
                      ? `${Number(alert.distance_miles).toFixed(1)} mi away`
                      : '';
                    return (
                      <View
                        key={alert.id || index}
                        style={[styles.alertCard, getAlertStyle(alert.safety_category || alert.category)]}
                      >
                        <Text style={styles.alertIcon}>{info.icon}</Text>
                        <View style={styles.alertContent}>
                          <Text style={styles.alertTitle}>{info.label}</Text>
                          <Text style={styles.alertMessage} numberOfLines={2}>
                            {alert.description || alert.block || 'Reported incident'}
                          </Text>
                          <View style={styles.crimeMetaRow}>
                            {distance ? <Text style={styles.crimeDistance}>{distance}</Text> : null}
                            <Text style={styles.alertTime}>
                              {alert.date ? formatTime(alert.date) : ''}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.md, gap: Spacing.sm },

  // Sections
  section: { marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionLink: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.coral },

  // Alert cards
  alertCard: {
    flexDirection: 'row', backgroundColor: Colors.surface, padding: Spacing.md,
    borderRadius: BorderRadius.md, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  nameWatchCard: { borderColor: Colors.coralMuted },
  unreadCard: { borderColor: Colors.coral, backgroundColor: 'rgba(232, 81, 63, 0.05)' },
  dangerCard: { borderColor: Colors.danger, backgroundColor: Colors.dangerMuted },
  warningCard: { borderColor: Colors.warning, backgroundColor: Colors.warningMuted },
  alertIcon: { fontSize: 24 },
  alertContent: { flex: 1 },
  alertTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  alertMessage: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  alertTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },

  // Crime alert meta
  crimeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  crimeDistance: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.coral },

  // Summary bar
  summaryBar: {
    backgroundColor: Colors.surfaceLight, padding: Spacing.sm, borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  summaryText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },

  // Loading
  loadingContainer: {
    backgroundColor: Colors.surface, padding: Spacing.lg, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm,
  },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted },

  // Name Watch specific
  matchHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  matchTypeBadge: {
    backgroundColor: Colors.coralMuted, paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  matchTypeText: { fontSize: FontSize.xs, color: Colors.coral, fontWeight: '600' },
  matchedTerm: { fontSize: FontSize.xs, color: Colors.coral, marginTop: 4, fontStyle: 'italic' },
  unreadDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.coral, alignSelf: 'center',
  },

  // Inline explainer
  inlineExplainer: {
    backgroundColor: Colors.coralMuted, padding: Spacing.sm, borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  inlineExplainerText: { fontSize: FontSize.xs, color: Colors.coral, fontWeight: '500' },

  // Empty Name Watch
  emptyNameWatch: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
});

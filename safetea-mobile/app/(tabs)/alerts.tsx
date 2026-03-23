import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useNameWatchStore } from '../../store/nameWatchStore';
import { usePostStore } from '../../store/postStore';

const SYSTEM_ALERTS = [
  { id: 'sys-1', type: 'community', title: 'New Safety Advisory', message: 'Multiple reports of suspicious activity near downtown area.', time: '2h ago', icon: '🚨' },
  { id: 'sys-2', type: 'amber', title: 'AMBER Alert - Metro Area', message: 'Missing person alert issued for the metro area. Check local news for details.', time: '4h ago', icon: '🟡' },
  { id: 'sys-3', type: 'system', title: 'Post Approved', message: 'Your recent safety report has been reviewed and published.', time: '1d ago', icon: '✅' },
];

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

            {/* Community & System Alerts */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Community Alerts</Text>
              {SYSTEM_ALERTS.map((item) => (
                <Pressable key={item.id} style={[styles.alertCard, item.type === 'amber' && styles.amberCard]}>
                  <Text style={styles.alertIcon}>{item.icon}</Text>
                  <View style={styles.alertContent}>
                    <Text style={styles.alertTitle}>{item.title}</Text>
                    <Text style={styles.alertMessage}>{item.message}</Text>
                    <Text style={styles.alertTime}>{item.time}</Text>
                  </View>
                </Pressable>
              ))}
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
  sectionLink: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.pink },

  // Alert cards
  alertCard: {
    flexDirection: 'row', backgroundColor: Colors.surface, padding: Spacing.md,
    borderRadius: BorderRadius.md, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  nameWatchCard: { borderColor: Colors.pinkGlow },
  unreadCard: { borderColor: Colors.pink, backgroundColor: 'rgba(232, 160, 181, 0.05)' },
  amberCard: { borderColor: Colors.warning, backgroundColor: Colors.warningMuted },
  alertIcon: { fontSize: 24 },
  alertContent: { flex: 1 },
  alertTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  alertMessage: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  alertTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },

  // Name Watch specific
  matchHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  matchTypeBadge: {
    backgroundColor: Colors.pinkGlow, paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  matchTypeText: { fontSize: FontSize.xs, color: Colors.pink, fontWeight: '600' },
  matchedTerm: { fontSize: FontSize.xs, color: Colors.pink, marginTop: 4, fontStyle: 'italic' },
  unreadDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.pink, alignSelf: 'center',
  },

  // Inline explainer
  inlineExplainer: {
    backgroundColor: Colors.pinkGlow, padding: Spacing.sm, borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  inlineExplainerText: { fontSize: FontSize.xs, color: Colors.pink, fontWeight: '500' },

  // Empty Name Watch
  emptyNameWatch: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
});

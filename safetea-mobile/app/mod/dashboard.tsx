import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const MOD_ROLES = ['mod', 'senior_mod', 'city_lead', 'admin', 'moderator'];

interface QueuePost {
  id: string;
  title: string;
  content: string;
  category: string;
  author_name: string;
  created_at: string;
  report_count?: number;
  status: string;
}

export default function ModDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [queue, setQueue] = useState<QueuePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [stats, setStats] = useState({ pending: 0, reviewed: 0, flagged: 0 });

  if (!user || !MOD_ROLES.includes(user.role)) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.title}>Moderator Access Required</Text>
          <Text style={styles.desc}>
            This area is restricted to {APP_NAME} moderators. If you're interested in helping keep the community safe, you can apply to become a moderator.
          </Text>
          <Pressable style={styles.applyBtn} onPress={() => router.push('/mod/apply')}>
            <Text style={styles.applyBtnText}>Apply to Moderate</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getModQueueItems();
      if (res.status === 200 && res.data) {
        const data = res.data as any;
        const posts = data.posts || data.queue || [];
        setQueue(Array.isArray(posts) ? posts : []);
        setStats({
          pending: data.pending_count ?? posts.length ?? 0,
          reviewed: data.reviewed_today ?? 0,
          flagged: data.flagged_count ?? 0,
        });
      }
    } catch { /* use empty state */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleModerate = async (postId: string, action: 'approve' | 'reject' | 'flag') => {
    setActionLoading(postId);
    try {
      const res = await api.moderatePostAction(postId, action);
      if (res.status >= 200 && res.status < 300) {
        setQueue((prev) => prev.filter((p) => p.id !== postId));
        setStats((prev) => ({
          ...prev,
          pending: Math.max(0, prev.pending - 1),
          reviewed: prev.reviewed + 1,
          flagged: action === 'flag' ? prev.flagged + 1 : prev.flagged,
        }));
      } else {
        Alert.alert('Error', (res.data as any)?.error || 'Action failed.');
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach the server.');
    }
    setActionLoading(null);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Mod Dashboard</Text>
      <Text style={styles.subheading}>Welcome back, {user.pseudonym}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pending Review</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.reviewed}</Text>
          <Text style={styles.statLabel}>Reviewed Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.flagged}</Text>
          <Text style={styles.statLabel}>Flagged Posts</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Review Queue</Text>
          <Pressable onPress={fetchQueue}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={Colors.coral} style={{ padding: Spacing.lg }} />
        ) : queue.length === 0 ? (
          <Text style={styles.emptyText}>No posts pending review. Check back later.</Text>
        ) : (
          queue.map((post) => (
            <View key={post.id} style={styles.queueItem}>
              <View style={styles.queueHeader}>
                <Text style={styles.queueTitle} numberOfLines={1}>{post.title}</Text>
                <Text style={styles.queueCategory}>{post.category}</Text>
              </View>
              <Text style={styles.queueContent} numberOfLines={3}>{post.content}</Text>
              <Text style={styles.queueMeta}>
                by {post.author_name || 'Anonymous'} · {new Date(post.created_at).toLocaleDateString()}
                {post.report_count ? ` · ${post.report_count} reports` : ''}
              </Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.approveBtn, actionLoading === post.id && styles.btnDisabled]}
                  onPress={() => handleModerate(post.id, 'approve')}
                  disabled={actionLoading === post.id}
                >
                  <Text style={styles.approveBtnText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={[styles.flagBtn, actionLoading === post.id && styles.btnDisabled]}
                  onPress={() => handleModerate(post.id, 'flag')}
                  disabled={actionLoading === post.id}
                >
                  <Text style={styles.flagBtnText}>Flag</Text>
                </Pressable>
                <Pressable
                  style={[styles.rejectBtn, actionLoading === post.id && styles.btnDisabled]}
                  onPress={() => handleModerate(post.id, 'reject')}
                  disabled={actionLoading === post.id}
                >
                  <Text style={styles.rejectBtnText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  heading: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  subheading: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.xl },
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  lockIcon: { fontSize: 48, marginBottom: Spacing.md, textAlign: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  applyBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignSelf: 'center' },
  applyBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statNumber: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.coral },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  refreshText: { color: Colors.coral, fontWeight: '600', fontSize: FontSize.sm },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },
  queueItem: {
    backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md, padding: Spacing.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  queueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  queueTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  queueCategory: { fontSize: FontSize.xs, color: Colors.coral, fontWeight: '600', textTransform: 'uppercase' },
  queueContent: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.xs },
  queueMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  approveBtn: { flex: 1, backgroundColor: Colors.success, padding: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  approveBtnText: { color: '#FFF', fontWeight: '600', fontSize: FontSize.sm },
  flagBtn: { flex: 1, backgroundColor: Colors.warning, padding: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  flagBtnText: { color: '#FFF', fontWeight: '600', fontSize: FontSize.sm },
  rejectBtn: { flex: 1, backgroundColor: Colors.danger, padding: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  rejectBtnText: { color: '#FFF', fontWeight: '600', fontSize: FontSize.sm },
  btnDisabled: { opacity: 0.5 },
});

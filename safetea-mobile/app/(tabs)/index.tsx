import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { usePostStore, PostCategory, Post } from '../../store/postStore';
import { useCityStore } from '../../store/cityStore';
import { getAvatarById } from '../../constants/avatars';
import { truncateText } from '../../utils/validators';
import { api } from '../../services/api';
import ReportModal from '../../components/ReportModal';

const FILTER_OPTIONS: { key: PostCategory | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '📋' },
  { key: 'warning', label: 'Warnings', icon: '⚠️' },
  { key: 'positive', label: 'Positive', icon: '💚' },
  { key: 'question', label: 'Questions', icon: '❓' },
  { key: 'alert', label: 'Alerts', icon: '🚨' },
];

function PostCard({ post, onReport }: { post: Post; onReport: (id: string) => void }) {
  const avatar = getAvatarById(post.authorAvatarId);
  const categoryColors: Record<PostCategory, string> = {
    warning: Colors.warning,
    positive: Colors.success,
    question: Colors.info,
    alert: Colors.danger,
  };

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push('/post/' + post.id)}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.avatarCircle, { backgroundColor: avatar?.backgroundColor || Colors.coral }]}>
          <Text style={styles.avatarEmoji}>{avatar?.emoji || '👤'}</Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.pseudonym}>{post.authorPseudonym}</Text>
          <Text style={styles.timestamp}>{new Date(post.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: categoryColors[post.category] + '20' }]}>
          <Text style={[styles.categoryText, { color: categoryColors[post.category] }]}>
            {post.category}
          </Text>
        </View>
        <Pressable
          style={styles.reportTrigger}
          onPress={(e) => { e.stopPropagation(); onReport(post.id); }}
          hitSlop={8}
        >
          <Text style={styles.reportTriggerText}>⋯</Text>
        </Pressable>
      </View>
      <Text style={styles.cardTitle}>{post.title}</Text>
      <Text style={styles.cardContent}>{truncateText(post.content, 150)}</Text>
      <View style={styles.cardActions}>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionText}>▲ {post.upvotes}</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionText}>▼ {post.downvotes}</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionText}>💬 {post.commentCount}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function FeedScreen() {
  const { filter, setFilter, getFilteredPosts, setPosts, setLoading } = usePostStore();
  const { getSelectedCity } = useCityStore();
  const [refreshing, setRefreshing] = useState(false);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const city = getSelectedCity();
  const posts = getFilteredPosts();

  const fetchPosts = useCallback(async () => {
    if (!city) return;
    try {
      const res = await api.getPosts(city.id);
      if (!res.error && res.data) {
        const items = Array.isArray(res.data) ? res.data : (res.data as any)?.posts || [];
        if (items.length > 0) setPosts(items);
      }
    } catch {
      // Network error — keep existing posts
    }
  }, [city?.id, setPosts]);

  useEffect(() => {
    setLoading(true);
    fetchPosts().finally(() => setLoading(false));
  }, [fetchPosts, setLoading]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPosts().finally(() => setRefreshing(false));
  }, [fetchPosts]);

  return (
    <View style={styles.container}>
      {city && (
        <View style={styles.cityHeader}>
          <Text style={styles.cityName}>📍 {city.name}, {city.state}</Text>
        </View>
      )}
      <View style={styles.filters}>
        {FILTER_OPTIONS.map(opt => (
          <Pressable
            key={opt.key}
            style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
            onPress={() => setFilter(opt.key)}
          >
            <Text style={styles.filterIcon}>{opt.icon}</Text>
            <Text style={[styles.filterLabel, filter === opt.key && styles.filterLabelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} onReport={setReportPostId} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.coral} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🍵</Text>
            <Text style={styles.emptyText}>No posts yet</Text>
            <Text style={styles.emptySubtext}>Be the first to share a safety update</Text>
          </View>
        }
      />
      <ReportModal
        postId={reportPostId}
        visible={reportPostId !== null}
        onClose={() => setReportPostId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  cityHeader: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cityName: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  filters: { flexDirection: 'row', padding: Spacing.sm, gap: Spacing.xs },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, gap: 4 },
  filterChipActive: { backgroundColor: Colors.coralMuted, borderWidth: 1, borderColor: Colors.coral },
  filterIcon: { fontSize: 14 },
  filterLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  filterLabelActive: { color: Colors.coral, fontWeight: '600' },
  list: { padding: Spacing.md, gap: Spacing.md },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 18 },
  cardMeta: { flex: 1, marginLeft: Spacing.sm },
  pseudonym: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  timestamp: { fontSize: FontSize.xs, color: Colors.textMuted },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  categoryText: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  cardContent: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  cardActions: { flexDirection: 'row', marginTop: Spacing.sm, gap: Spacing.md },
  actionButton: { flexDirection: 'row', alignItems: 'center' },
  actionText: { fontSize: FontSize.sm, color: Colors.textMuted },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: '600' },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  reportTrigger: { marginLeft: Spacing.sm, paddingHorizontal: 6, paddingVertical: 2 },
  reportTriggerText: { fontSize: 18, color: Colors.textMuted, fontWeight: '700' },
});

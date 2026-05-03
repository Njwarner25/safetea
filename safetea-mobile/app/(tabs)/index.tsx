import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME } from '../../constants/colors';
import { usePostStore, PostCategory, Post } from '../../store/postStore';
import { useCityStore } from '../../store/cityStore';
import { getAvatarById } from '../../constants/avatars';
import { truncateText } from '../../utils/validators';
import { api } from '../../services/api';
import ReportModal from '../../components/ReportModal';
import PlusBadge from '../../components/PlusBadge';

const DID_YOU_KNOW_FACTS = [
  '1 in 3 women and 1 in 4 men have experienced some form of physical violence by an intimate partner.',
  '57% of college students who report dating violence and abuse said it occurred in college.',
  'Only 34% of people who are injured by intimate partners receive medical care for their injuries.',
  'Nearly half of all women and men in the US have experienced psychological aggression by an intimate partner.',
  'Every 68 seconds, an American is sexually assaulted.',
  'Women ages 18-24 are at the highest risk for dating violence.',
  '38 million U.S. women and 10 million men have experienced intimate partner contact sexual violence.',
  'Over 70% of dating abuse occurs in a private setting — sharing your plans with someone you trust can save your life.',
  '43% of dating college women report experiencing violent or abusive dating behaviors.',
  'On a typical day, domestic violence hotlines nationwide receive approximately 19,000 calls.',
  '1 in 6 women have been stalked during their lifetime. Always trust your instincts.',
  'Nearly 3 in 4 Americans personally know someone who is or has been a victim of domestic violence.',
  'An abuser\'s access to a firearm increases the risk of intimate partner femicide by 400%.',
  'Dating abuse is most common among women aged 16-24.',
  '72% of all murder-suicides involve an intimate partner; 94% of the victims are female.',
  'Only 1 in 5 teens who have been in a physically abusive relationship tell someone about it.',
  `Most dating violence goes unreported — ${APP_NAME} is here to change that.`,
  `${APP_NAME} empowers communities to look out for each other. Stay connected, stay safe.`,
];

const FILTER_OPTIONS: { key: PostCategory | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'warning', label: 'Warnings', icon: 'exclamation-triangle' },
  { key: 'positive', label: 'Positive', icon: 'heart' },
  { key: 'question', label: 'Questions', icon: 'question-circle' },
  { key: 'alert', label: 'Alerts', icon: 'exclamation-circle' },
];

const CATEGORY_ICONS: Record<PostCategory, { name: string; color: string }> = {
  warning: { name: 'exclamation-triangle', color: Colors.warning },
  positive: { name: 'heart', color: Colors.success },
  question: { name: 'question-circle', color: Colors.info },
  alert: { name: 'exclamation-circle', color: Colors.danger },
};

function PostCard({ post, onReport }: { post: Post; onReport: (id: string) => void }) {
  const avatar = getAvatarById(post.authorAvatarId);
  const catIcon = CATEGORY_ICONS[post.category];

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
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.pseudonym}>{post.authorPseudonym}</Text>
            <PlusBadge tier={post.authorTier} />
          </View>
          <Text style={styles.timestamp}>{new Date(post.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: catIcon.color + '20' }]}>
          <FontAwesome5 name={catIcon.name} size={10} color={catIcon.color} style={{ marginRight: 4 }} />
          <Text style={[styles.categoryText, { color: catIcon.color }]}>
            {post.category}
          </Text>
        </View>
        <Pressable
          style={styles.reportTrigger}
          onPress={(e) => { e.stopPropagation(); onReport(post.id); }}
          hitSlop={8}
        >
          <FontAwesome5 name="ellipsis-h" size={14} color={Colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.cardTitle}>{post.title}</Text>
      <Text style={styles.cardContent}>{truncateText(post.content, 150)}</Text>
      <View style={styles.cardActions}>
        <Pressable style={styles.actionButton}>
          <FontAwesome5 name="chevron-up" size={12} color={Colors.textMuted} />
          <Text style={styles.actionText}> {post.upvotes}</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <FontAwesome5 name="chevron-down" size={12} color={Colors.textMuted} />
          <Text style={styles.actionText}> {post.downvotes}</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <FontAwesome5 name="comment" size={12} color={Colors.textMuted} />
          <Text style={styles.actionText}> {post.commentCount}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function DidYouKnowCard() {
  const fact = useMemo(() => {
    return DID_YOU_KNOW_FACTS[Math.floor(Math.random() * DID_YOU_KNOW_FACTS.length)];
  }, []);

  return (
    <View style={styles.dykCard}>
      <View style={styles.dykHeader}>
        <FontAwesome5 name="lightbulb" size={14} color={Colors.warning} />
        <Text style={styles.dykLabel}>Did You Know?</Text>
      </View>
      <Text style={styles.dykFact}>{fact}</Text>
      <Text style={styles.dykSource}>Source: NCADV, RAINN, CDC</Text>
    </View>
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
          <FontAwesome5 name="map-marker-alt" size={14} color={Colors.pink} />
          <Text style={styles.cityName}> {city.name}, {city.state}</Text>
        </View>
      )}
      <View style={styles.filters}>
        {FILTER_OPTIONS.map(opt => (
          <Pressable
            key={opt.key}
            style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
            onPress={() => setFilter(opt.key)}
          >
            <FontAwesome5 name={opt.icon} size={12} color={filter === opt.key ? Colors.coral : Colors.textMuted} />
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
        ListHeaderComponent={<DidYouKnowCard />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.coral} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <FontAwesome5 name="mug-hot" size={48} color={Colors.pink} style={{ marginBottom: Spacing.md }} />
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
  cityHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cityName: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  filters: { flexDirection: 'row', padding: Spacing.sm, gap: Spacing.xs },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, gap: 4 },
  filterChipActive: { backgroundColor: Colors.coralMuted, borderWidth: 1, borderColor: Colors.coral },
  filterLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  filterLabelActive: { color: Colors.coral, fontWeight: '600' },
  list: { padding: Spacing.md, gap: Spacing.md },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 18 },
  cardMeta: { flex: 1, marginLeft: Spacing.sm },
  pseudonym: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  timestamp: { fontSize: FontSize.xs, color: Colors.textMuted },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  categoryText: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  cardContent: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  cardActions: { flexDirection: 'row', marginTop: Spacing.sm, gap: Spacing.md },
  actionButton: { flexDirection: 'row', alignItems: 'center' },
  actionText: { fontSize: FontSize.sm, color: Colors.textMuted },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: '600' },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  reportTrigger: { marginLeft: Spacing.sm, paddingHorizontal: 6, paddingVertical: 2 },
  dykCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warningMuted,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  dykHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dykLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.warning,
  },
  dykFact: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  dykSource: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
});

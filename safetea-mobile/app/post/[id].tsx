import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { usePostStore, PostCategory } from '../../store/postStore';
import { getAvatarById } from '../../constants/avatars';
import ReportModal from '../../components/ReportModal';
import PlusBadge from '../../components/PlusBadge';

const categoryColors: Record<PostCategory, string> = {
  warning: Colors.warning,
  positive: Colors.success,
  question: Colors.info,
  alert: Colors.danger,
};

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = usePostStore((s) => s.posts.find((p) => p.id === id));
  const [reportVisible, setReportVisible] = useState(false);

  if (!post) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Post not found</Text>
        </View>
      </View>
    );
  }

  const avatar = getAvatarById(post.authorAvatarId);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.avatarCircle, { backgroundColor: avatar?.backgroundColor || Colors.coral }]}>
            <Text style={styles.avatarEmoji}>{avatar?.emoji || '👤'}</Text>
          </View>
          <View style={styles.headerMeta}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.pseudonym}>{post.authorPseudonym}</Text>
              <PlusBadge tier={post.authorTier} />
            </View>
            <Text style={styles.timestamp}>{new Date(post.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColors[post.category] + '20' }]}>
            <Text style={[styles.categoryText, { color: categoryColors[post.category] }]}>
              {post.category}
            </Text>
          </View>
          <Pressable style={styles.flagBtn} onPress={() => setReportVisible(true)} hitSlop={8}>
            <Text style={styles.flagText}>🚩</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>{post.title}</Text>
        <Text style={styles.body}>{post.content}</Text>

        <View style={styles.voteBar}>
          <Pressable style={styles.voteBtn}>
            <Text style={styles.voteText}>▲ {post.upvotes}</Text>
          </Pressable>
          <Pressable style={styles.voteBtn}>
            <Text style={styles.voteText}>▼ {post.downvotes}</Text>
          </Pressable>
          <View style={styles.commentCount}>
            <Text style={styles.voteText}>💬 {post.commentCount}</Text>
          </View>
        </View>

        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comments</Text>
          <View style={styles.commentsPlaceholder}>
            <Text style={styles.commentsPlaceholderText}>Comments coming soon</Text>
          </View>
        </View>
      </ScrollView>

      <ReportModal
        postId={id ?? null}
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 22 },
  headerMeta: { flex: 1, marginLeft: Spacing.sm },
  pseudonym: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  timestamp: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  categoryText: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  flagBtn: { marginLeft: Spacing.sm, padding: 6 },
  flagText: { fontSize: 20 },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  body: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24, marginBottom: Spacing.lg },
  voteBar: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  voteBtn: { flexDirection: 'row', alignItems: 'center' },
  voteText: { fontSize: FontSize.md, color: Colors.textMuted },
  commentCount: { flexDirection: 'row', alignItems: 'center' },
  commentsSection: { marginTop: Spacing.lg },
  commentsTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  commentsPlaceholder: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  commentsPlaceholderText: { fontSize: FontSize.sm, color: Colors.textMuted },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: FontSize.lg, color: Colors.textMuted },
});

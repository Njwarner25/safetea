import { View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { usePostStore, PostCategory } from '../../store/postStore';
import { getAvatarById } from '../../constants/avatars';
import { api } from '../../services/api';
import ReportModal from '../../components/ReportModal';
import PlusBadge from '../../components/PlusBadge';

const categoryColors: Record<PostCategory, string> = {
  warning: Colors.warning,
  positive: Colors.success,
  question: Colors.info,
  alert: Colors.danger,
  'tea-talk': Colors.purple,
};

interface Reply {
  id: string;
  authorPseudonym: string;
  authorAvatarId?: string;
  content: string;
  createdAt: string;
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = usePostStore((s) => s.posts.find((p) => p.id === id));
  const [reportVisible, setReportVisible] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchReplies = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.getPostReplies(id);
      if (res.status === 200 && res.data) {
        const raw = Array.isArray(res.data) ? res.data : (res.data as any)?.replies || [];
        setReplies(raw.map((r: any) => ({
          id: r.id?.toString() || String(Math.random()),
          authorPseudonym: r.author_pseudonym || r.authorPseudonym || 'Anonymous',
          authorAvatarId: r.author_avatar_id || r.authorAvatarId,
          content: r.content || r.body || '',
          createdAt: r.created_at || r.createdAt || '',
        })));
      }
    } catch { /* keep empty */ }
    setLoadingReplies(false);
  }, [id]);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !id || sending) return;
    setSending(true);
    try {
      const res = await api.createReply(id, replyText.trim());
      if (res.status === 200 || res.status === 201) {
        setReplyText('');
        fetchReplies();
      }
    } catch { /* silently fail */ }
    setSending(false);
  };

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

  const renderHeader = () => (
    <View>
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
        <View style={[styles.categoryBadge, { backgroundColor: (categoryColors[post.category] || Colors.coral) + '20' }]}>
          <Text style={[styles.categoryText, { color: categoryColors[post.category] || Colors.coral }]}>
            {post.category === 'tea-talk' ? 'Safety Chat' : post.category}
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
          <Text style={styles.voteText}>💬 {replies.length || post.commentCount}</Text>
        </View>
      </View>

      <Text style={styles.commentsTitle}>Replies</Text>
    </View>
  );

  const renderReply = ({ item }: { item: Reply }) => {
    const rAvatar = item.authorAvatarId ? getAvatarById(item.authorAvatarId) : null;
    return (
      <View style={styles.replyCard}>
        <View style={[styles.replyAvatar, { backgroundColor: rAvatar?.backgroundColor || Colors.surface }]}>
          <Text style={{ fontSize: 14 }}>{rAvatar?.emoji || '👤'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.replyAuthor}>{item.authorPseudonym}</Text>
          <Text style={styles.replyContent}>{item.content}</Text>
          {item.createdAt ? <Text style={styles.replyTime}>{new Date(item.createdAt).toLocaleDateString()}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={replies}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        renderItem={renderReply}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          loadingReplies ? (
            <ActivityIndicator color={Colors.coral} style={{ marginTop: 20 }} />
          ) : (
            <View style={styles.emptyReplies}>
              <Text style={styles.emptyRepliesText}>No replies yet — be the first</Text>
            </View>
          )
        }
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Write a reply..."
          placeholderTextColor={Colors.textMuted}
          value={replyText}
          onChangeText={setReplyText}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!replyText.trim() || sending) && { opacity: 0.4 }]}
          onPress={handleSendReply}
          disabled={!replyText.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.sendBtnText}>Send</Text>}
        </Pressable>
      </View>
      <ReportModal postId={id || null} visible={reportVisible} onClose={() => setReportVisible(false)} />
    </KeyboardAvoidingView>
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
  voteBar: { flexDirection: 'row', gap: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  voteBtn: { flexDirection: 'row', alignItems: 'center' },
  voteText: { fontSize: FontSize.md, color: Colors.textMuted },
  commentCount: { flexDirection: 'row', alignItems: 'center' },
  commentsTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.md },
  replyCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  replyAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  replyAuthor: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  replyContent: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: 2 },
  replyTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  emptyReplies: { alignItems: 'center', paddingVertical: 30 },
  emptyRepliesText: { fontSize: FontSize.sm, color: Colors.textMuted },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface, gap: Spacing.sm },
  composerInput: { flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.sm, color: Colors.textPrimary, fontSize: FontSize.md, maxHeight: 100, borderWidth: 1, borderColor: Colors.border },
  sendBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: FontSize.lg, color: Colors.textMuted },
});

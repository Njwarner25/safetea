import { View, Text, FlatList, StyleSheet, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';

interface RoomPost {
  id: string;
  authorPseudonym: string;
  content: string;
  createdAt: string;
  likesCount: number;
}

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [posts, setPosts] = useState<RoomPost[]>([]);
  const [roomName, setRoomName] = useState('Room');
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchFeed = useCallback(async () => {
    if (!id) return;
    try {
      const [detailRes, feedRes] = await Promise.all([
        api.getRoomDetails(id),
        api.getRoomFeed(id),
      ]);
      if (detailRes.status === 200 && detailRes.data) {
        const d = detailRes.data as any;
        setRoomName(d.name || d.room?.name || 'Room');
      }
      if (feedRes.status === 200 && feedRes.data) {
        const raw = Array.isArray(feedRes.data) ? feedRes.data : (feedRes.data as any)?.posts || [];
        setPosts(raw.map((p: any) => ({
          id: p.id?.toString(),
          authorPseudonym: p.author_pseudonym || p.authorPseudonym || 'Anonymous',
          content: p.content || p.body || '',
          createdAt: p.created_at || p.createdAt || '',
          likesCount: p.likes_count || p.likesCount || 0,
        })));
      }
    } catch { /* keep existing */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const handlePost = async () => {
    if (!text.trim() || !id || sending) return;
    setSending(true);
    try {
      const res = await api.postInRoom(id, text.trim());
      if (res.status === 200 || res.status === 201) {
        setText('');
        fetchFeed();
      }
    } catch { /* silently fail */ }
    setSending(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{roomName}</Text>
        <Pressable onPress={() => router.push('/rooms/' + id + '/members' as any)}>
          <FontAwesome5 name="users" size={16} color={Colors.textMuted} />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.coral} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.postCard}>
              <Text style={styles.postAuthor}>{item.authorPseudonym}</Text>
              <Text style={styles.postContent}>{item.content}</Text>
              <View style={styles.postFooter}>
                <Text style={styles.postTime}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</Text>
                <Text style={styles.postLikes}>{item.likesCount > 0 ? `${item.likesCount} likes` : ''}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No posts in this room yet</Text>
            </View>
          }
        />
      )}
      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Write something..."
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
          onPress={handlePost}
          disabled={!text.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.sendBtnText}>Post</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  list: { padding: Spacing.md, gap: Spacing.sm },
  postCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  postAuthor: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.coral, marginBottom: 4 },
  postContent: { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 22 },
  postFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  postTime: { fontSize: FontSize.xs, color: Colors.textMuted },
  postLikes: { fontSize: FontSize.xs, color: Colors.textMuted },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface, gap: Spacing.sm },
  composerInput: { flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.sm, color: Colors.textPrimary, fontSize: FontSize.md, maxHeight: 100, borderWidth: 1, borderColor: Colors.border },
  sendBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: FontSize.md, color: Colors.textMuted },
});

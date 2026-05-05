import { View, Text, TextInput, FlatList, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';

interface Conversation {
  id: string;
  userId: string;
  pseudonym: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export default function MessagesTabScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.getConversations();
      if (res.status === 200 && res.data) {
        const raw = Array.isArray(res.data) ? res.data : (res.data as any)?.conversations || [];
        setConversations(raw.map((c: any) => ({
          id: c.id?.toString() || c.user_id?.toString(),
          userId: c.user_id?.toString() || c.userId?.toString() || c.id?.toString(),
          pseudonym: c.pseudonym || c.other_user_pseudonym || 'User',
          lastMessage: c.last_message || c.lastMessage || '',
          lastMessageAt: c.last_message_at || c.lastMessageAt || c.updated_at || '',
          unreadCount: c.unread_count || c.unreadCount || 0,
        })));
      }
    } catch { /* keep existing */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchConversations().finally(() => setRefreshing(false));
  }, [fetchConversations]);

  const filtered = search.trim()
    ? conversations.filter((c) => c.pseudonym.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <FontAwesome5 name="search" size={14} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.convoCard} onPress={() => router.push('/messages/' + item.userId)}>
            <View style={styles.avatar}>
              <FontAwesome5 name="user" size={18} color={Colors.textMuted} />
            </View>
            <View style={styles.convoContent}>
              <View style={styles.convoHeader}>
                <Text style={styles.convoName}>{item.pseudonym}</Text>
                <Text style={styles.convoTime}>{formatTime(item.lastMessageAt)}</Text>
              </View>
              <Text style={styles.convoPreview} numberOfLines={1}>{item.lastMessage}</Text>
            </View>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.pink} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.pink} style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.empty}>
              <FontAwesome5 name="comment-dots" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Start a conversation from the community</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, margin: Spacing.md, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, paddingVertical: 12 },
  convoCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  convoContent: { flex: 1 },
  convoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  convoName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  convoTime: { fontSize: FontSize.xs, color: Colors.textMuted },
  convoPreview: { fontSize: FontSize.sm, color: Colors.textSecondary },
  unreadBadge: { backgroundColor: Colors.pink, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  unreadText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 80, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textSecondary },
});

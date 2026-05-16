import { View, Text, FlatList, StyleSheet, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Keyboard, Platform } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

interface Message {
  id: string;
  fromUserId: string;
  body: string;
  createdAt: string;
}

export default function ChatScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api.getMessages(userId);
      if (res.status === 200 && res.data) {
        const raw = Array.isArray(res.data) ? res.data : (res.data as any)?.messages || [];
        setMessages(raw.map((m: any) => ({
          id: m.id?.toString(),
          fromUserId: (m.from_user_id || m.fromUserId || m.sender_id)?.toString(),
          body: m.body || m.content || m.message || '',
          createdAt: m.created_at || m.createdAt || '',
        })).reverse());
      }
    } catch { /* keep existing */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleSend = async () => {
    if (!text.trim() || !userId || sending) return;
    setSending(true);
    try {
      const res = await api.sendMessage(userId, text.trim());
      if (res.status === 200 || res.status === 201) {
        setText('');
        fetchMessages();
      }
    } catch { /* silently fail */ }
    setSending(false);
  };

  const isMe = (msg: Message) => msg.fromUserId === currentUser?.id;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {loading ? (
        <ActivityIndicator color={Colors.coral} style={{ flex: 1 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.bubble, isMe(item) ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={[styles.bubbleText, isMe(item) && styles.bubbleTextMe]}>{item.body}</Text>
              {item.createdAt ? (
                <Text style={styles.bubbleTime}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}
            </View>
          )}
          contentContainerStyle={[styles.list, { paddingBottom: Spacing.md }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No messages yet</Text>
            </View>
          }
        />
      )}
      <View style={[styles.composer, { paddingBottom: Spacing.sm + (keyboardShown ? 0 : insets.bottom) }]}>
        <TextInput
          style={styles.composerInput}
          placeholder="Type a message..."
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.sendBtnText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.md, gap: Spacing.xs },
  bubble: { maxWidth: '80%', padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.xs },
  bubbleMe: { backgroundColor: Colors.coral, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 20 },
  bubbleTextMe: { color: '#FFF' },
  bubbleTime: { fontSize: 10, color: Colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface, gap: Spacing.sm },
  composerInput: { flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.sm, color: Colors.textPrimary, fontSize: FontSize.md, maxHeight: 100, borderWidth: 1, borderColor: Colors.border },
  sendBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: FontSize.md, color: Colors.textMuted },
});

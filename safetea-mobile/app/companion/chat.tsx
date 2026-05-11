import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AlessiaColors, AlessiaGradient, ALESSIA_DEFAULT_PREVIEW } from '../../constants/companion';
import { API_BASE } from '../../constants/api';
import { useAuthStore } from '../../store/authStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AlessiaChat() {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: ALESSIA_DEFAULT_PREVIEW },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Load history from /api/ai/chat on mount so the conversation persists across
  // sessions. Companion settings (tone) live server-side, set via /api/ai/settings.
  useEffect(() => {
    (async () => {
      try {
        const token = useAuthStore.getState().token;
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/ai/chat?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const rows: Array<{ role: string; content: string }> = data?.messages ?? [];
        const ordered = rows
          .slice()
          .reverse()
          .filter((r) => r.role === 'user' || r.role === 'assistant')
          .map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
        if (ordered.length > 0) setMessages(ordered);
      } catch {
        // Silent — keep the default greeting if history fetch fails.
      }
    })();
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setInput('');
    setMessages((curr) => [...curr, { role: 'user' as const, content: text }]);
    setSending(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setError('Alessia is not configured yet.');
      } else if (res.status === 401) {
        setError('Please sign in to chat with Alessia.');
      } else if (!res.ok) {
        setError(data?.error || 'Alessia didn\'t respond. Try again.');
      } else if (data?.reply) {
        setMessages((curr) => [...curr, { role: 'assistant', content: data.reply }]);
      } else {
        setError('Alessia didn\'t respond. Try again.');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <FontAwesome5 name="chevron-left" size={18} color="#FFF" />
        </Pressable>
        <Text style={styles.title}>Alessia</Text>
        <Pressable
          onPress={() => router.push('/companion/briefs' as any)}
          hitSlop={12}
          style={styles.back}
        >
          <FontAwesome5 name="shield-alt" size={18} color={AlessiaColors.coral} solid />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
              ]}
            >
              <Text style={m.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>
                {m.content}
              </Text>
            </View>
          ))}
          {sending ? (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <ActivityIndicator size="small" color={AlessiaColors.coral} />
            </View>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Talk to Alessia…"
            placeholderTextColor={AlessiaColors.muted}
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <Pressable onPress={send} disabled={sending || !input.trim()} hitSlop={6}>
            <LinearGradient
              colors={AlessiaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.5 }]}
            >
              <FontAwesome5 name="paper-plane" size={16} color="#FFF" solid />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AlessiaColors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: AlessiaColors.borderMuted,
  },
  back: { padding: 4 },
  title: { color: AlessiaColors.white, fontSize: 18, fontWeight: '700' },
  messages: { padding: 16, gap: 10 },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: AlessiaColors.coral,
  },
  bubbleUserText: { color: '#FFF', fontSize: 15, lineHeight: 21 },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: AlessiaColors.card,
    borderWidth: 1,
    borderColor: AlessiaColors.borderMuted,
  },
  bubbleAssistantText: {
    color: AlessiaColors.white,
    fontSize: 15,
    lineHeight: 21,
  },
  errorText: {
    color: '#FF8E8E',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: AlessiaColors.borderMuted,
    backgroundColor: AlessiaColors.bg,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: AlessiaColors.borderMuted,
    color: AlessiaColors.white,
    backgroundColor: AlessiaColors.card,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

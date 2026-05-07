import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useAiCompanionStore, getAvatarById, getThemeById } from '../../store/aiCompanionStore';
import { api } from '../../services/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  pending?: boolean;
}

const QUICK_PROMPTS: { label: string; prompt: string; icon: string }[] = [
  { label: 'I feel unsafe',           icon: 'shield-alt',     prompt: 'I feel unsafe right now.' },
  { label: 'Help me make a safety plan', icon: 'list-ul',     prompt: 'Can you help me think about a safety plan?' },
  { label: 'Journal',                 icon: 'book',           prompt: 'I want to journal about something that happened.' },
  { label: 'Find resources',          icon: 'life-ring',      prompt: 'I need resources for what I\'m going through.' },
];

export default function CompanionChat() {
  const { companionName, avatar, theme, hydrated, applyServerSettings } = useAiCompanionStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const themeOpt = getThemeById(theme);
  const avatarOpt = getAvatarById(avatar);

  // On focus: confirm onboarding done, then load history.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        // Sync settings from server in case user customized on web.
        const settingsRes = await api.getCompanionSettings();
        if (cancelled) return;

        if (settingsRes.status === 200 && settingsRes.data) {
          applyServerSettings((settingsRes.data as any).settings || null);
          if (!(settingsRes.data as any).settings && !companionName) {
            router.replace('/companion/onboarding');
            return;
          }
        } else if (!companionName) {
          router.replace('/companion/onboarding');
          return;
        }

        // Load history.
        const histRes = await api.getCompanionHistory(50);
        if (cancelled) return;
        if (histRes.status === 200 && histRes.data) {
          setMessages(((histRes.data as any).messages || []) as ChatMessage[]);
          setHistoryError(false);
        } else if (histRes.status === 503) {
          setHistoryError(true);
        }
        setLoading(false);
      })();

      return () => { cancelled = true; };
    }, [companionName, applyServerSettings])
  );

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const tempId = 'tmp_' + Date.now();
    const userMsg: ChatMessage = {
      id: tempId,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, {
      id: tempId + '_pending',
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      pending: true,
    }]);
    setInput('');
    setSending(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    const res = await api.sendCompanionMessage(trimmed);

    setSending(false);

    if (res.error || res.status >= 400) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId + '_pending'));
      Alert.alert(
        'Could not send',
        res.status === 503
          ? 'The Companion is not available right now. Please try again later.'
          : 'Network error. Please try again.'
      );
      return;
    }

    const data = res.data as any;
    setMessages((prev) =>
      prev
        .filter((m) => m.id !== tempId + '_pending')
        .concat({
          id: data.message_id,
          role: 'assistant',
          content: data.reply,
          created_at: data.created_at,
        })
    );
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [sending]);

  function renderMessage({ item }: { item: ChatMessage }) {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
        {!isUser && (
          <View style={[styles.assistantBubbleAvatar, { backgroundColor: themeOpt.primary + '33' }]}>
            <FontAwesome5 name={avatarOpt.icon} size={12} color={themeOpt.primary} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser
              ? { backgroundColor: themeOpt.primary, borderBottomRightRadius: 4 }
              : { backgroundColor: Colors.surface, borderBottomLeftRadius: 4 },
          ]}
        >
          {item.pending ? (
            <ActivityIndicator size="small" color={Colors.textMuted} />
          ) : (
            <Text style={[styles.bubbleText, isUser && { color: Colors.textInverse }]}>{item.content}</Text>
          )}
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.coral} />
      </View>
    );
  }

  if (historyError) {
    return (
      <View style={styles.serviceDownContainer}>
        <FontAwesome5 name="cloud-rain" size={36} color={Colors.textMuted} />
        <Text style={styles.serviceDownTitle}>Companion is offline</Text>
        <Text style={styles.serviceDownText}>
          Your Companion is not configured for this server yet. Please try again later.
        </Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBackBtn}>
          <FontAwesome5 name="chevron-left" size={16} color={Colors.textPrimary} />
        </Pressable>
        <View style={[styles.headerAvatar, { backgroundColor: themeOpt.primary + '33' }]}>
          <FontAwesome5 name={avatarOpt.icon} size={16} color={themeOpt.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{companionName || 'Companion'}</Text>
          <Text style={styles.headerSubtitle}>Private support</Text>
        </View>
        <Pressable onPress={() => router.push('/companion/journal')} hitSlop={8} style={styles.headerIconBtn}>
          <FontAwesome5 name="book" size={16} color={Colors.textSecondary} />
        </Pressable>
        <Pressable onPress={() => router.push('/companion/settings')} hitSlop={8} style={styles.headerIconBtn}>
          <FontAwesome5 name="cog" size={16} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.disclaimerBar}>
        <FontAwesome5 name="info-circle" size={11} color={Colors.textMuted} />
        <Text style={styles.disclaimerText}>
          Guidance and support — not professional medical, legal, or emergency advice.
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Hi — I'm {companionName || 'here'}.</Text>
            <Text style={styles.emptyBody}>
              Take your time. You can write about anything, or tap a quick option below.
            </Text>
          </View>
        }
      />

      <View style={styles.quickRow}>
        {QUICK_PROMPTS.map((q) => (
          <Pressable
            key={q.label}
            style={styles.quickChip}
            onPress={() => sendMessage(q.prompt)}
            disabled={sending}
          >
            <FontAwesome5 name={q.icon} size={11} color={Colors.coral} />
            <Text style={styles.quickChipText}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={'Message ' + (companionName || 'your Companion') + '…'}
          placeholderTextColor={Colors.textMuted}
          style={styles.textInput}
          multiline
          maxLength={4000}
          editable={!sending}
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || sending}
        >
          <FontAwesome5 name="paper-plane" size={14} color={Colors.textInverse} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  serviceDownContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md, backgroundColor: Colors.background },
  serviceDownTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  serviceDownText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  backBtn: { marginTop: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.coral, borderRadius: BorderRadius.full },
  backBtnText: { color: Colors.textInverse, fontWeight: '700' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'ios' ? 50 : Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  headerBackBtn: { padding: 4 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  headerSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  headerIconBtn: { padding: 6 },

  disclaimerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  disclaimerText: { fontSize: 10.5, color: Colors.textMuted, flex: 1 },

  messageList: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },
  emptyState: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: '700' },
  emptyBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  bubbleRow: { flexDirection: 'row', maxWidth: '85%', alignItems: 'flex-end', gap: Spacing.xs },
  bubbleRowUser: { alignSelf: 'flex-end' },
  bubbleRowAssistant: { alignSelf: 'flex-start' },
  assistantBubbleAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bubble: { padding: Spacing.sm + 2, borderRadius: BorderRadius.lg, minWidth: 40 },
  bubbleText: { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 20 },

  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.coralMuted,
    borderWidth: 1,
    borderColor: Colors.coral,
  },
  quickChipText: { fontSize: FontSize.xs, color: Colors.coral, fontWeight: '600' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 2,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.coral,
  },
  sendBtnDisabled: { opacity: 0.4 },
});

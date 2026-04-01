import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

export default function ModApplyScreen() {
  const user = useAuthStore((s) => s.user);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim() || reason.trim().length < 20) {
      Alert.alert('More Detail Needed', 'Please write at least 20 characters about why you want to moderate.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitModApplication(reason.trim());
      if (res.status >= 200 && res.status < 300) {
        setSubmitted(true);
      } else {
        Alert.alert('Error', (res.data as any)?.error || 'Could not submit application. Please try again.');
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach the server. Please try again.');
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.title}>Application Submitted</Text>
          <Text style={styles.desc}>
            Thank you for your interest in moderating SafeTea! Our team will review your application and reach out within a few days.
          </Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Back to App</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Become a Moderator</Text>
      <Text style={styles.subheading}>Help keep SafeTea safe for everyone</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What Moderators Do</Text>
        <Text style={styles.bulletItem}>  - Review and approve community posts</Text>
        <Text style={styles.bulletItem}>  - Flag inappropriate or harmful content</Text>
        <Text style={styles.bulletItem}>  - Help maintain a supportive community</Text>
        <Text style={styles.bulletItem}>  - Escalate serious safety concerns</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Perks</Text>
        <Text style={styles.bulletItem}>  - All SafeTea+ features unlocked for free</Text>
        <Text style={styles.bulletItem}>  - Special moderator badge on your profile</Text>
        <Text style={styles.bulletItem}>  - Direct line to the SafeTea team</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Why do you want to moderate?</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Tell us about yourself and why you care about dating safety..."
          placeholderTextColor={Colors.textMuted}
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
        <Pressable
          style={[styles.submitBtn, (submitting || !reason.trim() || reason.trim().length < 20) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !reason.trim() || reason.trim().length < 20}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Application</Text>
          )}
        </Pressable>
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
  successIcon: { fontSize: 48, textAlign: 'center', marginBottom: Spacing.md },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  backBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignSelf: 'center' },
  backBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  bulletItem: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22 },
  textArea: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 120,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  submitBtn: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
});

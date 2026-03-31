import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';
import { useState, useRef } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { PostCategory } from '../../store/postStore';
import { useAuthStore } from '../../store/authStore';
import { useCityStore } from '../../store/cityStore';
import { api } from '../../services/api';

const CATEGORIES: { key: PostCategory; label: string; icon: string }[] = [
  { key: 'warning', label: 'Warning', icon: '⚠️' },
  { key: 'positive', label: 'Positive', icon: '💚' },
  { key: 'question', label: 'Question', icon: '❓' },
  { key: 'alert', label: 'Alert', icon: '🚨' },
];

export default function CreatePostScreen() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('warning');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const user = useAuthStore((s) => s.user);
  const selectedCity = useCityStore((s) => s.getSelectedCity());

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Missing Fields', 'Please enter both a title and details for your post.');
      return;
    }
    if (title.trim().length < 3) {
      Alert.alert('Title Too Short', 'Please enter a title with at least 3 characters.');
      return;
    }
    if (content.trim().length < 10) {
      Alert.alert('Details Too Short', 'Please share at least 10 characters of detail.');
      return;
    }
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const res = await api.createPost({
        title: title.trim(),
        content: content.trim(),
        category,
        cityId: selectedCity?.id?.toString() || '',
        isAnonymous,
      });

      if (res.status === 201 || res.status === 200) {
        Alert.alert('Post Submitted', 'Your post has been submitted for review.');
        setTitle('');
        setContent('');
        setCategory('warning');
        setIsAnonymous(false);
      } else {
        const errorMsg = (res.data as any)?.error || res.error || 'Failed to create post.';
        Alert.alert('Error', errorMsg);
      }
    } catch (e) {
      Alert.alert('Network Error', 'Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Create Post</Text>
      <Text style={styles.subheading}>Share a safety update with your community</Text>

      <Text style={styles.label}>Category</Text>
      <View style={styles.categories}>
        {CATEGORIES.map(cat => (
          <Pressable
            key={cat.key}
            style={[styles.catChip, category === cat.key && styles.catChipActive]}
            onPress={() => setCategory(cat.key)}
          >
            <Text>{cat.icon} {cat.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.labelRow}>
        <Text style={styles.label}>Title</Text>
        <Text style={[styles.charCount, title.length > 100 && styles.charCountOver]}>{title.length}/100</Text>
      </View>
      <TextInput style={styles.input} placeholder="Brief title..." placeholderTextColor={Colors.textMuted} value={title} onChangeText={(t) => setTitle(t.slice(0, 100))} maxLength={100} />

      <View style={styles.labelRow}>
        <Text style={styles.label}>Details</Text>
        <Text style={[styles.charCount, content.length > 2000 && styles.charCountOver]}>{content.length}/2000</Text>
      </View>
      <TextInput style={[styles.input, styles.textArea]} placeholder="Share your experience..." placeholderTextColor={Colors.textMuted} value={content} onChangeText={(t) => setContent(t.slice(0, 2000))} multiline numberOfLines={6} textAlignVertical="top" maxLength={2000} />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Post anonymously</Text>
        <Switch value={isAnonymous} onValueChange={setIsAnonymous} trackColor={{ true: Colors.coral }} />
      </View>

      <Pressable
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.submitText}>Submit for Review</Text>
        )}
      </Pressable>

      <Text style={styles.notice}>All posts are reviewed by moderators before publishing.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
  heading: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  subheading: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.xs, marginTop: Spacing.md },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.coralMuted, borderColor: Colors.coral },
  input: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md, borderWidth: 1, borderColor: Colors.border },
  textArea: { minHeight: 120 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg },
  switchLabel: { fontSize: FontSize.md, color: Colors.textPrimary },
  submitButton: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.xl },
  submitText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '700' },
  submitButtonDisabled: { opacity: 0.5 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.xs },
  charCount: { fontSize: FontSize.xs, color: Colors.textMuted },
  charCountOver: { color: Colors.danger },
  notice: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md, marginBottom: 40 },
});

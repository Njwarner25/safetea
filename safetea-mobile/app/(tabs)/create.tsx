import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Switch } from 'react-native';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { PostCategory } from '../../store/postStore';

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

  const handleSubmit = () => {
    // TODO: Submit post via API
    console.log({ title, content, category, isAnonymous });
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

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} placeholder="Brief title..." placeholderTextColor={Colors.textMuted} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Details</Text>
      <TextInput style={[styles.input, styles.textArea]} placeholder="Share your experience..." placeholderTextColor={Colors.textMuted} value={content} onChangeText={setContent} multiline numberOfLines={6} textAlignVertical="top" />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Post anonymously</Text>
        <Switch value={isAnonymous} onValueChange={setIsAnonymous} trackColor={{ true: Colors.coral }} />
      </View>

      <Pressable style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitText}>Submit for Review</Text>
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
  notice: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md, marginBottom: 40 },
});

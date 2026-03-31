import { View, Text, TextInput, StyleSheet, Pressable, Modal, Alert, ScrollView } from 'react-native';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { api } from '../services/api';

const REPORT_REASONS = [
  { key: 'inappropriate', label: 'Inappropriate Content' },
  { key: 'harassment', label: 'Harassment or Bullying' },
  { key: 'spam', label: 'Spam' },
  { key: 'fake_identity', label: 'Fake Identity' },
  { key: 'explicit_content', label: 'Explicit Content' },
  { key: 'threats', label: 'Threats or Violence' },
  { key: 'other', label: 'Other' },
] as const;

interface ReportModalProps {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
}

export default function ReportModal({ postId, visible, onClose }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSelectedReason(null);
    setDetails('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!postId || !selectedReason) return;
    setSubmitting(true);
    try {
      const res = await api.reportPost(postId, selectedReason, details.trim() || undefined);
      if (res.error) {
        Alert.alert('Error', res.error);
      } else {
        Alert.alert('Report Submitted', 'Thank you. Our moderators will review this post.');
        handleClose();
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Report Post</Text>
          <Text style={styles.subtitle}>Why are you reporting this post?</Text>

          <ScrollView style={styles.reasonList}>
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r.key}
                style={[styles.reasonRow, selectedReason === r.key && styles.reasonRowSelected]}
                onPress={() => setSelectedReason(r.key)}
              >
                <View style={[styles.radio, selectedReason === r.key && styles.radioSelected]} />
                <Text style={[styles.reasonLabel, selectedReason === r.key && styles.reasonLabelSelected]}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            style={styles.detailsInput}
            placeholder="Additional details (optional)"
            placeholderTextColor={Colors.textMuted}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={500}
          />

          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, (!selectedReason || submitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!selectedReason || submitting}
            >
              <Text style={styles.submitBtnText}>{submitting ? 'Submitting...' : 'Submit Report'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.textMuted,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  reasonList: {
    maxHeight: 280,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  reasonRowSelected: {
    backgroundColor: Colors.coralMuted,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    marginRight: Spacing.sm,
  },
  radioSelected: {
    borderColor: Colors.coral,
    backgroundColor: Colors.coral,
  },
  reasonLabel: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  reasonLabelSelected: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  detailsInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    minHeight: 72,
    textAlignVertical: 'top',
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.danger,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
});

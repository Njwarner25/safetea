import { View, Text, Pressable, StyleSheet, Modal, Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useSafeWalkStore } from '../store/safeWalkStore';
import { api } from '../services/api';
import { router } from 'expo-router';

interface SOSActionSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function SOSActionSheet({ visible, onClose }: SOSActionSheetProps) {
  const { triggerSOS } = useSafeWalkStore();

  const handleAlertContacts = async () => {
    onClose();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat: number | undefined;
      let lng: number | undefined;
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
      triggerSOS('alert_contacts');
      const res = await api.sosAlert('alert_contacts', lat, lng);
      const data = res.data as any;
      if (data?.success) {
        Alert.alert('SOS Sent', `${data.contactsNotified || 0} contact(s) notified with your location.`);
      } else {
        Alert.alert('Error', data?.error || 'Failed to send SOS. Please try calling 911.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try calling 911 directly.');
    }
  };

  const handleFakeCall = () => {
    onClose();
    router.push('/fake-call');
  };

  const handleCall911 = () => {
    Alert.alert(
      'Call 911',
      'This will call 911. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call 911', style: 'destructive', onPress: async () => {
            onClose();
            // Log the event
            try {
              await api.sosAlert('call_911');
            } catch { /* best effort */ }
            Linking.openURL('tel:911');
          }
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Emergency SOS</Text>
          <Text style={styles.subtitle}>Choose an action</Text>

          <Pressable style={styles.option} onPress={handleAlertContacts}>
            <Text style={styles.optionIcon}>📍</Text>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Alert My Contacts</Text>
              <Text style={styles.optionDesc}>Send SOS with GPS location to trusted contacts</Text>
            </View>
          </Pressable>

          <Pressable style={styles.option} onPress={handleFakeCall}>
            <Text style={styles.optionIcon}>📞</Text>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Fake Incoming Call</Text>
              <Text style={styles.optionDesc}>Get an AI-generated call to excuse yourself</Text>
            </View>
          </Pressable>

          <Pressable style={[styles.option, styles.option911]} onPress={handleCall911}>
            <Text style={styles.optionIcon}>🚨</Text>
            <View style={styles.optionContent}>
              <Text style={[styles.optionTitle, { color: '#FF4444' }]}>Call 911</Text>
              <Text style={styles.optionDesc}>Call emergency services immediately</Text>
            </View>
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  option911: {
    borderColor: 'rgba(255, 68, 68, 0.3)',
    backgroundColor: 'rgba(255, 68, 68, 0.08)',
  },
  optionIcon: {
    fontSize: 28,
    marginRight: Spacing.md,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  cancelBtn: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});

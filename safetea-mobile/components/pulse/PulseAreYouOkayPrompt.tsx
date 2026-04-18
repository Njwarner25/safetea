import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Vibration,
  Animated,
} from 'react-native';
import {
  Colors,
  BorderRadius,
  FontSize,
  FontWeight,
  Spacing,
} from '../../constants/colors';
import { usePulseStore } from '../../store/pulseStore';
import { PULSE_THRESHOLDS } from '../../constants/pulseThresholds';
import type { PulseAnomalyType } from '../../types/pulse';

const ANOMALY_MESSAGES: Record<PulseAnomalyType, string> = {
  inactivity: "We noticed you haven't moved in a while.",
  route_deviation: 'Your route looks different than expected.',
  missed_check_in: 'Time for a quick check-in.',
  session_overrun: 'Your session has run longer than planned.',
  movement_anomaly: 'Something about your activity looks unusual.',
};

export default function PulseAreYouOkayPrompt() {
  const promptAnomaly = usePulseStore((s) => s.promptAnomaly);
  const session = usePulseStore((s) => s.session);
  const acknowledge = usePulseStore((s) => s.acknowledgePrompt);
  const sendHelp = usePulseStore((s) => s.sendHelpNow);

  const visible = promptAnomaly !== null && session !== null;

  const waitSeconds = session
    ? PULSE_THRESHOLDS[session.sessionType].escalationWaitSeconds
    : 45;

  const [remaining, setRemaining] = useState(waitSeconds);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    setRemaining(waitSeconds);
    Vibration.vibrate([0, 600, 300, 600, 300, 600]);

    const tick = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => {
      clearInterval(tick);
      loop.stop();
      Vibration.cancel();
    };
  }, [visible, waitSeconds, pulse]);

  if (!visible || !promptAnomaly) return null;

  return (
    <Modal animationType="fade" transparent={false} visible={visible}>
      <View style={styles.container}>
        <Animated.View style={[styles.badge, { transform: [{ scale: pulse }] }]}>
          <Text style={styles.badgeText}>PULSE</Text>
        </Animated.View>

        <Text style={styles.title}>Are you okay?</Text>
        <Text style={styles.subtitle}>{ANOMALY_MESSAGES[promptAnomaly]}</Text>
        <Text style={styles.countdown}>Alerting contact in {remaining}s</Text>

        <Pressable style={[styles.button, styles.okayButton]} onPress={acknowledge}>
          <Text style={styles.okayText}>I'm okay</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.helpButton]} onPress={sendHelp}>
          <Text style={styles.helpText}>Send help now</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.callButton]} onPress={sendHelp}>
          <Text style={styles.callText}>Call trusted contact</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dangerMuted,
    borderWidth: 2,
    borderColor: Colors.danger,
    marginBottom: Spacing.xl,
  },
  badgeText: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 2,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  countdown: {
    color: Colors.warning,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.xxl,
  },
  button: {
    width: '100%',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  okayButton: {
    backgroundColor: Colors.success,
  },
  okayText: {
    color: '#FFFFFF',
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  helpButton: {
    backgroundColor: Colors.danger,
  },
  helpText: {
    color: '#FFFFFF',
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  callButton: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  callText: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
});

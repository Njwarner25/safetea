import { View, Text, Pressable, StyleSheet, ActivityIndicator, Vibration } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { Audio } from 'expo-av';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/colors';
import { useFakeCallStore } from '../store/fakeCallStore';
import { api } from '../services/api';

type CallPhase = 'generating' | 'waiting' | 'ringing' | 'active' | 'ended';

export default function FakeCallScreen() {
  const { callerName, delaySeconds, scriptContext, voicePersona } = useFakeCallStore();
  const [phase, setPhase] = useState<CallPhase>('generating');
  const [countdown, setCountdown] = useState(delaySeconds);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioBase64Ref = useRef<string | null>(null);

  useEffect(() => {
    generateCallData();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'waiting') return;
    if (countdown <= 0) {
      setPhase('ringing');
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown]);

  // Call duration timer
  useEffect(() => {
    if (phase !== 'active') return;
    const timer = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const generateCallData = async () => {
    try {
      // Generate script
      const scriptRes = await api.generateFakeCallScript(callerName, scriptContext);
      const scriptData = scriptRes.data as any;
      if (!scriptData?.script) {
        setError('Failed to generate call script');
        return;
      }

      // Generate voice with selected persona
      const voiceRes = await api.synthesizeFakeCallVoice(scriptData.script, voicePersona);
      const voiceData = voiceRes.data as any;
      if (!voiceData?.audio) {
        setError('Failed to generate voice audio');
        return;
      }

      audioBase64Ref.current = voiceData.audio;
      setPhase('waiting');
      setCountdown(delaySeconds);
    } catch {
      setError('Network error. Please try again.');
    }
  };

  const handleAccept = async () => {
    setPhase('active');
    Vibration.cancel();

    if (audioBase64Ref.current) {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'data:audio/mpeg;base64,' + audioBase64Ref.current },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPhase('ended');
          }
        });
      } catch {
        // Audio playback failed, just show call screen
      }
    }
  };

  const handleDecline = () => {
    Vibration.cancel();
    if (soundRef.current) {
      soundRef.current.stopAsync();
    }
    router.back();
  };

  const handleEndCall = () => {
    if (soundRef.current) {
      soundRef.current.stopAsync();
    }
    setPhase('ended');
  };

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'generating') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.coral} />
        <Text style={styles.genText}>Generating your call...</Text>
        <Text style={styles.genSub}>AI is creating a realistic script</Text>
      </View>
    );
  }

  if (phase === 'waiting') {
    return (
      <View style={styles.container}>
        <Text style={styles.waitLabel}>Incoming call in</Text>
        <Text style={styles.waitCountdown}>{countdown}</Text>
        <Text style={styles.waitSub}>Put your phone face-up on the table</Text>
        <Pressable style={styles.cancelWaitBtn} onPress={() => router.back()}>
          <Text style={styles.cancelWaitText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'ended') {
    return (
      <View style={styles.container}>
        <Text style={styles.endedIcon}>✓</Text>
        <Text style={styles.endedText}>Call Ended</Text>
        <Text style={styles.endedSub}>{fmtDuration(callDuration)}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  // Ringing or Active
  return (
    <View style={styles.callScreen}>
      <View style={styles.callerInfo}>
        <View style={styles.callerAvatar}>
          <Text style={styles.callerInitial}>{callerName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.callerNameText}>{callerName}</Text>
        <Text style={styles.callStatus}>
          {phase === 'ringing' ? 'Incoming Call...' : fmtDuration(callDuration)}
        </Text>
      </View>

      <View style={styles.callActions}>
        {phase === 'ringing' ? (
          <>
            <Pressable style={styles.declineBtn} onPress={handleDecline}>
              <Text style={styles.callActionIcon}>✕</Text>
              <Text style={styles.callActionLabel}>Decline</Text>
            </Pressable>
            <Pressable style={styles.acceptBtn} onPress={handleAccept}>
              <Text style={styles.callActionIcon}>✓</Text>
              <Text style={styles.callActionLabel}>Accept</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.endCallBtn} onPress={handleEndCall}>
            <Text style={styles.callActionIcon}>✕</Text>
            <Text style={styles.callActionLabel}>End Call</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  genText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '600',
    marginTop: Spacing.lg,
  },
  genSub: {
    color: '#888',
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
  },
  waitLabel: {
    color: '#888',
    fontSize: FontSize.md,
  },
  waitCountdown: {
    color: '#fff',
    fontSize: 72,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginVertical: Spacing.md,
  },
  waitSub: {
    color: '#666',
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  cancelWaitBtn: {
    marginTop: Spacing.xxl,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: Spacing.xl,
  },
  cancelWaitText: {
    color: '#888',
    fontSize: FontSize.md,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  backBtn: {
    backgroundColor: Colors.surfaceLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  backBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  endedIcon: {
    fontSize: 48,
    color: Colors.success,
    marginBottom: Spacing.md,
  },
  endedText: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  endedSub: {
    color: '#888',
    fontSize: FontSize.md,
    marginTop: Spacing.xs,
  },
  callScreen: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 60,
    paddingHorizontal: Spacing.xl,
  },
  callerInfo: {
    alignItems: 'center',
  },
  callerAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  callerInitial: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '700',
  },
  callerNameText: {
    color: '#fff',
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  callStatus: {
    color: '#888',
    fontSize: FontSize.md,
    marginTop: Spacing.xs,
  },
  callActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 60,
  },
  declineBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callActionIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  callActionLabel: {
    color: '#fff',
    fontSize: 11,
    marginTop: 2,
  },
});

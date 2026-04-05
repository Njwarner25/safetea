import { View, Text, Pressable, StyleSheet, ActivityIndicator, Vibration, Platform } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/colors';
import { useFakeCallStore } from '../store/fakeCallStore';
import { api } from '../services/api';

type CallPhase = 'generating' | 'waiting' | 'ringing' | 'active' | 'ended';

export default function FakeCallScreen() {
  const { callerName, delaySeconds, scriptContext, voicePersona, callStyle } = useFakeCallStore();
  const [phase, setPhase] = useState<CallPhase>('generating');
  const [countdown, setCountdown] = useState(delaySeconds);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioFileRef = useRef<string | null>(null);
  const vibrationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isIOS = callStyle === 'ios';

  useEffect(() => {
    generateCallData();
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
      if (vibrationRef.current) clearInterval(vibrationRef.current);
      Vibration.cancel();
      // Clean up temp audio file
      if (audioFileRef.current) {
        FileSystem.deleteAsync(audioFileRef.current, { idempotent: true }).catch(() => {});
      }
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'waiting') return;
    if (countdown <= 0) {
      setPhase('ringing');
      // Repeating vibration pattern
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      vibrationRef.current = setInterval(() => {
        Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      }, 3000);
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
      const scriptRes = await api.generateFakeCallScript(callerName, scriptContext);
      const scriptData = scriptRes.data as any;
      if (!scriptData?.script) {
        console.warn('[FakeCall] No script — call will be silent');
        setPhase('waiting');
        setCountdown(delaySeconds);
        return;
      }

      const voiceRes = await api.synthesizeFakeCallVoice(scriptData.script, voicePersona);
      const voiceData = voiceRes.data as any;
      if (!voiceData?.audio) {
        console.warn('[FakeCall] No voice audio — call will be silent');
        setPhase('waiting');
        setCountdown(delaySeconds);
        return;
      }

      // Write base64 audio to temp file for reliable playback
      const tempFile = FileSystem.cacheDirectory + 'fakecall_' + Date.now() + '.mp3';
      await FileSystem.writeAsStringAsync(tempFile, voiceData.audio, {
        encoding: FileSystem.EncodingType.Base64,
      });
      audioFileRef.current = tempFile;

      setPhase('waiting');
      setCountdown(delaySeconds);
    } catch (err) {
      console.error('[FakeCall] Generation failed:', err);
      // Still allow call without voice
      setPhase('waiting');
      setCountdown(delaySeconds);
    }
  };

  const handleAccept = async () => {
    setPhase('active');
    Vibration.cancel();
    if (vibrationRef.current) {
      clearInterval(vibrationRef.current);
      vibrationRef.current = null;
    }

    if (audioFileRef.current) {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioFileRef.current },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPhase('ended');
          }
        });
      } catch (err) {
        console.error('[FakeCall] Audio playback failed:', err);
      }
    }
  };

  const handleDecline = () => {
    Vibration.cancel();
    if (vibrationRef.current) clearInterval(vibrationRef.current);
    if (soundRef.current) soundRef.current.stopAsync();
    router.back();
  };

  const handleEndCall = () => {
    if (soundRef.current) soundRef.current.stopAsync();
    setPhase('ended');
  };

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const initial = callerName.charAt(0).toUpperCase();

  // ---- ERROR STATE ----
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

  // ---- GENERATING ----
  if (phase === 'generating') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={isIOS ? '#fff' : '#4285F4'} />
        <Text style={styles.genText}>Generating your call...</Text>
        <Text style={styles.genSub}>AI is creating a realistic script</Text>
      </View>
    );
  }

  // ---- WAITING / COUNTDOWN ----
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

  // ---- ENDED ----
  if (phase === 'ended') {
    return (
      <View style={styles.container}>
        <Ionicons name="checkmark-circle" size={56} color={isIOS ? '#34C759' : '#34A853'} />
        <Text style={[styles.endedText, { marginTop: 16 }]}>Call Ended</Text>
        <Text style={styles.endedSub}>{fmtDuration(callDuration)}</Text>
        <Pressable style={[styles.backBtn, { marginTop: 32 }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  // ---- RINGING (iOS) ----
  if (phase === 'ringing' && isIOS) {
    return (
      <View style={styles.iosCallScreen}>
        <View style={styles.iosCallerSection}>
          <View style={styles.iosAvatarRing}>
            <Text style={styles.iosAvatarInitial}>{initial}</Text>
          </View>
          <Text style={styles.iosCallerName}>{callerName}</Text>
          <Text style={styles.iosCallerLabel}>mobile</Text>
        </View>
        <View style={styles.iosRingButtons}>
          <View style={styles.iosButtonCol}>
            <Pressable style={styles.iosDeclineBtn} onPress={handleDecline}>
              <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
            <Text style={styles.iosButtonLabel}>Decline</Text>
          </View>
          <View style={styles.iosButtonCol}>
            <Pressable style={styles.iosAcceptBtn} onPress={handleAccept}>
              <Ionicons name="call" size={30} color="#fff" />
            </Pressable>
            <Text style={styles.iosButtonLabel}>Accept</Text>
          </View>
        </View>
      </View>
    );
  }

  // ---- RINGING (Android) ----
  if (phase === 'ringing') {
    return (
      <View style={styles.androidCallScreen}>
        <View style={styles.androidCallerSection}>
          <View style={styles.androidAvatarRing}>
            <Text style={styles.androidAvatarInitial}>{initial}</Text>
          </View>
          <Text style={styles.androidCallerName}>{callerName}</Text>
          <Text style={styles.androidCallerLabel}>Incoming call</Text>
        </View>
        <View style={styles.androidRingButtons}>
          <View style={styles.androidButtonCol}>
            <Pressable style={styles.androidDeclineBtn} onPress={handleDecline}>
              <Ionicons name="call" size={26} color="#EA4335" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
            <Text style={styles.androidButtonLabel}>Decline</Text>
          </View>
          <View style={styles.androidButtonCol}>
            <Pressable style={styles.androidAcceptBtn} onPress={handleAccept}>
              <Ionicons name="call" size={26} color="#34A853" />
            </Pressable>
            <Text style={styles.androidButtonLabel}>Answer</Text>
          </View>
        </View>
      </View>
    );
  }

  // ---- ACTIVE CALL (iOS) ----
  if (isIOS) {
    return (
      <View style={styles.iosCallScreen}>
        {/* Top: name + timer */}
        <View style={styles.iosActiveTop}>
          <Text style={styles.iosActiveName}>{callerName}</Text>
          <Text style={styles.iosActiveTimer}>{fmtDuration(callDuration)}</Text>
        </View>

        {/* Middle: 3x2 button grid */}
        <View style={styles.iosGrid}>
          <View style={styles.iosGridItem}>
            <Pressable style={styles.iosGridBtn}>
              <Ionicons name="mic-off" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.iosGridLabel}>mute</Text>
          </View>
          <View style={styles.iosGridItem}>
            <Pressable style={styles.iosGridBtn}>
              <Ionicons name="keypad" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.iosGridLabel}>keypad</Text>
          </View>
          <View style={styles.iosGridItem}>
            <Pressable style={styles.iosGridBtn}>
              <Ionicons name="volume-high" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.iosGridLabel}>speaker</Text>
          </View>
          <View style={styles.iosGridItem}>
            <Pressable style={[styles.iosGridBtn, { opacity: 0.4 }]}>
              <Ionicons name="add" size={24} color="#fff" />
            </Pressable>
            <Text style={[styles.iosGridLabel, { opacity: 0.5 }]}>add call</Text>
          </View>
          <View style={styles.iosGridItem}>
            <Pressable style={[styles.iosGridBtn, { opacity: 0.4 }]}>
              <Ionicons name="videocam" size={24} color="#fff" />
            </Pressable>
            <Text style={[styles.iosGridLabel, { opacity: 0.5 }]}>FaceTime</Text>
          </View>
          <View style={styles.iosGridItem}>
            <Pressable style={[styles.iosGridBtn, { opacity: 0.4 }]}>
              <Ionicons name="person" size={24} color="#fff" />
            </Pressable>
            <Text style={[styles.iosGridLabel, { opacity: 0.5 }]}>contacts</Text>
          </View>
        </View>

        {/* Bottom: end call */}
        <View style={styles.iosEndSection}>
          <Pressable style={styles.iosEndBtn} onPress={handleEndCall}>
            <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
          <Text style={styles.iosButtonLabel}>End Call</Text>
        </View>
      </View>
    );
  }

  // ---- ACTIVE CALL (Android) ----
  return (
    <View style={styles.androidCallScreen}>
      {/* Top: avatar + name + timer */}
      <View style={styles.androidActiveTop}>
        <View style={styles.androidAvatarSmall}>
          <Text style={styles.androidAvatarInitialSmall}>{initial}</Text>
        </View>
        <Text style={styles.androidActiveName}>{callerName}</Text>
        <Text style={styles.androidActiveTimer}>{fmtDuration(callDuration)}</Text>
      </View>

      {/* Middle: action row */}
      <View style={styles.androidActiveButtons}>
        <View style={styles.androidButtonCol}>
          <Pressable style={styles.androidActionBtn}>
            <Ionicons name="mic-off" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.androidButtonLabel}>Mute</Text>
        </View>
        <View style={styles.androidButtonCol}>
          <Pressable style={styles.androidActionBtn}>
            <Ionicons name="keypad" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.androidButtonLabel}>Keypad</Text>
        </View>
        <View style={styles.androidButtonCol}>
          <Pressable style={styles.androidActionBtn}>
            <Ionicons name="volume-high" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.androidButtonLabel}>Speaker</Text>
        </View>
      </View>

      {/* Bottom: end call pill */}
      <View style={styles.androidEndSection}>
        <Pressable style={styles.androidEndPill} onPress={handleEndCall}>
          <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          <Text style={styles.androidEndText}>End call</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ---- Shared / utility ----
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  genText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '600', marginTop: Spacing.lg },
  genSub: { color: '#888', fontSize: FontSize.sm, marginTop: Spacing.xs },
  waitLabel: { color: '#888', fontSize: FontSize.md },
  waitCountdown: { color: '#fff', fontSize: 72, fontWeight: '800', fontVariant: ['tabular-nums'], marginVertical: Spacing.md },
  waitSub: { color: '#666', fontSize: FontSize.sm, textAlign: 'center' },
  cancelWaitBtn: { marginTop: Spacing.xxl, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: '#333', paddingHorizontal: Spacing.xl },
  cancelWaitText: { color: '#888', fontSize: FontSize.md },
  errorText: { color: Colors.danger, fontSize: FontSize.md, textAlign: 'center', marginBottom: Spacing.lg },
  backBtn: { backgroundColor: '#222', padding: Spacing.md, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.xl },
  backBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  endedText: { color: '#fff', fontSize: FontSize.xl, fontWeight: '700' },
  endedSub: { color: '#888', fontSize: FontSize.md, marginTop: Spacing.xs },

  // ---- iOS styles ----
  iosCallScreen: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 50,
  },
  iosCallerSection: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 40 },
  iosAvatarRing: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#6E6E80',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 18,
  },
  iosAvatarInitial: { color: '#fff', fontSize: 46, fontWeight: '300' },
  iosCallerName: { color: '#fff', fontSize: 30, fontWeight: '300', letterSpacing: -0.5 },
  iosCallerLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 15, marginTop: 6 },
  iosRingButtons: { flexDirection: 'row', gap: 80 },
  iosButtonCol: { alignItems: 'center' },
  iosDeclineBtn: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#FF3B30',
    justifyContent: 'center', alignItems: 'center',
  },
  iosAcceptBtn: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#34C759',
    justifyContent: 'center', alignItems: 'center',
  },
  iosButtonLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 10 },
  iosActiveTop: { alignItems: 'center', paddingTop: 20 },
  iosActiveName: { color: '#fff', fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  iosActiveTimer: { color: 'rgba(255,255,255,0.55)', fontSize: 16, marginTop: 6, fontVariant: ['tabular-nums'] },
  iosGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center',
    width: 320, gap: 0,
  },
  iosGridItem: { width: 320 / 3, alignItems: 'center', marginBottom: 24 },
  iosGridBtn: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  iosGridLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 8 },
  iosEndSection: { alignItems: 'center' },
  iosEndBtn: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#FF3B30',
    justifyContent: 'center', alignItems: 'center',
  },

  // ---- Android styles ----
  androidCallScreen: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 50,
  },
  androidCallerSection: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 30 },
  androidAvatarRing: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#4285F4',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  androidAvatarInitial: { color: '#fff', fontSize: 40, fontWeight: '400' },
  androidCallerName: { color: '#fff', fontSize: 26, fontWeight: '500' },
  androidCallerLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 8 },
  androidRingButtons: { flexDirection: 'row', justifyContent: 'center', gap: 80, paddingHorizontal: 40, width: '100%' },
  androidButtonCol: { alignItems: 'center' },
  androidDeclineBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(234,67,53,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  androidAcceptBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(52,168,83,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  androidButtonLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 8 },
  androidActiveTop: { alignItems: 'center', paddingTop: 20 },
  androidAvatarSmall: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#4285F4',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  androidAvatarInitialSmall: { color: '#fff', fontSize: 30, fontWeight: '400' },
  androidActiveName: { color: '#fff', fontSize: 20, fontWeight: '500' },
  androidActiveTimer: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4, fontVariant: ['tabular-nums'] },
  androidActiveButtons: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  androidActionBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  androidEndSection: { alignItems: 'center' },
  androidEndPill: {
    width: 160, height: 56, borderRadius: 28,
    backgroundColor: '#EA4335',
    flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
    gap: 10,
  },
  androidEndText: { color: '#fff', fontSize: 15, fontWeight: '500' },
});

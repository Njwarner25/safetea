import { View, Text, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';

type VerifyState = 'idle' | 'loading' | 'camera' | 'preview' | 'submitting' | 'passed' | 'failed' | 'error';

export default function VerifyIdentityScreen() {
  const [state, setState] = useState<VerifyState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [failIssues, setFailIssues] = useState<string[]>([]);
  const [challengeId, setChallengeId] = useState('');
  const [challengeInstruction, setChallengeInstruction] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Load challenge on mount
  useEffect(() => {
    loadChallenge();
  }, []);

  const loadChallenge = async () => {
    try {
      const res = await api.getIdentityChallenge();
      if (res.data?.challenge_id) {
        setChallengeId(res.data.challenge_id);
        setChallengeInstruction(res.data.instruction);
      } else {
        setChallengeId('peace');
        setChallengeInstruction('Hold up a peace sign (two fingers) next to your face');
      }
    } catch {
      setChallengeId('peace');
      setChallengeInstruction('Hold up a peace sign (two fingers) next to your face');
    }
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setErrorMsg('Camera permission is required for identity verification.');
        setState('error');
        return;
      }
    }
    setCapturedPhoto(null);
    setFailIssues([]);
    setErrorMsg('');
    setState('camera');
  };

  const takeSelfie = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.85,
        exif: false,
      });
      if (photo?.base64) {
        setCapturedPhoto('data:image/jpeg;base64,' + photo.base64);
        setState('preview');
      }
    } catch {
      setErrorMsg('Failed to capture photo. Please try again.');
      setState('error');
    }
  };

  const submitVerification = async () => {
    if (!capturedPhoto || !challengeId) return;
    setState('submitting');
    setErrorMsg('');
    setFailIssues([]);

    try {
      const res = await api.submitIdentityVerification(capturedPhoto, challengeId);
      const data = res.data;

      if (data?.verified) {
        setState('passed');
        setTimeout(() => router.push('/(auth)/guidelines'), 1500);
      } else if (data?.already_verified) {
        setState('passed');
        setTimeout(() => router.push('/(auth)/guidelines'), 1000);
      } else {
        setState('failed');
        setErrorMsg(data?.summary || 'Verification failed. Please try again with a clearer selfie.');
        setFailIssues(data?.issues || []);
        // Load new challenge for retry
        loadChallenge();
      }
    } catch {
      setState('error');
      setErrorMsg('Network error. Please check your connection and try again.');
    }
  };

  const skipForNow = () => {
    router.push('/(auth)/guidelines');
  };

  return (
    <View style={styles.container}>
      {state === 'idle' && (
        <>
          <Text style={styles.icon}>📸</Text>
          <Text style={styles.title}>Verify Your Identity</Text>
          <Text style={styles.subtitle}>
            Take a quick selfie to verify you're a real person. No documents needed — just your face and a simple gesture.
          </Text>

          {challengeInstruction ? (
            <View style={styles.challengeBox}>
              <Text style={styles.challengeLabel}>Your challenge:</Text>
              <Text style={styles.challengeText}>{challengeInstruction}</Text>
            </View>
          ) : null}

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Tips for a quick pass:</Text>
            <Text style={styles.infoItem}>• Good lighting on your face</Text>
            <Text style={styles.infoItem}>• Look directly at the camera</Text>
            <Text style={styles.infoItem}>• Complete the gesture clearly</Text>
            <Text style={styles.infoItem}>• Don't use filters</Text>
          </View>

          <Pressable style={styles.primaryButton} onPress={openCamera}>
            <Text style={styles.primaryButtonText}>Open Camera</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={skipForNow}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </Pressable>
        </>
      )}

      {state === 'camera' && (
        <View style={styles.cameraContainer}>
          <View style={styles.challengeBanner}>
            <Text style={styles.challengeBannerText}>{challengeInstruction}</Text>
          </View>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="front"
            mirror={true}
          />
          <Pressable style={styles.captureButton} onPress={takeSelfie}>
            <View style={styles.captureButtonInner} />
          </Pressable>
        </View>
      )}

      {state === 'preview' && capturedPhoto && (
        <>
          <Text style={styles.title}>Looking good?</Text>
          <Image source={{ uri: capturedPhoto }} style={styles.previewImage} />
          <View style={styles.challengeBox}>
            <Text style={styles.challengeLabel}>Challenge:</Text>
            <Text style={styles.challengeText}>{challengeInstruction}</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={submitVerification}>
            <Text style={styles.primaryButtonText}>Submit for Verification</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={openCamera}>
            <Text style={styles.secondaryButtonText}>Retake</Text>
          </Pressable>
        </>
      )}

      {state === 'submitting' && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={Colors.coral} size="large" />
          <Text style={styles.statusText}>Analyzing your selfie...</Text>
          <Text style={styles.statusSubtext}>This takes a few seconds</Text>
        </View>
      )}

      {state === 'loading' && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={Colors.coral} size="large" />
          <Text style={styles.statusText}>Loading...</Text>
        </View>
      )}

      {state === 'passed' && (
        <View style={styles.statusBox}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successText}>Identity Verified!</Text>
          <Text style={styles.statusSubtext}>Redirecting...</Text>
        </View>
      )}

      {state === 'failed' && (
        <View style={styles.statusBox}>
          <Text style={styles.failIcon}>❌</Text>
          <Text style={styles.failText}>Verification Failed</Text>
          <Text style={styles.statusSubtext}>{errorMsg}</Text>
          {failIssues.length > 0 && (
            <View style={styles.issuesList}>
              {failIssues.map((issue, i) => (
                <Text key={i} style={styles.issueItem}>• {issue}</Text>
              ))}
            </View>
          )}
          <Pressable style={styles.primaryButton} onPress={openCamera}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={skipForNow}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </Pressable>
        </View>
      )}

      {state === 'error' && (
        <View style={styles.statusBox}>
          <Text style={styles.failText}>{errorMsg}</Text>
          <Pressable style={styles.primaryButton} onPress={() => { setState('idle'); loadChallenge(); }}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={skipForNow}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.background, padding: Spacing.lg,
    justifyContent: 'center', alignItems: 'center', gap: Spacing.md,
  },
  icon: { fontSize: 56 },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: {
    fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: Spacing.md,
  },
  challengeBox: {
    backgroundColor: 'rgba(232,160,181,0.1)', borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(232,160,181,0.3)',
    width: '100%',
  },
  challengeLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },
  challengeText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.coral },
  infoBox: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, width: '100%', marginTop: Spacing.sm,
  },
  infoTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  infoItem: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22 },
  cameraContainer: { flex: 1, width: '100%', position: 'relative' },
  challengeBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 12, paddingHorizontal: 16,
  },
  challengeBannerText: { color: Colors.coral, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center' },
  camera: { flex: 1, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  captureButton: {
    position: 'absolute', bottom: 30, alignSelf: 'center',
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  captureButtonInner: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF',
    borderWidth: 3, borderColor: Colors.coral,
  },
  previewImage: {
    width: '100%', height: 300, borderRadius: BorderRadius.lg, resizeMode: 'cover',
  },
  primaryButton: {
    backgroundColor: Colors.coral, paddingVertical: 16, paddingHorizontal: 48,
    borderRadius: BorderRadius.lg, width: '100%', alignItems: 'center', marginTop: Spacing.sm,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1, borderColor: Colors.coral, paddingVertical: 12, paddingHorizontal: 32,
    borderRadius: BorderRadius.lg, width: '100%', alignItems: 'center', marginTop: Spacing.xs,
  },
  secondaryButtonText: { color: Colors.coral, fontSize: FontSize.sm, fontWeight: '600' },
  skipButton: { paddingVertical: 12 },
  skipButtonText: { color: Colors.textMuted, fontSize: FontSize.sm },
  statusBox: { alignItems: 'center', gap: Spacing.md, marginTop: Spacing.lg, width: '100%' },
  statusText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  statusSubtext: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  successIcon: { fontSize: 48 },
  successText: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.success },
  failIcon: { fontSize: 48 },
  failText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.danger, textAlign: 'center' },
  issuesList: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.sm, padding: Spacing.md,
    width: '100%', borderWidth: 1, borderColor: Colors.border,
  },
  issueItem: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 20 },
});

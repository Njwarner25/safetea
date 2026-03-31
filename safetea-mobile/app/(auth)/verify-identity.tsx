import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';

type VerifyState = 'idle' | 'creating' | 'pending' | 'polling' | 'passed' | 'failed' | 'error';

export default function VerifyIdentityScreen() {
  const [state, setState] = useState<VerifyState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startVerification = async () => {
    setState('creating');
    setErrorMsg('');

    try {
      const res = await api.startIdentityVerification();

      if (res.data?.status === 'already_verified') {
        setState('passed');
        setTimeout(() => router.push('/(auth)/guidelines'), 1000);
        return;
      }

      if (res.data?.status === 'passed') {
        // Dev mode auto-pass
        setState('passed');
        setTimeout(() => router.push('/(auth)/guidelines'), 1000);
        return;
      }

      if (res.data?.verification_url) {
        setState('pending');
        // Open Didit verification in system browser
        await Linking.openURL(res.data.verification_url);
        // Start polling for completion
        startPolling();
      } else {
        setState('error');
        setErrorMsg(res.data?.error || 'Could not start verification');
      }
    } catch {
      setState('error');
      setErrorMsg('Network error. Check your connection.');
    }
  };

  const startPolling = () => {
    setState('polling');
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes at 5s intervals

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (pollRef.current) clearInterval(pollRef.current);
        setState('error');
        setErrorMsg('Verification timed out. Please try again.');
        return;
      }

      try {
        const res = await api.getVerificationStatus();
        if (res.data?.steps?.identity?.completed) {
          if (pollRef.current) clearInterval(pollRef.current);
          setState('passed');
          setTimeout(() => router.push('/(auth)/guidelines'), 1500);
        }
      } catch {
        // Keep polling on network errors
      }
    }, 5000);
  };

  const skipForNow = () => {
    router.push('/(auth)/guidelines');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🛡️</Text>
      <Text style={styles.title}>Verify Your Identity</Text>
      <Text style={styles.subtitle}>
        SafeTea uses Didit to verify your identity. This helps keep our community safe.
        Your documents are never stored.
      </Text>

      {state === 'idle' && (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>What you'll need:</Text>
            <Text style={styles.infoItem}>• A valid government-issued ID</Text>
            <Text style={styles.infoItem}>• A quick selfie for face matching</Text>
            <Text style={styles.infoItem}>• Good lighting and a steady hand</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={startVerification}>
            <Text style={styles.primaryButtonText}>Start Verification</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={skipForNow}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </Pressable>
        </>
      )}

      {(state === 'creating') && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={Colors.coral} size="large" />
          <Text style={styles.statusText}>Setting up verification...</Text>
        </View>
      )}

      {(state === 'pending' || state === 'polling') && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={Colors.coral} size="large" />
          <Text style={styles.statusText}>Complete verification in your browser</Text>
          <Text style={styles.statusSubtext}>
            We'll automatically detect when you're done. This page will update.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={startVerification}>
            <Text style={styles.secondaryButtonText}>Reopen Verification</Text>
          </Pressable>
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
          <Text style={styles.statusSubtext}>Your ID could not be verified. Please try again.</Text>
          <Pressable style={styles.primaryButton} onPress={startVerification}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {state === 'error' && (
        <View style={styles.statusBox}>
          <Text style={styles.failText}>{errorMsg}</Text>
          <Pressable style={styles.primaryButton} onPress={startVerification}>
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
  infoBox: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, width: '100%', marginTop: Spacing.md,
  },
  infoTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  infoItem: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22 },
  primaryButton: {
    backgroundColor: Colors.coral, paddingVertical: 16, paddingHorizontal: 48,
    borderRadius: BorderRadius.lg, width: '100%', alignItems: 'center', marginTop: Spacing.md,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1, borderColor: Colors.coral, paddingVertical: 12, paddingHorizontal: 32,
    borderRadius: BorderRadius.lg, marginTop: Spacing.sm,
  },
  secondaryButtonText: { color: Colors.coral, fontSize: FontSize.sm, fontWeight: '600' },
  skipButton: { paddingVertical: 12 },
  skipButtonText: { color: Colors.textMuted, fontSize: FontSize.sm },
  statusBox: { alignItems: 'center', gap: Spacing.md, marginTop: Spacing.lg },
  statusText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  statusSubtext: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  successIcon: { fontSize: 48 },
  successText: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.success },
  failIcon: { fontSize: 48 },
  failText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.danger, textAlign: 'center' },
});

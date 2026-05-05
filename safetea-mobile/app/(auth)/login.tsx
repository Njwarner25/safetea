import { View, Text, TextInput, StyleSheet, Pressable, Alert, ActivityIndicator, Image, Platform } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';
import { useCityStore } from '../../store/cityStore';
import { useAuthStore } from '../../store/authStore';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const selectedCityId = useCityStore((s) => s.selectedCityId);

  const handleSendCode = async () => {
    if (!phone.trim() || phone.trim().length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.sendVerificationCode(phone.trim());
      if (res.status === 200) {
        setCodeSent(true);
        Alert.alert('Code Sent', 'Check your text messages for a 6-digit code.');
      } else {
        const msg = (res.data as any)?.error || 'Failed to send code.';
        Alert.alert('Error', msg);
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim() || code.trim().length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.verifyCode(phone.trim(), code.trim());
      // Backend returns { status, data: { token, user } } — token may be at top level or nested
      const raw = res.data as any;
      const token = raw?.token || raw?.data?.token;
      const userData = raw?.user || raw?.data?.user;

      if (res.status === 200 && token) {
        api.setToken(token);

        // Store user from verify response, or fetch via /auth/me
        if (userData) {
          const user = { ...userData };
          if (user.tier === 'premium' || user.tier === 'pro') user.tier = 'plus';
          if (user.subscription_tier) {
            user.tier = (user.subscription_tier === 'premium' || user.subscription_tier === 'pro') ? 'plus' : user.subscription_tier;
          }
          useAuthStore.getState().setUser(user);
        } else {
          try {
            const meRes = await api.getMe();
            if (meRes.status === 200 && meRes.data) {
              const user = (meRes.data as any).user || meRes.data;
              if (user && (user.tier === 'premium' || user.tier === 'pro')) user.tier = 'plus';
              if (user?.subscription_tier) {
                user.tier = (user.subscription_tier === 'premium' || user.subscription_tier === 'pro') ? 'plus' : user.subscription_tier;
              }
              useAuthStore.getState().setUser(user);
            }
          } catch { /* continue */ }
        }

        // Route: no city → select city, otherwise → tabs
        if (!selectedCityId) {
          router.replace('/(auth)/select-city');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        const msg = raw?.error || raw?.data?.error || 'Invalid code. Please try again.';
        Alert.alert('Error', msg);
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.content}>
        {Platform.OS === 'ios' ? (
          <Image source={require('../../assets/icon-linkher.png')} style={styles.loginLogo} resizeMode="contain" />
        ) : (
          <Text style={styles.emoji}>🍵</Text>
        )}
        <Text style={styles.title}>{codeSent ? 'Enter Code' : 'Sign In'}</Text>
        <Text style={styles.subtitle}>
          {codeSent
            ? `We sent a 6-digit code to ${phone}`
            : 'Enter your phone number to get started.'}
        </Text>

        {!codeSent ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Phone number (e.g. 312-555-1234)"
              placeholderTextColor={Colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoFocus
            />
            <Pressable
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Send Code</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor={Colors.textMuted}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <Pressable
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleVerifyCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify & Sign In</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.resendBtn}
              onPress={() => { setCodeSent(false); setCode(''); }}
            >
              <Text style={styles.resendText}>Use a different number</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
  backBtn: { marginTop: 50 },
  backText: { color: Colors.textSecondary, fontSize: FontSize.md },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loginLogo: { width: 72, height: 72, marginBottom: Spacing.md, borderRadius: 16 },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 20 },
  input: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.lg,
    borderWidth: 1, borderColor: Colors.border, textAlign: 'center',
    letterSpacing: 2, marginBottom: Spacing.md,
  },
  primaryBtn: {
    width: '100%', backgroundColor: Colors.coral, padding: Spacing.md,
    borderRadius: BorderRadius.lg, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.lg },
  resendBtn: { marginTop: Spacing.lg },
  resendText: { color: Colors.textMuted, fontSize: FontSize.sm },
});

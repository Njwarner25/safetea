import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME_PLUS } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { router } from 'expo-router';

export default function ConversationScannerScreen() {
  const user = useAuthStore((s) => s.user);
  const [text, setText] = useState('');
  const [screenshots, setScreenshots] = useState<{ uri: string; base64: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'text' | 'screenshots'>('screenshots');

  if (user?.tier === 'free') {
    return (
      <View style={styles.container}>
        <View style={styles.gateCard}>
          <FontAwesome5 name="lock" size={36} color={Colors.textMuted} />
          <Text style={styles.gateTitle}>Conversation Scanner is a {APP_NAME_PLUS} Feature</Text>
          <Text style={styles.gateDesc}>Upload conversation screenshots or paste text to scan for manipulation and red flags.</Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>Upgrade to {APP_NAME_PLUS}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pickScreenshots = async () => {
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.3,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      exif: false,
    });
    if (!pickerResult.canceled && pickerResult.assets.length > 0) {
      const picked = pickerResult.assets
        .filter((a) => a.base64)
        .map((a) => ({ uri: a.uri, base64: a.base64! }));
      setScreenshots(picked);
      setResult(null);
      setError('');
    }
  };

  const handleScan = async () => {
    const hasText = text.trim().length > 0;
    const hasImages = screenshots.length > 0;
    if ((!hasText && !hasImages) || scanning) return;

    setScanning(true);
    setError('');
    setResult(null);
    try {
      const textImages = hasImages
        ? screenshots.map((s) => `data:image/jpeg;base64,${s.base64}`)
        : undefined;
      const conversationText = hasText ? text.trim() : undefined;
      const res = await api.scanConversation(conversationText, textImages);
      if (res.status === 200 && res.data) {
        setResult((res.data as any).scan || res.data);
      } else if (res.status === 429) {
        setError('Rate limit reached. Please wait a few minutes.');
      } else {
        setError((res.data as any)?.error || 'Could not complete scan.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setScanning(false);
  };

  const riskColor = (rating: string) => {
    if (rating === 'danger') return Colors.danger;
    if (rating === 'caution') return Colors.warning;
    return Colors.success;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Conversation Scanner</Text>
        <Text style={styles.desc}>Upload screenshots of dating app conversations or paste text to scan for red flags and manipulation tactics.</Text>

        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, mode === 'screenshots' && styles.modeBtnActive]} onPress={() => setMode('screenshots')}>
            <FontAwesome5 name="image" size={14} color={mode === 'screenshots' ? '#FFF' : Colors.textMuted} />
            <Text style={[styles.modeBtnText, mode === 'screenshots' && styles.modeBtnTextActive]}>Screenshots</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]} onPress={() => setMode('text')}>
            <FontAwesome5 name="keyboard" size={14} color={mode === 'text' ? '#FFF' : Colors.textMuted} />
            <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>Paste Text</Text>
          </Pressable>
        </View>

        {mode === 'screenshots' ? (
          <>
            {screenshots.length > 0 ? (
              <View style={styles.imageGrid}>
                {screenshots.map((img, i) => (
                  <Image key={i} source={{ uri: img.uri }} style={styles.thumbnail} resizeMode="cover" />
                ))}
              </View>
            ) : (
              <Pressable style={styles.uploadArea} onPress={pickScreenshots}>
                <FontAwesome5 name="images" size={36} color={Colors.textMuted} />
                <Text style={styles.uploadText}>Tap to select screenshots (1-5)</Text>
              </Pressable>
            )}
            {screenshots.length > 0 && (
              <Pressable style={styles.changeBtn} onPress={pickScreenshots}>
                <Text style={styles.changeBtnText}>Change Screenshots</Text>
              </Pressable>
            )}
          </>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Paste conversation text here..."
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
          />
        )}

        <Pressable
          style={[styles.scanBtn, ((!text.trim() && screenshots.length === 0) || scanning) && { opacity: 0.4 }]}
          onPress={handleScan}
          disabled={(!text.trim() && screenshots.length === 0) || scanning}
        >
          {scanning ? (
            <View style={styles.scanningRow}>
              <ActivityIndicator color="#FFF" />
              <Text style={styles.scanBtnText}> Analyzing...</Text>
            </View>
          ) : (
            <Text style={styles.scanBtnText}>Scan for Red Flags</Text>
          )}
        </Pressable>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {result && (
        <View style={styles.resultsCard}>
          <View style={styles.ratingRow}>
            <View style={[styles.ratingBadge, { backgroundColor: riskColor(result.overall_rating || 'safe') + '20' }]}>
              <Text style={[styles.ratingText, { color: riskColor(result.overall_rating || 'safe') }]}>
                {(result.overall_rating || 'safe').toUpperCase()}
              </Text>
            </View>
            {result.risk_score != null && (
              <Text style={[styles.riskScore, { color: riskColor(result.overall_rating || 'safe') }]}>
                Risk: {result.risk_score}/100
              </Text>
            )}
          </View>

          {result.summary && <Text style={styles.summaryText}>{result.summary}</Text>}
          {result.motive_assessment && (
            <View style={styles.motiveCard}>
              <Text style={styles.motiveLabel}>Motive Assessment</Text>
              <Text style={styles.motiveText}>{result.motive_assessment}</Text>
            </View>
          )}

          {result.red_flags?.length > 0 && (
            <View style={styles.flagSection}>
              <Text style={styles.flagSectionTitle}>🚩 Red Flags ({result.red_flags.length})</Text>
              {result.red_flags.map((f: any, i: number) => (
                <View key={i} style={styles.flagCard}>
                  <View style={styles.flagHeader}>
                    <Text style={styles.flagLabel}>{f.flag}</Text>
                    {f.severity && (
                      <View style={[styles.severityBadge, { backgroundColor: (f.severity === 'critical' || f.severity === 'high' ? Colors.danger : Colors.warning) + '20' }]}>
                        <Text style={[styles.severityText, { color: f.severity === 'critical' || f.severity === 'high' ? Colors.danger : Colors.warning }]}>{f.severity}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.flagDetail}>{f.detail}</Text>
                </View>
              ))}
            </View>
          )}

          {result.yellow_flags?.length > 0 && (
            <View style={styles.flagSection}>
              <Text style={styles.flagSectionTitle}>⚠️ Yellow Flags ({result.yellow_flags.length})</Text>
              {result.yellow_flags.map((f: any, i: number) => (
                <View key={i} style={styles.flagCard}>
                  <Text style={styles.flagLabel}>{f.flag}</Text>
                  <Text style={styles.flagDetail}>{f.detail}</Text>
                </View>
              ))}
            </View>
          )}

          {result.green_flags?.length > 0 && (
            <View style={styles.flagSection}>
              <Text style={styles.flagSectionTitle}>✅ Green Flags ({result.green_flags.length})</Text>
              {result.green_flags.map((f: any, i: number) => (
                <View key={i} style={styles.flagCard}>
                  <Text style={styles.flagLabel}>{f.flag}</Text>
                  <Text style={styles.flagDetail}>{f.detail}</Text>
                </View>
              ))}
            </View>
          )}

          {result.manipulation_tactics?.length > 0 && (
            <View style={styles.tacticsCard}>
              <Text style={styles.flagSectionTitle}>Manipulation Tactics Detected</Text>
              <Text style={styles.tacticsText}>{result.manipulation_tactics.join(' · ')}</Text>
            </View>
          )}

          {result.safety_tips?.length > 0 && (
            <View style={styles.tipsCard}>
              <Text style={styles.flagSectionTitle}>Safety Tips</Text>
              {result.safety_tips.map((tip: string, i: number) => (
                <Text key={i} style={styles.tipText}>• {tip}</Text>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },
  modeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.xs },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm },
  modeBtnActive: { backgroundColor: Colors.coral },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  modeBtnTextActive: { color: '#FFF' },
  uploadArea: { height: 140, backgroundColor: Colors.background, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  uploadText: { fontSize: FontSize.sm, color: Colors.textMuted },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  thumbnail: { width: 60, height: 100, borderRadius: BorderRadius.sm },
  changeBtn: { alignItems: 'center', padding: Spacing.sm, marginBottom: Spacing.sm },
  changeBtnText: { color: Colors.coral, fontSize: FontSize.sm, fontWeight: '600' },
  input: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.sm, minHeight: 150, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  scanBtn: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  scanningRow: { flexDirection: 'row', alignItems: 'center' },
  scanBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  errorText: { color: Colors.danger, fontSize: FontSize.sm, marginTop: Spacing.sm, textAlign: 'center' },
  resultsCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  ratingBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full },
  ratingText: { fontSize: FontSize.md, fontWeight: '700' },
  riskScore: { fontSize: FontSize.lg, fontWeight: '800' },
  summaryText: { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 22, marginBottom: Spacing.md },
  motiveCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  motiveLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.coral, marginBottom: 4 },
  motiveText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  flagSection: { marginBottom: Spacing.md },
  flagSectionTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  flagCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.xs },
  flagHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  flagLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  severityText: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  flagDetail: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  tacticsCard: { backgroundColor: Colors.dangerMuted, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  tacticsText: { fontSize: FontSize.sm, color: Colors.danger, fontWeight: '600' },
  tipsCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md },
  tipText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  gateCard: { margin: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  gateTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  gateDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  upgradeBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  upgradeBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
});

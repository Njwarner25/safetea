import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME_PLUS } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { router } from 'expo-router';

export default function PhotoVerifyScreen() {
  const user = useAuthStore((s) => s.user);
  const [images, setImages] = useState<{ uri: string; base64: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  if (user?.tier === 'free') {
    return (
      <View style={styles.container}>
        <View style={styles.gateCard}>
          <FontAwesome5 name="lock" size={36} color={Colors.textMuted} />
          <Text style={styles.gateTitle}>Photo Verify is a {APP_NAME_PLUS} Feature</Text>
          <Text style={styles.gateDesc}>Upload photos to check for AI-generated images, editing, and inconsistencies.</Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>Upgrade to {APP_NAME_PLUS}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pickImages = async () => {
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (!pickerResult.canceled && pickerResult.assets.length > 0) {
      const picked = pickerResult.assets
        .filter((a) => a.base64)
        .map((a) => ({ uri: a.uri, base64: a.base64! }));
      setImages(picked);
      setResult(null);
      setError('');
    }
  };

  const handleAnalyze = async () => {
    if (images.length === 0 || analyzing) return;
    setAnalyzing(true);
    setError('');
    setResult(null);
    try {
      const base64Images = images.map((img) => `data:image/jpeg;base64,${img.base64}`);
      const res = await api.verifyPhotos(base64Images);
      if (res.status === 200 && res.data) {
        setResult(res.data);
      } else if (res.status === 429) {
        const d = res.data as any;
        setError(d?.message || `Monthly limit reached (${d?.checksUsed}/${d?.checksLimit}).`);
      } else {
        setError((res.data as any)?.error || 'Verification failed. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setAnalyzing(false);
  };

  const riskColor = (risk: string) => risk === 'high' ? Colors.danger : risk === 'moderate' ? Colors.warning : Colors.success;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Photo Authenticity Check</Text>
        <Text style={styles.desc}>Select 1-4 dating profile photos to check for AI generation, manipulation, or inconsistencies.</Text>

        {images.length > 0 ? (
          <View style={styles.imageGrid}>
            {images.map((img, i) => (
              <Image key={i} source={{ uri: img.uri }} style={styles.thumbnail} resizeMode="cover" />
            ))}
          </View>
        ) : (
          <Pressable style={styles.uploadArea} onPress={pickImages}>
            <FontAwesome5 name="images" size={36} color={Colors.textMuted} />
            <Text style={styles.uploadText}>Tap to select photos (1-4)</Text>
          </Pressable>
        )}

        {images.length > 0 && (
          <View style={styles.actionRow}>
            <Pressable style={styles.changeBtn} onPress={pickImages}>
              <Text style={styles.changeBtnText}>Change Photos</Text>
            </Pressable>
            <Pressable
              style={[styles.analyzeBtn, analyzing && { opacity: 0.4 }]}
              onPress={handleAnalyze}
              disabled={analyzing}
            >
              {analyzing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.analyzeBtnText}>Analyze</Text>}
            </Pressable>
          </View>
        )}

        {analyzing && (
          <View style={styles.analyzingRow}>
            <ActivityIndicator color={Colors.coral} />
            <Text style={styles.analyzingText}>Analyzing {images.length} photo{images.length > 1 ? 's' : ''}...</Text>
          </View>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {result && (
        <View style={styles.resultCard}>
          <View style={styles.overallRow}>
            <View style={[styles.riskBadge, { backgroundColor: riskColor(result.overallRisk || 'low') + '20' }]}>
              <Text style={[styles.riskText, { color: riskColor(result.overallRisk || 'low') }]}>
                {(result.overallRisk || 'low').toUpperCase()} RISK
              </Text>
            </View>
            {result.checksRemaining != null && (
              <Text style={styles.checksText}>{result.checksRemaining} checks left</Text>
            )}
          </View>

          {result.layers?.aiGeneration?.map((gen: any, i: number) => (
            <View key={i} style={styles.layerCard}>
              <Text style={styles.layerTitle}>Photo {i + 1} — AI Detection</Text>
              <Text style={styles.layerDetail}>
                {gen.likelyAIGenerated ? '⚠️ Likely AI-generated' : '✅ Appears genuine'}
                {gen.filterDetected ? ` · Filter: ${gen.filterType}` : ''}
              </Text>
              {gen.summary && <Text style={styles.layerSummary}>{gen.summary}</Text>}
            </View>
          ))}

          {result.layers?.consistency && images.length > 1 && (
            <View style={styles.layerCard}>
              <Text style={styles.layerTitle}>Consistency Check</Text>
              <Text style={styles.layerDetail}>
                Same person: {result.layers.consistency.samePerson === true ? '✅ Yes' : result.layers.consistency.samePerson === false ? '❌ No' : '❓ Uncertain'}
              </Text>
              {result.layers.consistency.summary && <Text style={styles.layerSummary}>{result.layers.consistency.summary}</Text>}
            </View>
          )}

          {result.layers?.screenshot?.map((ss: any, i: number) => (
            <View key={i} style={styles.layerCard}>
              <Text style={styles.layerTitle}>Screenshot Analysis {ss.platform ? `(${ss.platform})` : ''}</Text>
              {ss.photoRedFlags?.length > 0 && <Text style={styles.flagList}>🚩 {ss.photoRedFlags.join(', ')}</Text>}
              {ss.positiveSignals?.length > 0 && <Text style={styles.greenList}>✅ {ss.positiveSignals.join(', ')}</Text>}
              {ss.summary && <Text style={styles.layerSummary}>{ss.summary}</Text>}
            </View>
          ))}

          {result.recommendations?.length > 0 && (
            <View style={styles.tipsCard}>
              <Text style={styles.layerTitle}>Recommendations</Text>
              {result.recommendations.map((tip: string, i: number) => (
                <Text key={i} style={styles.tipText}>• {tip}</Text>
              ))}
            </View>
          )}

          <Pressable style={styles.scanAgainBtn} onPress={() => { setImages([]); setResult(null); }}>
            <Text style={styles.scanAgainText}>Scan More Photos</Text>
          </Pressable>
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
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 20 },
  uploadArea: { height: 160, backgroundColor: Colors.background, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  uploadText: { fontSize: FontSize.sm, color: Colors.textMuted },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  thumbnail: { width: 80, height: 80, borderRadius: BorderRadius.md },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  changeBtn: { flex: 1, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  changeBtnText: { color: Colors.textSecondary, fontWeight: '600' },
  analyzeBtn: { flex: 1, backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  analyzeBtnText: { color: '#FFF', fontWeight: '700' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  analyzingText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  errorText: { color: Colors.danger, fontSize: FontSize.sm, marginTop: Spacing.sm, textAlign: 'center' },
  resultCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  riskBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full },
  riskText: { fontSize: FontSize.sm, fontWeight: '700' },
  checksText: { fontSize: FontSize.xs, color: Colors.textMuted },
  layerCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  layerTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  layerDetail: { fontSize: FontSize.sm, color: Colors.textSecondary },
  layerSummary: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.xs, lineHeight: 18 },
  flagList: { fontSize: FontSize.sm, color: Colors.danger, marginTop: 4 },
  greenList: { fontSize: FontSize.sm, color: Colors.success, marginTop: 4 },
  tipsCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  tipText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  scanAgainBtn: { borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.sm },
  scanAgainText: { color: Colors.textSecondary, fontWeight: '600' },
  gateCard: { margin: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  gateTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  gateDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  upgradeBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  upgradeBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
});

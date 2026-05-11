import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { AlessiaScreen } from '../../components/companion/AlessiaScreen';
import { AlessiaAvatarCard } from '../../components/companion/AlessiaAvatarCard';
import { AlessiaVoicePulse } from '../../components/companion/AlessiaVoicePulse';
import { AlessiaGradientButton } from '../../components/companion/AlessiaGradientButton';
import {
  AlessiaColors,
  ALESSIA_STYLES,
  ALESSIA_DEFAULT_PREVIEW,
} from '../../constants/companion';
import { useAiCompanionStore } from '../../store/aiCompanionStore';

export default function Preview() {
  const router = useRouter();
  const styleId = useAiCompanionStore((s) => s.styleId);
  const completeOnboarding = useAiCompanionStore((s) => s.completeOnboarding);
  const styleDef = ALESSIA_STYLES.find((s) => s.id === styleId) || ALESSIA_STYLES[0];

  return (
    <AlessiaScreen contentStyle={{ alignItems: 'center' }}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <FontAwesome5 name="chevron-left" size={18} color={AlessiaColors.white} />
        </Pressable>
        <Text style={styles.title}>Preview Alessia</Text>
        <View style={{ width: 28 }} />
      </View>

      <AlessiaAvatarCard icon={styleDef.icon} size={180} />

      <View style={styles.bubble}>
        <Text style={styles.bubbleTitle}>Hi, I'm Alessia.</Text>
        <Text style={styles.bubbleBody}>{ALESSIA_DEFAULT_PREVIEW}</Text>
        <AlessiaVoicePulse height={24} />
      </View>

      <AlessiaGradientButton
        label="Confirm Alessia"
        style={{ width: '100%' }}
        onPress={() => {
          completeOnboarding();
          router.push('/companion/ready' as any);
        }}
      />
    </AlessiaScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  back: { padding: 4 },
  title: {
    color: AlessiaColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  bubble: {
    width: '100%',
    backgroundColor: AlessiaColors.card,
    borderColor: AlessiaColors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  bubbleTitle: {
    color: AlessiaColors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  bubbleBody: {
    color: AlessiaColors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});

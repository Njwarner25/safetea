import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { AlessiaScreen } from '../../components/companion/AlessiaScreen';
import { SafeTeaLogoHeader } from '../../components/companion/SafeTeaLogoHeader';
import { AlessiaAvatarCard } from '../../components/companion/AlessiaAvatarCard';
import { AlessiaVoicePulse } from '../../components/companion/AlessiaVoicePulse';
import { AlessiaFeatureGrid } from '../../components/companion/AlessiaFeatureGrid';
import { AlessiaColors, ALESSIA_STYLES } from '../../constants/companion';
import { useAiCompanionStore } from '../../store/aiCompanionStore';

export default function AlessiaHome() {
  const router = useRouter();
  const styleId = useAiCompanionStore((s) => s.styleId);
  const styleDef = ALESSIA_STYLES.find((s) => s.id === styleId) || ALESSIA_STYLES[0];

  return (
    <AlessiaScreen>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <FontAwesome5 name="chevron-left" size={18} color={AlessiaColors.white} />
        </Pressable>
        <SafeTeaLogoHeader />
        <View style={styles.topRowIcons}>
          <Pressable
            onPress={() => router.push('/companion/briefs' as any)}
            hitSlop={12}
          >
            <FontAwesome5 name="shield-alt" size={18} color={AlessiaColors.coral} solid />
          </Pressable>
          <Pressable onPress={() => router.push('/companion/style' as any)} hitSlop={12}>
            <FontAwesome5 name="cog" size={18} color={AlessiaColors.muted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.heroRow}>
        <AlessiaAvatarCard icon={styleDef.icon} size={84} />
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Talk to Alessia Anytime</Text>
          <Text style={styles.body}>I'm here for you, always. Let's stay safe together.</Text>
          <AlessiaVoicePulse height={20} />
        </View>
      </View>

      <View style={styles.quickActions}>
        <QuickAction
          icon="comment-dots"
          label="In-App Chat"
          onPress={() => router.push('/companion/chat' as any)}
        />
        <QuickAction icon="microphone-alt" label="Voice Chat" />
        <QuickAction icon="bell" label="Smart Alerts" />
      </View>

      <AlessiaFeatureGrid />

      <View style={styles.footer}>
        <Text style={styles.footerHeart}>♥</Text>
        <Text style={styles.footerText}>
          More than AI. She's your protector, your confidante, your ally.{'\n'}You're never alone.
        </Text>
      </View>
    </AlessiaScreen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
}) {
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.qa} onPress={onPress}>
      <View style={styles.qaIcon}>
        <FontAwesome5 name={icon as any} size={18} color={AlessiaColors.coral} solid />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRowIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  back: { padding: 4 },
  heroRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    backgroundColor: AlessiaColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AlessiaColors.border,
  },
  hello: {
    color: AlessiaColors.coral,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  body: {
    color: AlessiaColors.white,
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 6,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  qa: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: AlessiaColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AlessiaColors.borderMuted,
    gap: 8,
  },
  qaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,107,107,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    color: AlessiaColors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  footerHeart: {
    color: AlessiaColors.rose,
    fontSize: 18,
  },
  footerText: {
    color: AlessiaColors.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

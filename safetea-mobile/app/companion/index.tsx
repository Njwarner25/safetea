import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlessiaScreen } from '../../components/companion/AlessiaScreen';
import { SafeTeaLogoHeader } from '../../components/companion/SafeTeaLogoHeader';
import { AlessiaAvatarCard } from '../../components/companion/AlessiaAvatarCard';
import { AlessiaGradientButton } from '../../components/companion/AlessiaGradientButton';
import { AlessiaColors } from '../../constants/companion';
import { useAiCompanionStore } from '../../store/aiCompanionStore';

export default function MeetAlessia() {
  const router = useRouter();
  const applyDefaults = useAiCompanionStore((s) => s.applyDefaults);
  const onboarded = useAiCompanionStore((s) => s.onboarded);

  // If the user has already finished onboarding, jump straight to the hub.
  useEffect(() => {
    if (onboarded) router.replace('/companion/home' as any);
  }, [onboarded, router]);

  return (
    <AlessiaScreen contentStyle={{ alignItems: 'center', gap: 24 }}>
      <SafeTeaLogoHeader />
      <Text style={styles.title}>Meet Alessia</Text>
      <Text style={styles.subtitle}>
        Your AI protector.{'\n'}Always here.{'\n'}Always by your side.
      </Text>
      <View style={styles.avatarWrap}>
        <AlessiaAvatarCard icon="heart" size={180} />
      </View>
      <View style={styles.buttons}>
        <AlessiaGradientButton
          label="Customize Alessia"
          onPress={() => router.push('/companion/style' as any)}
        />
        <AlessiaGradientButton
          label="Use Default"
          variant="secondary"
          onPress={() => {
            applyDefaults();
            router.push('/companion/ready' as any);
          }}
        />
      </View>
    </AlessiaScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: AlessiaColors.white,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  subtitle: {
    color: AlessiaColors.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  avatarWrap: {
    paddingVertical: 12,
  },
  buttons: {
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
});

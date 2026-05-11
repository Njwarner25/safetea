import { View, Text, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlessiaScreen } from '../../components/companion/AlessiaScreen';
import { AlessiaGradientButton } from '../../components/companion/AlessiaGradientButton';
import { AlessiaColors } from '../../constants/companion';
import { useAiCompanionStore } from '../../store/aiCompanionStore';

export default function Ready() {
  const router = useRouter();
  const completeOnboarding = useAiCompanionStore((s) => s.completeOnboarding);

  return (
    <AlessiaScreen contentStyle={{ alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Image
        source={require('../../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Alessia is Ready</Text>
      <Text style={styles.body}>
        Your AI protector{'\n'}is all set up.{'\n\n'}Let's keep you safe together.
      </Text>
      <View style={styles.button}>
        <AlessiaGradientButton
          label="Get Started"
          onPress={() => {
            completeOnboarding();
            router.replace('/companion/home' as any);
          }}
        />
      </View>
    </AlessiaScreen>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 180,
    height: 180,
    borderRadius: 36,
  },
  title: {
    color: AlessiaColors.white,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    color: AlessiaColors.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  button: {
    width: '100%',
  },
});

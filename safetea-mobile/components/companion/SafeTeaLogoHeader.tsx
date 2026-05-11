import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { AlessiaColors } from '../../constants/companion';

const brandLogo =
  Platform.OS === 'ios'
    ? require('../../assets/logo-linkher.png')
    : require('../../assets/logo.png');

interface Props {
  subtitle?: string;
}

export function SafeTeaLogoHeader({ subtitle = 'AI COMPANION' }: Props) {
  return (
    <View style={styles.row}>
      <Image source={brandLogo} style={styles.logo} resizeMode="contain" />
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  logo: {
    width: 160,
    height: 56,
  },
  subtitle: {
    color: AlessiaColors.muted,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '600',
  },
});

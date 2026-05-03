import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, BorderRadius, Spacing } from '../constants/colors';
import type { UserTier } from '../store/authStore';

type Props = {
  tier?: UserTier | string;
  size?: 'sm' | 'md';
};

/**
 * Renders a "PLUS" pill badge next to usernames for Plus members.
 * Shows on all posts (including anonymous) to reward Plus members.
 *
 * Usage:
 *   <PlusBadge tier={post.authorTier} />
 *   <PlusBadge tier={user.tier} size="md" />
 */
export default function PlusBadge({ tier, size = 'sm' }: Props) {
  if (!tier || tier === 'free') return null;

  return (
    <View style={[styles.pill, size === 'md' && styles.pillMd]}>
      <Text style={[styles.text, size === 'md' && styles.textMd]}>PLUS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: Colors.coral,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.xs,
    alignSelf: 'center',
  },
  pillMd: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  text: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textInverse,
    letterSpacing: 0.8,
  },
  textMd: {
    fontSize: FontSize.xs,
  },
});

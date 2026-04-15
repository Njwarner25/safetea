import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';

type Tool = {
  icon: string;
  title: string;
  desc: string;
  color: string;
  bgColor: string;
  route?: string;
};

const TOOLS: Tool[] = [
  {
    icon: 'calendar-check',
    title: 'SafeTea Check-In',
    desc: 'Share your plans with a trusted contact and set timed check-ins for safety',
    color: Colors.coral,
    bgColor: Colors.coralMuted,
    route: '/safewalk',
  },
  {
    icon: 'camera',
    title: 'Photo Verification',
    desc: 'Verify someone\'s photos are real — AI-powered reverse image and deepfake detection',
    color: Colors.info,
    bgColor: Colors.infoMuted,
    route: '/photo-verify',
  },
  {
    icon: 'flag',
    title: 'Conversation Scanner',
    desc: 'Paste a dating profile or conversation to scan for manipulation tactics and red flags',
    color: Colors.warning,
    bgColor: Colors.warningMuted,
    route: '/screening',
  },
  {
    icon: 'microphone-alt',
    title: 'SOS Record & Protect',
    desc: 'Instantly record audio, send your location, and alert your emergency contacts',
    color: Colors.danger,
    bgColor: Colors.dangerMuted,
    route: '/sos',
  },
  {
    icon: 'eye',
    title: 'Name Watch',
    desc: 'Monitor names of people you\'re dating and get alerts when they\'re mentioned',
    color: Colors.pink,
    bgColor: Colors.pinkMuted,
    route: '/name-watch',
  },
];

export default function ToolsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>
        Your personal safety toolkit for every stage of dating.
      </Text>

      {TOOLS.map((tool) => (
        <Pressable
          key={tool.title}
          style={({ pressed }) => [styles.toolCard, pressed && styles.toolCardPressed]}
          onPress={() => tool.route && router.push(tool.route as any)}
        >
          <View style={[styles.iconCircle, { backgroundColor: tool.bgColor }]}>
            <FontAwesome5 name={tool.icon} size={22} color={tool.color} />
          </View>
          <View style={styles.toolInfo}>
            <Text style={styles.toolTitle}>{tool.title}</Text>
            <Text style={styles.toolDesc}>{tool.desc}</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={14} color={Colors.textMuted} />
        </Pressable>
      ))}

      <View style={styles.footer}>
        <FontAwesome5 name="shield-alt" size={14} color={Colors.textMuted} style={{ marginBottom: 6 }} />
        <Text style={styles.footerText}>
          All tools are designed with your privacy in mind. No data is shared without your explicit consent.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  toolCardPressed: {
    borderColor: 'rgba(232,160,181,0.2)',
    backgroundColor: Colors.surfaceHover,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolInfo: { flex: 1 },
  toolTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  toolDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  footerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});

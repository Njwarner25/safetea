import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useThemeColors } from '../../constants/useThemeColors';
import SOSActionSheet from '../../components/SOSActionSheet';

type GridTool = {
  icon: string;
  title: string;
  desc: string;
  color: string;
  bgColor: string;
  route: string;
};

const VAULT_STATS = { entries: 12, photos: 4, audio: 2, guardian: 'Set' };

export default function ToolsScreen() {
  const colors = useThemeColors();
  const [sosVisible, setSOSVisible] = useState(false);

  const gridTools: GridTool[] = [
    { icon: 'calendar-check', title: 'Check-In', desc: 'Share plans via SMS', color: colors.success, bgColor: colors.successMuted, route: '/safewalk' },
    { icon: 'camera', title: 'Photo Verify', desc: 'Detect catfishing', color: colors.info, bgColor: colors.infoMuted, route: '/photo-verify' },
    { icon: 'flag', title: 'Convo Scanner', desc: 'Analyze red flags', color: colors.warning, bgColor: colors.warningMuted, route: '/screening' },
    { icon: 'link', title: 'SafeLink', desc: 'Live location share', color: colors.pink, bgColor: colors.pinkMuted, route: '/safelink' },
    { icon: 'heartbeat', title: 'Pulse', desc: 'Session monitoring', color: colors.purple, bgColor: colors.purpleMuted, route: '/pulse' },
    { icon: 'eye', title: 'Name Watch', desc: 'Monitor mentions', color: colors.warning, bgColor: colors.warningMuted, route: '/name-watch' },
  ];

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your personal safety toolkit for every stage of dating.
        </Text>

        {/* Zone 1 — Emergency SOS Banner */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Emergency SOS. Opens emergency options: fake call, record audio, or call 911"
          onPress={() => setSOSVisible(true)}
          style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[colors.sosBannerStart, colors.sosBannerEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.sosBanner, { borderColor: colors.sosBannerBorder }]}
          >
            <View style={styles.sosBannerRow}>
              <FontAwesome5 name="exclamation-triangle" size={22} color={colors.danger} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sosTitle, { color: colors.textPrimary }]}>Emergency SOS</Text>
                <Text style={[styles.sosSubtitle, { color: colors.textMuted }]}>Fake call · Record · 911</Text>
              </View>
              <View style={[styles.tapBadge, { backgroundColor: colors.dangerMuted }]}>
                <Text style={[styles.tapBadgeText, { color: colors.danger }]}>TAP</Text>
              </View>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Zone 2 — Safety Vault Card */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Safety Vault. Private encrypted journal with ${VAULT_STATS.entries} entries`}
          onPress={() => router.push('/vault' as any)}
          style={({ pressed }) => [pressed && { opacity: 0.92 }]}
        >
          <LinearGradient
            colors={[colors.vaultGradientStart, colors.vaultGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.vaultCard, { borderColor: colors.vaultBorder }]}
          >
            {/* Watermark */}
            <FontAwesome5
              name="lock"
              size={80}
              color={colors.vault}
              style={styles.vaultWatermark}
            />
            <View style={styles.vaultTopRow}>
              <View style={[styles.vaultIconCircle, { backgroundColor: colors.vaultMuted }]}>
                <FontAwesome5 name="lock" size={24} color={colors.vault} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.vaultTitleRow}>
                  <Text style={[styles.vaultTitle, { color: colors.textPrimary }]}>Safety Vault</Text>
                  <View style={[styles.plusPill, { backgroundColor: colors.coralMuted }]}>
                    <Text style={[styles.plusPillText, { color: colors.coral }]}>SafeTea+</Text>
                  </View>
                </View>
                <Text style={[styles.vaultDesc, { color: colors.textSecondary }]}>
                  Encrypted journal for your eyes only. Log notes, photos, audio.
                </Text>
              </View>
              <FontAwesome5 name="chevron-right" size={14} color={colors.textMuted} />
            </View>
            <View style={[styles.vaultSeparator, { borderTopColor: colors.vaultBorder }]} />
            <View style={styles.vaultStatsRow}>
              <VaultStat emoji="📝" value={String(VAULT_STATS.entries)} label="Entries" valueColor={colors.vault} bg={colors.vaultMuted} labelColor={colors.textMuted} />
              <VaultStat emoji="📷" value={String(VAULT_STATS.photos)} label="Photos" valueColor={colors.vault} bg={colors.vaultMuted} labelColor={colors.textMuted} />
              <VaultStat emoji="🎙️" value={String(VAULT_STATS.audio)} label="Audio" valueColor={colors.vault} bg={colors.vaultMuted} labelColor={colors.textMuted} />
              <VaultStat emoji="🛡️" value={VAULT_STATS.guardian} label="Guardian" valueColor={colors.vault} bg={colors.vaultMuted} labelColor={colors.textMuted} />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Zone 3 — SOS Record & Protect */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="SOS Record and Protect. Discreet audio recording, location alerts, and emergency triggers"
          onPress={() => router.push('/sos' as any)}
          style={({ pressed }) => [pressed && { opacity: 0.92 }]}
        >
          <LinearGradient
            colors={[colors.sosHighlightBg, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.sosRecordCard, { borderColor: colors.sosHighlightBorder }]}
          >
            <View style={[styles.sosRecordIcon, { backgroundColor: colors.dangerMuted }]}>
              <FontAwesome5 name="microphone-alt" size={20} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sosRecordTitle, { color: colors.textPrimary }]}>SOS Record & Protect</Text>
              <Text style={[styles.sosRecordDesc, { color: colors.textSecondary }]}>
                Discreet audio recording, location alerts & emergency triggers
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color={colors.textMuted} />
          </LinearGradient>
        </Pressable>

        {/* Zone 4 — 3×2 Tool Grid */}
        <View style={styles.grid}>
          {gridTools.map((tool) => (
            <Pressable
              key={tool.title}
              accessibilityRole="button"
              accessibilityLabel={`${tool.title}. ${tool.desc}`}
              onPress={() => router.push(tool.route as any)}
              style={({ pressed }) => [
                styles.gridCell,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && { backgroundColor: colors.surfaceHover, borderColor: colors.borderFocus + '33' },
              ]}
            >
              <View style={[styles.gridIconCircle, { backgroundColor: tool.bgColor }]}>
                <FontAwesome5 name={tool.icon} size={20} color={tool.color} />
              </View>
              <Text style={[styles.gridTitle, { color: colors.textPrimary }]}>{tool.title}</Text>
              <Text style={[styles.gridDesc, { color: colors.textMuted }]}>{tool.desc}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.footer}>
          <FontAwesome5 name="shield-alt" size={14} color={colors.textMuted} style={{ marginBottom: 6 }} />
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            All tools are designed with your privacy in mind. No data is shared without your explicit consent.
          </Text>
        </View>
      </ScrollView>

      <SOSActionSheet visible={sosVisible} onClose={() => setSOSVisible(false)} />
    </>
  );
}

type VaultStatProps = { emoji: string; value: string; label: string; valueColor: string; bg: string; labelColor: string };
function VaultStat({ emoji, value, label, valueColor, bg, labelColor }: VaultStatProps) {
  return (
    <View style={[statStyles.box, { backgroundColor: bg }]}>
      <Text style={statStyles.emoji}>{emoji}</Text>
      <Text style={[statStyles.value, { color: valueColor }]}>{value}</Text>
      <Text style={[statStyles.label, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  box: {
    flex: 1,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  emoji: { fontSize: 16, marginBottom: 2 },
  value: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 1 },
  label: { fontSize: FontSize.xs, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  subtitle: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },

  sosBanner: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sosBannerRow: { flexDirection: 'row', alignItems: 'center' },
  sosTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: 2 },
  sosSubtitle: { fontSize: FontSize.xs },
  tapBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full },
  tapBadgeText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5 },

  vaultCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: 18,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  vaultWatermark: {
    position: 'absolute',
    right: -8,
    bottom: -12,
    opacity: 0.04,
    transform: [{ rotate: '-15deg' }],
  },
  vaultTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  vaultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  plusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  plusPillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  vaultIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vaultTitle: { fontSize: FontSize.xl, fontWeight: '700' },
  vaultDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  vaultSeparator: { borderTopWidth: 1, opacity: 0.5, marginVertical: 10 },
  vaultStatsRow: { flexDirection: 'row', gap: 6 },

  sosRecordCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sosRecordIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosRecordTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 2 },
  sosRecordDesc: { fontSize: FontSize.sm, lineHeight: 18 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: Spacing.xs,
  },
  gridCell: {
    flexBasis: '48.5%',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 14,
  },
  gridIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridTitle: { fontSize: FontSize.sm, fontWeight: '700' },
  gridDesc: { fontSize: 10, marginTop: 2 },

  footer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  footerText: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
});

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';
import type {
  CommunityMention,
  MentionCategory,
  NameMentionsResponse,
} from '../../types/community';

type Props = {
  fullName: string;
  city: string;
  state?: string;
  isOpen: boolean;
  onClose: () => void;
};

export default function NameFeedIntegration({
  fullName,
  city,
  state,
  isOpen,
  onClose,
}: Props) {
  const [data, setData] = useState<NameMentionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<MentionCategory>('tea-talk');

  useEffect(() => {
    if (!isOpen || !fullName || !city) return;

    let ignore = false;

    async function loadMentions() {
      try {
        setLoading(true);
        setError('');

        const params = new URLSearchParams({
          fullName,
          city,
          ...(state ? { state } : {}),
        });

        const res = await api.getNameMentions(fullName, city, state);

        if (res.error) {
          if (!ignore) setError(res.error);
          return;
        }

        if (!ignore) setData(res.data as NameMentionsResponse);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadMentions();

    return () => {
      ignore = true;
    };
  }, [isOpen, fullName, city, state]);

  const filteredPosts = useMemo(() => {
    if (!data) return [];
    return data.posts.filter((post) => post.category === activeTab);
  }, [data, activeTab]);

  if (!isOpen) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerCity}>
            {city}
            {state ? `, ${state}` : ''}
          </Text>
          <Text style={styles.headerName}>{fullName}</Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Close</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {loading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.coral} />
            <Text style={styles.loadingText}>Loading community mentions...</Text>
          </View>
        )}

        {!!error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && data && (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryTitle}>Community mention summary</Text>
                  <Text style={styles.summaryDesc}>
                    {data.totalMentions > 0
                      ? `${fullName} appears in ${data.totalMentions} community mention${data.totalMentions === 1 ? '' : 's'} in ${city}.`
                      : `No current community mentions found for ${fullName} in ${city}.`}
                  </Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {data.totalMentions} mention{data.totalMentions === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.tabRow}>
              <Pressable
                style={[
                  styles.tab,
                  activeTab === 'tea-talk' && styles.tabTeaTalkActive,
                ]}
                onPress={() => setActiveTab('tea-talk')}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'tea-talk' && styles.tabTextActive,
                  ]}
                >
                  Tea Talk ({data.teaTalkCount})
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.tab,
                  activeTab === 'good-guys' && styles.tabGoodGuysActive,
                ]}
                onPress={() => setActiveTab('good-guys')}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'good-guys' && styles.tabTextActive,
                  ]}
                >
                  Good Guys ({data.goodGuysCount})
                </Text>
              </Pressable>
            </View>

            {filteredPosts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  No posts found under this category.
                </Text>
              </View>
            ) : (
              filteredPosts.map((post) => (
                <MentionCard key={post.id} post={post} />
              ))
            )}
          </>
        )}
      </View>
    </View>
  );
}

function MentionCard({ post }: { post: CommunityMention }) {
  const isGoodGuy = post.category === 'good-guys';

  return (
    <View style={styles.mentionCard}>
      <View style={styles.mentionHeader}>
        <View style={styles.mentionAuthorRow}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: isGoodGuy ? Colors.success : Colors.coral },
            ]}
          >
            <Text style={styles.avatarText}>{post.authorInitial}</Text>
          </View>
          <View>
            <Text style={styles.authorName}>{post.authorName}</Text>
            <Text style={styles.authorMeta}>
              {post.createdAt}
              {post.neighborhood ? ` \u00B7 ${post.neighborhood}` : ''}
              {post.city ? `, ${post.city}` : ''}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.categoryBadge,
            {
              backgroundColor: isGoodGuy
                ? Colors.successMuted
                : Colors.coralMuted,
            },
          ]}
        >
          <Text
            style={[
              styles.categoryBadgeText,
              { color: isGoodGuy ? Colors.success : Colors.coral },
            ]}
          >
            {isGoodGuy ? 'Good Guys' : 'Tea Talk'}
          </Text>
        </View>
      </View>

      <Text style={styles.mentionContent}>{post.content}</Text>

      {post.imageUrl ? (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: post.imageUrl }}
            style={styles.postImage}
            resizeMode="cover"
          />
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <Text style={styles.statText}>{'\u2661'} {post.likesCount}</Text>
        <Text style={styles.statText}>{'\uD83D\uDCAC'} {post.commentsCount}</Text>
        {post.repliesLabel ? (
          <Text style={styles.statText}>{post.repliesLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCity: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.coral,
  },
  headerName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  closeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  body: {
    padding: Spacing.lg,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.coralMuted,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  errorCard: {
    backgroundColor: Colors.dangerMuted,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
  },
  summaryCard: {
    backgroundColor: Colors.warningMuted,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  summaryTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.warning,
  },
  summaryDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  countBadge: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  countBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  tabTeaTalkActive: {
    backgroundColor: Colors.coral,
  },
  tabGoodGuysActive: {
    backgroundColor: Colors.success,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.textPrimary,
  },
  emptyCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  mentionCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  mentionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  mentionAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  authorName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  authorMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  categoryBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  categoryBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  mentionContent: {
    fontSize: FontSize.md,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  imageContainer: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: 160,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  statText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
});

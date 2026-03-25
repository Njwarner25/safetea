export type MentionCategory = "tea-talk" | "good-guys";

export interface CommunityMention {
  id: string;
  authorName: string;
  authorInitial: string;
  createdAt: string;
  neighborhood?: string;
  city: string;
  category: MentionCategory;
  content: string;
  imageUrl?: string | null;
  likesCount: number;
  commentsCount: number;
  repliesLabel?: string;
}

export interface NameMentionsResponse {
  query: {
    fullName: string;
    city: string;
    state?: string;
  };
  totalMentions: number;
  teaTalkCount: number;
  goodGuysCount: number;
  posts: CommunityMention[];
}

export interface ImageItem {
  id: string;
  filename: string;
  title: string;
  url: string;
  wins: number;
  losses: number;
  elo: number;
  isSample: boolean;
  createdAt: string;
}

export interface UserSummary {
  username: string;
  totalVotes: number;
}

export interface InitStackResponse {
  images: ImageItem[];
  totalImages: number;
  totalVotes: number;
  userVotes: number;
}

export interface VoteResponse {
  nextImage: ImageItem | null;
  winner: ImageItem;
  loser: ImageItem;
  totalVotes: number;
  userVotes: number;
  totalImages: number;
}

export interface DashboardResponse {
  selectedUser: string;
  users: UserSummary[];
  totalVotes: number;
  totalImages: number;
  images: ImageItem[];
}

export type ActiveView = 'arena' | 'dashboard';
export type SortOption = 'elo' | 'wins' | 'winRate' | 'newest';
export type FilterOption = 'all' | 'top' | 'unrated';
export type DashboardLayoutMode = 'grid' | 'table';

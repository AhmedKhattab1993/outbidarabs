import type { Platform } from "@/lib/platforms";

export type Listing = {
  id: string;
  url: string; // canonical identity key (platform-canonical URL, params stripped)
  platform: Platform;
  target_url?: string | null; // click-through href (params stripped, play-store id kept)
  image_url?: string | null; // fetched profile pic / app icon / og:image
  display_name: string;
  description: string | null;
  bid_amount: number;
  clicks: number;
  created_at: string;
  last_bid_at: string;
};

export type ActivityItem = {
  id: number;
  display_name: string;
  amount: number;
  rank: number;
  created_at: string;
  image_url?: string | null;
  target_url?: string | null;
};

export type TrendingItem = {
  id: string;
  display_name: string;
  url: string;
  clicks_per_hour: number;
};

export type SiteStats = {
  online: number;
  visitors: number;
  totalRevenue: number;
  listingCount: number;
  highestBid: number;
  highestBidder: string | null;
  highestBidUrl?: string | null; // canonical URL of the #1 card (boost deep-links)
  launchedAt: string; // ISO
  statsSource?: "datafast" | "internal"; // which analytics the numbers come from
};

export type LeaderboardPage = {
  listings: Listing[];
  ranks: number[]; // global rank of each listing (same order as listings)
  totalPages: number;
  total: number; // listings in the current platform filter
  totalAll: number; // listings on the whole board
  topBid: number; // global top bid (claim context)
};

export type ExistingListing = {
  url: string;
  display_name: string;
  bid_amount: number;
  platform: Platform;
} | null;

export type Listing = {
  id: string;
  url: string; // canonical identity key (protocol + host + path, params stripped)
  target_url?: string | null; // click-through href (params stripped, play-store id kept)
  image_url?: string | null; // og:image captured at submission
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
  launchedAt: string; // ISO
  statsSource?: "datafast" | "internal"; // which analytics the numbers come from
};

export type LeaderboardPage = {
  listings: Listing[];
  totalPages: number;
  total: number;
  topBid: number;
};

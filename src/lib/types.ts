export type Listing = {
  id: string;
  url: string;
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
};

export type LeaderboardPage = {
  listings: Listing[];
  totalPages: number;
  topBid: number;
};

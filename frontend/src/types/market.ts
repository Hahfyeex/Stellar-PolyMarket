export interface ResolutionSource {
  label: string;
  url: string;
}

export type ResolutionState = "closed" | "proposed" | "disputed" | "settled";

export interface MarketOddsEntry {
  index: number;
  odds: number;
}

export interface MarketAsset {
  code: string;
  issuer: string;
}

export interface Market {
  id: number;
  question: string;
  end_date: string;
  outcomes: string[];
  resolved: boolean;
  winning_outcome: number | null;
  total_pool: string;
  status?: string;
  proposed_outcome?: number | null;
  proposed_at?: string | null;
  challenge_window_ends_at?: string | null;
  council_vote_ends_at?: string | null;
  finalized_at?: string | null;
  resolution_state?: ResolutionState;
  resolution_notes?: string | null;
  resolution_sources?: ResolutionSource[];
  asset?: MarketAsset;
  outcome_pools?: Array<number | string>;
  odds_bps?: Array<number | string>;
  odds?: Array<number | MarketOddsEntry>;
}

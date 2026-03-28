export interface ResolutionSource {
  label: string;
  url: string;
}

export type ResolutionState = "closed" | "proposed" | "disputed" | "settled";

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
}
export interface ResolutionSource {
  label: string;
  url: string;
}

export type ResolutionState = "closed" | "proposed" | "disputed" | "settled";

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
  asset?: { code: string; issuer: string };
}

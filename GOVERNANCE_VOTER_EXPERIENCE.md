# Stellar Council — Voter Experience

## Access Control

The `/governance` route is restricted to verified Council Members. On load:

1. If no wallet is connected → "Connect Freighter Wallet" gate screen is shown.
2. Once connected, the wallet address is checked against `POST /api/governance/council/check`.
3. If the wallet is not on the council allowlist → "Access Denied" screen with no voting UI rendered.
4. Only verified members reach the Council Dashboard.

The backend enforces this independently: `POST /api/governance/disputes/:id/vote` returns `403` for any wallet not in the `COUNCIL_MEMBERS` environment variable (comma-separated Stellar addresses).

---

## Evidence Review Gate

**Vote buttons are disabled until at least one evidence link has been opened.**

Flow:
1. Each `VotingCard` renders the dispute summary and a list of evidence links (IPFS CIDs or external URLs).
2. Evidence links are tracked in local React state (`openedLinks: Set<number>`).
3. Clicking any evidence link opens it in a new tab and marks it as reviewed (visual checkmark + color change).
4. Only after `openedLinks.size > 0` do the "Vote Yes" / "Vote No" buttons become enabled.
5. A yellow hint message is shown while no evidence has been reviewed: _"Review evidence above to enable voting."_

This ensures no council member can cast a vote without at least acknowledging the evidence.

---

## Voting Flow

1. Member opens evidence link(s) → buttons unlock.
2. Member clicks "Vote Yes" or "Vote No".
3. An optimistic UI update immediately reflects the vote (quorum bar advances, buttons replaced with "You voted Yes/No").
4. `POST /api/governance/disputes/:id/vote` is called with `{ walletAddress, vote }`.
5. If the request fails, the optimistic update is reverted.
6. Once quorum is reached, the backend auto-sets `status = 'resolved'`.

---

## Timeframe

Each dispute has a 24-hour voting window (`expires_at = NOW() + INTERVAL '24 hours'`).  
The `VotingCard` displays a live countdown. Expired disputes show "Expired" and voting is disabled.

---

## Quorum Tracker

The `QuorumTracker` component shows:
- A progress bar (indigo → green when quorum is reached)
- Yes / No vote breakdown
- Total council members vs. votes cast

Quorum defaults to 5 of 9 council members (configurable per dispute in the DB).

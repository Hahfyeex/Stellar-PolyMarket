-- Migration 013: Add proposed_outcome column for high-value market two-factor confirmation
-- Markets above HIGH_VALUE_THRESHOLD enter PENDING_CONFIRMATION status
-- and store the oracle's proposed outcome until an admin confirms or rejects.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS proposed_outcome INT;

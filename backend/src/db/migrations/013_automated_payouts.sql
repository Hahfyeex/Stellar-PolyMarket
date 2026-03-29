-- Migration: Add payout_distributed column to markets table
ALTER TABLE markets ADD COLUMN payout_distributed BOOLEAN DEFAULT FALSE;

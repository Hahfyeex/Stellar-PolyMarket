-- Migration: Add contract_address to markets table
ALTER TABLE markets ADD COLUMN IF NOT EXISTS contract_address TEXT;

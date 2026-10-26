-- Run this SQL in your Supabase SQL Editor to add missing columns to daily_reports table
-- Navigate to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- Add the missing columns for inventory tracking
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS current_inventory NUMERIC;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS retail_purchased NUMERIC;
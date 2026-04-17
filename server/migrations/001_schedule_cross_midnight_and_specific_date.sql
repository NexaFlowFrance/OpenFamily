-- Migration: Support cross-midnight work hours, per-week schedule entries and location
-- Run this on existing OpenFamily databases to apply issue #40 / #43 fixes.

-- 1. Remove the constraint that prevents end_time < start_time (cross-midnight schedules)
ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_check;

-- 2. Add specific_date column for per-week (non-recurring) schedule entries
--    NULL = recurring every week, DATE value = only for that specific date
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS specific_date DATE;

-- 3. Add location column (used by the planning routes)
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS location TEXT;

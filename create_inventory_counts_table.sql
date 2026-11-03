-- Run this once in the Supabase SQL Editor before saving physical inventory counts.
-- The app stores one physical count per date, including the system estimate used
-- to calculate the over/short variance for that date.

CREATE TABLE IF NOT EXISTS public.inventory_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    count_date DATE NOT NULL UNIQUE,
    physical_inventory NUMERIC(12, 2) NOT NULL CHECK (physical_inventory >= 0),
    system_inventory NUMERIC(12, 2) NOT NULL,
    variance NUMERIC(12, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.inventory_counts DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inventory_counts_date ON public.inventory_counts(count_date);
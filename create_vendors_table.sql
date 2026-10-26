-- Run this SQL in your Supabase SQL Editor to create the vendors table
-- Navigate to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    representative TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable Row Level Security (RLS) since app handles its own auth via sessionStorage
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors(is_active);

-- Optional: Insert some sample vendors
INSERT INTO vendors (name, representative, phone) VALUES
    ('ABC Distributors', 'John Smith', '555-0101'),
    ('XYZ Wholesale', 'Jane Doe', '555-0102'),
    ('Fresh Foods Co', 'Bob Wilson', '555-0103')
ON CONFLICT (name) DO NOTHING;
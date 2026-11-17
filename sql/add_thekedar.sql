-- Jospo E41 - Thekedar (Assembly Contractor) Support Migration
-- Run this in Supabase SQL Editor to add native contractor_name column and index

ALTER TABLE public.production_entries 
ADD COLUMN IF NOT EXISTS contractor_name TEXT;

CREATE INDEX IF NOT EXISTS idx_production_entries_contractor 
ON public.production_entries(contractor_name);

COMMENT ON COLUMN public.production_entries.contractor_name IS 'Name of the Thekedar / Assembly Contractor who manufactured/assembled the coolers';

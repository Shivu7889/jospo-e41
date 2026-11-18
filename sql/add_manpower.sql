-- Jospo E41 - Manpower Support Migration
-- Run this in Supabase SQL Editor to add native manpower column to production_entries
ALTER TABLE public.production_entries 
ADD COLUMN IF NOT EXISTS manpower INTEGER;

COMMENT ON COLUMN public.production_entries.manpower IS 'Number of workers/laborers deployed by the Thekedar for assembling the coolers';

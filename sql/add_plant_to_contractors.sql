-- ============================================================================
-- Jospo Enterprise Multi-Plant System - Plant-Specific Contractors (Thekedars)
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

-- 1. Add plant column to contractors table
ALTER TABLE public.contractors 
  ADD COLUMN IF NOT EXISTS plant TEXT NOT NULL DEFAULT 'E41 G2';

-- 2. Update unique constraint so name is unique per plant (instead of globally)
ALTER TABLE public.contractors 
  DROP CONSTRAINT IF EXISTS contractors_name_key;

ALTER TABLE public.contractors 
  DROP CONSTRAINT IF EXISTS contractors_name_plant_key;

ALTER TABLE public.contractors 
  ADD CONSTRAINT contractors_name_plant_key UNIQUE (name, plant);

-- 3. Create index on plant for fast filtering
CREATE INDEX IF NOT EXISTS idx_contractors_plant ON public.contractors(plant, is_active);

-- 4. Ensure initial E41 contractors are tagged to 'E41 G2'
UPDATE public.contractors 
SET plant = 'E41 G2' 
WHERE plant IS NULL OR plant = '';

-- Seed standard E41 contractors if table was empty
INSERT INTO public.contractors (name, plant, is_active) VALUES
  ('Chotu', 'E41 G2', true),
  ('Ramesh Thekedar', 'E41 G2', true),
  ('Suresh Thekedar', 'E41 G2', true),
  ('Mukesh Thekedar', 'E41 G2', true),
  ('Kailash Assembly', 'E41 G2', true)
ON CONFLICT (name, plant) DO NOTHING;

-- 5. RLS Policies for Contractors
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

-- Drop all old policies to avoid stale constraints or missing role errors
DROP POLICY IF EXISTS "contractors_select_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_insert_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_update_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_delete_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_all_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_write_policy" ON public.contractors;

-- Read policy: all authenticated users can view active contractors
CREATE POLICY "contractors_select_policy" ON public.contractors
  FOR SELECT TO authenticated
  USING (true);

-- Write policy: allow authenticated operations (Next.js /api/contractors route strictly enforces owner/admin check)
CREATE POLICY "contractors_write_policy" ON public.contractors
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

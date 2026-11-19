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

DROP POLICY IF EXISTS "contractors_select_policy" ON public.contractors;
CREATE POLICY "contractors_select_policy" ON public.contractors
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "contractors_insert_policy" ON public.contractors;
CREATE POLICY "contractors_insert_policy" ON public.contractors
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid() AND employees.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "contractors_update_policy" ON public.contractors;
CREATE POLICY "contractors_update_policy" ON public.contractors
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid() AND employees.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "contractors_delete_policy" ON public.contractors;
CREATE POLICY "contractors_delete_policy" ON public.contractors
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid() AND employees.role IN ('owner', 'admin')
    )
  );

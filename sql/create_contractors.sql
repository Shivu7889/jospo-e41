-- =========================================================================
-- Table: public.contractors (Assembly Thekedars / Contractors)
-- Only Admins can INSERT or DELETE/UPDATE.
-- All authenticated employees can SELECT to assign during production.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for active contractors
CREATE INDEX IF NOT EXISTS idx_contractors_active ON public.contractors(is_active, name);

-- Enable Row Level Security (RLS)
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

-- 1. Everyone logged in can read the list of active contractors
DROP POLICY IF EXISTS "contractors_select_policy" ON public.contractors;
CREATE POLICY "contractors_select_policy" ON public.contractors
  FOR SELECT TO authenticated
  USING (true);

-- 2. Only Admins can insert new contractors
DROP POLICY IF EXISTS "contractors_insert_policy" ON public.contractors;
CREATE POLICY "contractors_insert_policy" ON public.contractors
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid() AND employees.role = 'admin'
    )
  );

-- 3. Only Admins can update or delete contractors
DROP POLICY IF EXISTS "contractors_update_policy" ON public.contractors;
CREATE POLICY "contractors_update_policy" ON public.contractors
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid() AND employees.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "contractors_delete_policy" ON public.contractors;
CREATE POLICY "contractors_delete_policy" ON public.contractors
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid() AND employees.role = 'admin'
    )
  );

-- Seed initial default thekedars
INSERT INTO public.contractors (name) VALUES
  ('Ramesh Thekedar'),
  ('Suresh Thekedar'),
  ('Mukesh Thekedar'),
  ('Kailash Assembly')
ON CONFLICT (name) DO NOTHING;

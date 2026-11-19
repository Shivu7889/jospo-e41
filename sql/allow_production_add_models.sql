-- ============================================================================
-- Jospo Enterprise Multi-Plant System
-- Allow Production Employees to Create & Manage Cooler Models
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

-- Ensure cooler_models has RLS enabled
ALTER TABLE public.cooler_models ENABLE ROW LEVEL SECURITY;

-- 1. Ensure authenticated users can read all cooler models
DROP POLICY IF EXISTS "auth_read_models" ON public.cooler_models;
CREATE POLICY "auth_read_models" ON public.cooler_models 
  FOR SELECT TO authenticated USING (true);

-- 2. Allow owner, admin, and production employees to insert new cooler models
DROP POLICY IF EXISTS "production_insert_models" ON public.cooler_models;
CREATE POLICY "production_insert_models" ON public.cooler_models
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid()
        AND employees.role IN ('owner', 'admin', 'production')
        AND employees.is_active = true
    )
  );

-- 3. Allow owner, admin, and production employees to update cooler models
DROP POLICY IF EXISTS "production_update_models" ON public.cooler_models;
CREATE POLICY "production_update_models" ON public.cooler_models
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid()
        AND employees.role IN ('owner', 'admin', 'production')
        AND employees.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid()
        AND employees.role IN ('owner', 'admin', 'production')
        AND employees.is_active = true
    )
  );

-- 4. Keep owner and admin unrestricted access
DROP POLICY IF EXISTS "owner_admin_all_models" ON public.cooler_models;
CREATE POLICY "owner_admin_all_models" ON public.cooler_models 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

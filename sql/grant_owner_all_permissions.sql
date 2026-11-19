-- ============================================================================
-- Jospo Enterprise Multi-Plant System - Grant Owner All Permissions
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- This script gives the Owner (admin@jospo.com and any user with role = 'owner')
-- 100% unrestricted access across all plants, tables, reports, and operations.
-- ============================================================================

-- 1. Ensure 'owner' is valid in employees role check constraint
ALTER TABLE public.employees 
  DROP CONSTRAINT IF EXISTS employees_role_check;

ALTER TABLE public.employees 
  ADD CONSTRAINT employees_role_check 
  CHECK (role IN ('owner', 'admin', 'production', 'dispatch'));

-- 2. Add is_owner flag to employees if not exists
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

-- 3. Upgrade owner accounts to role = 'owner', plant = 'ALL', is_owner = true
UPDATE public.employees 
SET 
  role = 'owner',
  plant = 'ALL',
  is_owner = true,
  is_active = true
WHERE email ILIKE 'admin@jospo.com'
   OR email ILIKE '%owner%'
   OR role = 'owner';

-- 4. Sync any newly registered auth users into public.employees with full owner permissions
INSERT INTO public.employees (id, name, email, role, plant, is_owner, is_active)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  email,
  'owner',
  'ALL',
  true,
  true
FROM auth.users
WHERE email ILIKE 'admin@jospo.com' OR email ILIKE '%owner%'
ON CONFLICT (id) DO UPDATE 
SET 
  role = 'owner',
  plant = 'ALL',
  is_owner = true,
  is_active = true;

-- ============================================================================
-- 5. UNRESTRICTED ROW LEVEL SECURITY (RLS) POLICIES FOR OWNER
-- ============================================================================

-- A. EMPLOYEES
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_employees" ON public.employees;
DROP POLICY IF EXISTS "auth_write_employees" ON public.employees;
DROP POLICY IF EXISTS "owner_all_employees" ON public.employees;

CREATE POLICY "auth_read_employees" ON public.employees 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_employees" ON public.employees 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- B. COOLER MODELS
ALTER TABLE public.cooler_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_models" ON public.cooler_models;
DROP POLICY IF EXISTS "admin_all_models" ON public.cooler_models;
DROP POLICY IF EXISTS "owner_admin_all_models" ON public.cooler_models;

CREATE POLICY "auth_read_models" ON public.cooler_models 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "owner_admin_all_models" ON public.cooler_models 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- C. STOCK TRANSACTIONS
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "admin_all_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "owner_admin_all_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "staff_insert_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "staff_update_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "staff_delete_stock" ON public.stock_transactions;

CREATE POLICY "auth_read_stock" ON public.stock_transactions 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_stock" ON public.stock_transactions 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- D. PRODUCTION ENTRIES
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_production" ON public.production_entries;
DROP POLICY IF EXISTS "admin_all_production" ON public.production_entries;
DROP POLICY IF EXISTS "owner_admin_all_production" ON public.production_entries;
DROP POLICY IF EXISTS "production_insert_entries" ON public.production_entries;
DROP POLICY IF EXISTS "production_update_entries" ON public.production_entries;
DROP POLICY IF EXISTS "production_delete_entries" ON public.production_entries;

CREATE POLICY "auth_read_production" ON public.production_entries 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_production" ON public.production_entries 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- E. DISPATCHES
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "admin_all_dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "owner_admin_all_dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "dispatch_staff_dispatches" ON public.dispatches;

CREATE POLICY "auth_read_dispatches" ON public.dispatches 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_dispatches" ON public.dispatches 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- F. DISPATCH ITEMS
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_dispatch_items" ON public.dispatch_items;
DROP POLICY IF EXISTS "admin_all_dispatch_items" ON public.dispatch_items;
DROP POLICY IF EXISTS "owner_admin_all_dispatch_items" ON public.dispatch_items;
DROP POLICY IF EXISTS "dispatch_staff_dispatch_items" ON public.dispatch_items;

CREATE POLICY "auth_read_dispatch_items" ON public.dispatch_items 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_dispatch_items" ON public.dispatch_items 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- G. CONTRACTORS (THEKEDARS)
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contractors_select_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_write_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_insert_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_update_policy" ON public.contractors;
DROP POLICY IF EXISTS "contractors_delete_policy" ON public.contractors;

CREATE POLICY "contractors_select_policy" ON public.contractors 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "contractors_write_policy" ON public.contractors 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- VERIFY OWNER STATUS
-- ============================================================================
SELECT id, name, email, role, plant, is_owner, is_active 
FROM public.employees 
WHERE role = 'owner' OR is_owner = true;

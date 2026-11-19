-- ============================================================================
-- Jospo Enterprise Multi-Plant System - Complete RLS & Profile Fix
-- Paste this into your Supabase Dashboard -> SQL Editor and click RUN
-- ============================================================================

-- 1. Ensure 'owner' is permitted in employees role check constraint
ALTER TABLE public.employees 
  DROP CONSTRAINT IF EXISTS employees_role_check;

ALTER TABLE public.employees 
  ADD CONSTRAINT employees_role_check 
  CHECK (role IN ('owner', 'admin', 'production', 'dispatch'));

-- 2. Ensure stock_transactions has all required columns and constraints
ALTER TABLE public.stock_transactions 
  ADD COLUMN IF NOT EXISTS plant TEXT NOT NULL DEFAULT 'E41 G2';

ALTER TABLE public.stock_transactions 
  DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;

ALTER TABLE public.stock_transactions 
  ADD CONSTRAINT stock_transactions_transaction_type_check 
  CHECK (transaction_type IN ('production', 'dispatch', 'dispatch_reversal', 'adjustment', 'transfer_in', 'transfer_out'));

-- ============================================================================
-- 3. EMPLOYEES TABLE: Remove Recursion & Allow Profile Reads
-- ============================================================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_employees" ON public.employees;
DROP POLICY IF EXISTS "admin_all_employees" ON public.employees;
DROP POLICY IF EXISTS "owner_admin_all_employees" ON public.employees;
DROP POLICY IF EXISTS "auth_write_employees" ON public.employees;

-- Direct non-recursive read policy: every authenticated user can read profiles
CREATE POLICY "auth_read_employees" ON public.employees 
  FOR SELECT TO authenticated 
  USING (true);

-- Allow authenticated operations (API routes enforce role authorization)
CREATE POLICY "auth_write_employees" ON public.employees 
  FOR ALL TO authenticated 
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. LINK & ENSURE ADMIN PROFILE EXISTS IN public.employees
-- ============================================================================
-- Sync all auth.users into public.employees so no user gets "No Employee Profile Found"
INSERT INTO public.employees (id, name, email, role, plant, is_active)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  email,
  COALESCE(raw_user_meta_data->>'role', 'owner'),
  COALESCE(raw_user_meta_data->>'plant', 'ALL'),
  true
FROM auth.users
ON CONFLICT (id) DO UPDATE 
SET 
  email = EXCLUDED.email,
  is_active = true,
  updated_at = NOW();

-- Explicitly ensure admin@jospo.com is set to owner role and ALL plant access
UPDATE public.employees
SET role = 'owner', plant = 'ALL', is_active = true
WHERE email = 'admin@jospo.com';

-- Auto-create profile trigger for any future auth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.employees (id, name, email, role, plant, is_active)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'production'),
    COALESCE(new.raw_user_meta_data->>'plant', 'E41 G2'),
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    is_active = true,
    updated_at = NOW();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 5. STOCK TRANSACTIONS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "auth_read_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "admin_all_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "owner_admin_all_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "production_insert_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "dispatch_insert_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "staff_insert_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "production_update_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "production_delete_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "staff_update_stock" ON public.stock_transactions;
DROP POLICY IF EXISTS "staff_delete_stock" ON public.stock_transactions;

CREATE POLICY "auth_read_stock" ON public.stock_transactions 
  FOR SELECT TO authenticated 
  USING (true);

CREATE POLICY "owner_admin_all_stock" ON public.stock_transactions 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "staff_insert_stock" ON public.stock_transactions 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin', 'production', 'dispatch'))
  );

CREATE POLICY "staff_update_stock" ON public.stock_transactions 
  FOR UPDATE TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid() 
        AND (
          role IN ('owner', 'admin') 
          OR (role = 'production' AND employee_id = auth.uid() AND transaction_type = 'production' AND (stock_transactions.created_at::date = CURRENT_DATE))
        )
    )
  );

CREATE POLICY "staff_delete_stock" ON public.stock_transactions 
  FOR DELETE TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid() 
        AND (
          role IN ('owner', 'admin') 
          OR (role = 'production' AND employee_id = auth.uid() AND transaction_type = 'production' AND (stock_transactions.created_at::date = CURRENT_DATE))
        )
    )
  );

-- ============================================================================
-- 6. PRODUCTION ENTRIES POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "admin_all_production" ON public.production_entries;
DROP POLICY IF EXISTS "owner_admin_all_production" ON public.production_entries;
DROP POLICY IF EXISTS "production_insert_entries" ON public.production_entries;
DROP POLICY IF EXISTS "production_update_entries" ON public.production_entries;
DROP POLICY IF EXISTS "production_delete_entries" ON public.production_entries;

CREATE POLICY "owner_admin_all_production" ON public.production_entries 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "production_insert_entries" ON public.production_entries 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin', 'production'))
  );

CREATE POLICY "production_update_entries" ON public.production_entries 
  FOR UPDATE TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid() 
        AND (
          role IN ('owner', 'admin') 
          OR (role = 'production' AND employee_id = auth.uid() AND production_date = CURRENT_DATE)
        )
    )
  );

CREATE POLICY "production_delete_entries" ON public.production_entries 
  FOR DELETE TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid() 
        AND (
          role IN ('owner', 'admin') 
          OR (role = 'production' AND employee_id = auth.uid() AND production_date = CURRENT_DATE)
        )
    )
  );

-- ============================================================================
-- 7. DISPATCHES & DISPATCH ITEMS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "admin_all_dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "owner_admin_all_dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "dispatch_insert_dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "dispatch_update_dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "dispatch_staff_dispatches" ON public.dispatches;

DROP POLICY IF EXISTS "admin_all_dispatch_items" ON public.dispatch_items;
DROP POLICY IF EXISTS "owner_admin_all_dispatch_items" ON public.dispatch_items;
DROP POLICY IF EXISTS "dispatch_insert_items" ON public.dispatch_items;
DROP POLICY IF EXISTS "dispatch_update_items" ON public.dispatch_items;
DROP POLICY IF EXISTS "dispatch_delete_items" ON public.dispatch_items;
DROP POLICY IF EXISTS "dispatch_staff_dispatch_items" ON public.dispatch_items;

CREATE POLICY "owner_admin_all_dispatches" ON public.dispatches 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "dispatch_staff_dispatches" ON public.dispatches 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin', 'dispatch', 'production'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin', 'dispatch', 'production'))
  );

CREATE POLICY "owner_admin_all_dispatch_items" ON public.dispatch_items 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "dispatch_staff_dispatch_items" ON public.dispatch_items 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin', 'dispatch', 'production'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin', 'dispatch', 'production'))
  );

-- ============================================================================
-- 8. COOLER MODELS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "admin_all_models" ON public.cooler_models;
DROP POLICY IF EXISTS "owner_admin_all_models" ON public.cooler_models;

CREATE POLICY "owner_admin_all_models" ON public.cooler_models 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

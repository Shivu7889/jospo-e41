-- ============================================================================
-- Jospo Enterprise Multi-Plant System - Fix Row Level Security (RLS)
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
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

-- 3. STOCK TRANSACTIONS POLICIES
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

-- Allow all authenticated users to read stock transactions
CREATE POLICY "auth_read_stock" ON public.stock_transactions 
  FOR SELECT TO authenticated 
  USING (true);

-- Allow owner and admin full control over stock transactions
CREATE POLICY "owner_admin_all_stock" ON public.stock_transactions 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Allow all authorized roles (owner, admin, production, dispatch) to insert stock ledger rows
CREATE POLICY "staff_insert_stock" ON public.stock_transactions 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin', 'production', 'dispatch'))
  );

-- Allow staff / admin / owner to update/delete stock transactions for corrections
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

-- 4. PRODUCTION ENTRIES POLICIES
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

-- 5. DISPATCHES & DISPATCH ITEMS POLICIES
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

-- 6. COOLER MODELS & EMPLOYEES & CONTRACTORS
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

DROP POLICY IF EXISTS "admin_all_employees" ON public.employees;
DROP POLICY IF EXISTS "owner_admin_all_employees" ON public.employees;
CREATE POLICY "owner_admin_all_employees" ON public.employees 
  FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

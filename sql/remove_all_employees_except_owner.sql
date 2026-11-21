-- ============================================================================
-- Jospo Enterprise - Purge All Employees Except Owner & Lock Management
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================
-- Purpose:
-- 1. Identifies the primary Enterprise Owner account (admin@jospo.com or role = 'owner')
-- 2. Safely reassigns all historical production entries, dispatches, and stock
--    transactions to the Owner so NO DATA is lost and NO foreign key errors occur
-- 3. Deletes all non-owner employees from public.employees
-- 4. Deletes all non-owner login users from auth.users (terminates their access)
-- 5. Hardens RLS policies so ONLY the Enterprise Owner can insert, update, or delete employees
-- ============================================================================

DO $$
DECLARE
  v_owner_id UUID;
  v_owner_email TEXT;
  v_reassigned_production INT := 0;
  v_reassigned_dispatches INT := 0;
  v_reassigned_stock INT := 0;
  v_deleted_employees INT := 0;
  v_deleted_auth_users INT := 0;
BEGIN
  -- 1. Identify Owner from public.employees or auth.users
  SELECT id, email INTO v_owner_id, v_owner_email
  FROM public.employees
  WHERE role = 'owner' OR is_owner = true OR email ILIKE 'admin@jospo.com'
  ORDER BY (role = 'owner') DESC, (is_owner = true) DESC, created_at ASC
  LIMIT 1;

  -- Fallback: check auth.users if not found in public.employees
  IF v_owner_id IS NULL THEN
    SELECT id, email INTO v_owner_id, v_owner_email
    FROM auth.users
    WHERE email ILIKE 'admin@jospo.com' OR email ILIKE '%owner%'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_owner_id IS NOT NULL THEN
      INSERT INTO public.employees (id, name, email, role, plant, is_owner, is_active)
      VALUES (v_owner_id, 'Enterprise Owner', v_owner_email, 'owner', 'ALL', true, true)
      ON CONFLICT (id) DO UPDATE
      SET role = 'owner', plant = 'ALL', is_owner = true, is_active = true;
    END IF;
  END IF;

  -- Safety assertion: Owner must exist
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'No owner account found. Please ensure an owner user (e.g. admin@jospo.com) exists before running this purge.';
  END IF;

  -- Ensure owner account has complete super-admin attributes
  UPDATE public.employees
  SET 
    role = 'owner',
    plant = 'ALL',
    is_owner = true,
    is_active = true
  WHERE id = v_owner_id;

  RAISE NOTICE 'Enterprise Owner identified: % (%)', v_owner_email, v_owner_id;

  -- 2. Safely reassign foreign keys from non-owner accounts to the Owner
  -- A. Production entries
  WITH upd_pe AS (
    UPDATE public.production_entries
    SET employee_id = v_owner_id
    WHERE employee_id IS NOT NULL AND employee_id != v_owner_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_reassigned_production FROM upd_pe;

  -- B. Dispatches (employee_id, cancelled_by, received_by)
  WITH upd_disp AS (
    UPDATE public.dispatches
    SET employee_id = v_owner_id
    WHERE employee_id IS NOT NULL AND employee_id != v_owner_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_reassigned_dispatches FROM upd_disp;

  UPDATE public.dispatches
  SET cancelled_by = v_owner_id
  WHERE cancelled_by IS NOT NULL AND cancelled_by != v_owner_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'dispatches' AND column_name = 'received_by'
  ) THEN
    EXECUTE format('UPDATE public.dispatches SET received_by = %L WHERE received_by IS NOT NULL AND received_by != %L', v_owner_id, v_owner_id);
  END IF;

  -- C. Stock transactions ledger
  WITH upd_st AS (
    UPDATE public.stock_transactions
    SET employee_id = v_owner_id
    WHERE employee_id IS NOT NULL AND employee_id != v_owner_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_reassigned_stock FROM upd_st;

  RAISE NOTICE 'Reassigned to Owner: % production entries, % dispatches, % stock transactions',
    v_reassigned_production, v_reassigned_dispatches, v_reassigned_stock;

  -- 3. Delete non-owner employee profiles from public.employees
  WITH del_emp AS (
    DELETE FROM public.employees
    WHERE id != v_owner_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted_employees FROM del_emp;

  RAISE NOTICE 'Deleted % non-owner employee profile(s) from public.employees', v_deleted_employees;

  -- 4. Delete non-owner users from auth.users (immediately revokes logins)
  WITH del_auth AS (
    DELETE FROM auth.users
    WHERE id != v_owner_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted_auth_users FROM del_auth;

  RAISE NOTICE 'Deleted % non-owner user login(s) from auth.users', v_deleted_auth_users;

  RAISE NOTICE 'SUCCESS: Only Enterprise Owner % (%) exists in the system.', v_owner_email, v_owner_id;
END $$;

-- ============================================================================
-- 5. Harden RLS Policies on employees: Only Owner can create, edit, or delete
-- ============================================================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_employees" ON public.employees;
DROP POLICY IF EXISTS "auth_write_employees" ON public.employees;
DROP POLICY IF EXISTS "owner_all_employees" ON public.employees;
DROP POLICY IF EXISTS "owner_manage_employees" ON public.employees;
DROP POLICY IF EXISTS "everyone_read_employees" ON public.employees;

-- All authenticated users can view staff names (needed for dispatches & ledger)
CREATE POLICY "everyone_read_employees" ON public.employees
  FOR SELECT TO authenticated
  USING (true);

-- ONLY the Enterprise Owner can insert, update, or delete employee records
CREATE POLICY "owner_manage_employees" ON public.employees
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid() AND (role = 'owner' OR is_owner = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid() AND (role = 'owner' OR is_owner = true)
    )
  );

-- Show surviving owner profile
SELECT 
  id,
  name,
  email,
  role,
  plant,
  is_owner,
  is_active,
  created_at
FROM public.employees;

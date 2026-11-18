-- =========================================================================
-- Jospo E41 - Allow Production Employees to Edit & Delete Today's Entries
-- Run this in your Supabase Dashboard -> SQL Editor
-- =========================================================================

-- 1. Enable UPDATE on production_entries for the employee who created it on the current date (or admins anytime)
DROP POLICY IF EXISTS "production_update_entries" ON public.production_entries;
CREATE POLICY "production_update_entries" ON public.production_entries
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.employees 
    WHERE id = auth.uid() 
      AND (
        role = 'admin' 
        OR (role = 'production' AND employee_id = auth.uid() AND production_date = CURRENT_DATE)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees 
    WHERE id = auth.uid() 
      AND (
        role = 'admin' 
        OR (role = 'production' AND employee_id = auth.uid() AND production_date = CURRENT_DATE)
      )
  )
);

-- 2. Enable DELETE on production_entries for the employee who created it on the current date (or admins anytime)
DROP POLICY IF EXISTS "production_delete_entries" ON public.production_entries;
CREATE POLICY "production_delete_entries" ON public.production_entries
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.employees 
    WHERE id = auth.uid() 
      AND (
        role = 'admin' 
        OR (role = 'production' AND employee_id = auth.uid() AND production_date = CURRENT_DATE)
      )
  )
);

-- 3. Enable UPDATE on stock_transactions for production entries on the current date
DROP POLICY IF EXISTS "production_update_stock" ON public.stock_transactions;
CREATE POLICY "production_update_stock" ON public.stock_transactions
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.employees 
    WHERE id = auth.uid() 
      AND (
        role = 'admin' 
        OR (role = 'production' AND employee_id = auth.uid() AND transaction_type = 'production' AND (created_at::date = CURRENT_DATE))
      )
  )
);

-- 4. Enable DELETE on stock_transactions for production entries on the current date
DROP POLICY IF EXISTS "production_delete_stock" ON public.stock_transactions;
CREATE POLICY "production_delete_stock" ON public.stock_transactions
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.employees 
    WHERE id = auth.uid() 
      AND (
        role = 'admin' 
        OR (role = 'production' AND employee_id = auth.uid() AND transaction_type = 'production' AND (created_at::date = CURRENT_DATE))
      )
  )
);

-- Jospo E41 Manufacturing & Stock Management System
-- Database Schema for Supabase PostgreSQL
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. TABLES
-- ============================================

-- Employee profiles (linked to Supabase auth.users)
CREATE TABLE public.employees (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'production', 'dispatch')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cooler models master
CREATE TABLE public.cooler_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  qr_data TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Production entries
CREATE TABLE public.production_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES public.cooler_models(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  remarks TEXT,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dispatch header
CREATE TABLE public.dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_number TEXT NOT NULL,
  from_location TEXT NOT NULL DEFAULT 'Jospo E41',
  destination TEXT NOT NULL,
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  remarks TEXT,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.employees(id),
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dispatch line items
CREATE TABLE public.dispatch_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.cooler_models(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(dispatch_id, model_id)
);

-- Stock transaction ledger (immutable audit trail)
CREATE TABLE public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES public.cooler_models(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('production', 'dispatch', 'dispatch_reversal', 'adjustment')),
  quantity INTEGER NOT NULL,
  reference_id UUID,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. VIEWS
-- ============================================

-- Current stock per model
CREATE OR REPLACE VIEW public.current_stock AS
SELECT
  m.id AS model_id,
  m.name AS model_name,
  m.code AS model_code,
  COALESCE(SUM(st.quantity), 0)::INTEGER AS current_stock
FROM public.cooler_models m
LEFT JOIN public.stock_transactions st ON m.id = st.model_id
WHERE m.is_active = true
GROUP BY m.id, m.name, m.code
ORDER BY m.code;

-- Daily production summary
CREATE OR REPLACE VIEW public.daily_production_summary AS
SELECT
  pe.production_date,
  m.id AS model_id,
  m.name AS model_name,
  m.code AS model_code,
  SUM(pe.quantity)::INTEGER AS total_quantity,
  COUNT(pe.id)::INTEGER AS entry_count
FROM public.production_entries pe
JOIN public.cooler_models m ON pe.model_id = m.id
GROUP BY pe.production_date, m.id, m.name, m.code
ORDER BY pe.production_date DESC, m.code;

-- Daily dispatch summary
CREATE OR REPLACE VIEW public.daily_dispatch_summary AS
SELECT
  d.dispatch_date,
  m.id AS model_id,
  m.name AS model_name,
  m.code AS model_code,
  SUM(di.quantity)::INTEGER AS total_quantity
FROM public.dispatches d
JOIN public.dispatch_items di ON d.id = di.dispatch_id
JOIN public.cooler_models m ON di.model_id = m.id
WHERE d.status = 'confirmed'
GROUP BY d.dispatch_date, m.id, m.name, m.code
ORDER BY d.dispatch_date DESC, m.code;

-- Stock ledger with model details
CREATE OR REPLACE VIEW public.stock_ledger AS
SELECT
  st.id,
  st.created_at,
  m.name AS model_name,
  m.code AS model_code,
  st.transaction_type,
  st.quantity,
  st.notes,
  e.name AS employee_name,
  st.reference_id
FROM public.stock_transactions st
JOIN public.cooler_models m ON st.model_id = m.id
JOIN public.employees e ON st.employee_id = e.id
ORDER BY st.created_at DESC;

-- ============================================
-- 4. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooler_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all tables
CREATE POLICY "auth_read_employees" ON public.employees FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_models" ON public.cooler_models FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_production" ON public.production_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_dispatches" ON public.dispatches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_dispatch_items" ON public.dispatch_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_stock" ON public.stock_transactions FOR SELECT USING (auth.role() = 'authenticated');

-- Admin can do everything
CREATE POLICY "admin_all_employees" ON public.employees FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_models" ON public.cooler_models FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_production" ON public.production_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_dispatches" ON public.dispatches FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_dispatch_items" ON public.dispatch_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_stock" ON public.stock_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);

-- Production role can insert production entries and stock transactions
CREATE POLICY "production_insert_entries" ON public.production_entries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'production'))
);
CREATE POLICY "production_insert_stock" ON public.stock_transactions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'production'))
);

-- Dispatch role can insert/update dispatches and dispatch items
CREATE POLICY "dispatch_insert_dispatches" ON public.dispatches FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_update_dispatches" ON public.dispatches FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_insert_items" ON public.dispatch_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_update_items" ON public.dispatch_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_delete_items" ON public.dispatch_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_insert_stock" ON public.stock_transactions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);

-- ============================================
-- 5. FUNCTIONS
-- ============================================

-- Function to get dashboard stats
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_production_today', (
      SELECT COALESCE(SUM(quantity), 0)
      FROM public.production_entries
      WHERE production_date = CURRENT_DATE
    ),
    'total_dispatch_today', (
      SELECT COALESCE(SUM(di.quantity), 0)
      FROM public.dispatches d
      JOIN public.dispatch_items di ON d.id = di.dispatch_id
      WHERE d.dispatch_date = CURRENT_DATE AND d.status = 'confirmed'
    ),
    'total_stock', (
      SELECT COALESCE(SUM(quantity), 0)
      FROM public.stock_transactions
    ),
    'pending_dispatches', (
      SELECT COUNT(*)
      FROM public.dispatches
      WHERE status = 'draft'
    ),
    'total_models', (
      SELECT COUNT(*)
      FROM public.cooler_models
      WHERE is_active = true
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to confirm a dispatch (atomic operation)
CREATE OR REPLACE FUNCTION public.confirm_dispatch(p_dispatch_id UUID, p_employee_id UUID)
RETURNS JSON AS $$
DECLARE
  v_dispatch RECORD;
  v_item RECORD;
  v_current_stock INTEGER;
BEGIN
  -- Get the dispatch
  SELECT * INTO v_dispatch FROM public.dispatches WHERE id = p_dispatch_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch not found');
  END IF;
  
  IF v_dispatch.status != 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch is not in draft status');
  END IF;
  
  -- Check stock availability for each item
  FOR v_item IN SELECT di.*, m.name AS model_name FROM public.dispatch_items di JOIN public.cooler_models m ON di.model_id = m.id WHERE di.dispatch_id = p_dispatch_id
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock
    FROM public.stock_transactions
    WHERE model_id = v_item.model_id;
    
    IF v_current_stock < v_item.quantity THEN
      RETURN json_build_object('success', false, 'error', 
        format('Insufficient stock for %s. Available: %s, Required: %s', v_item.model_name, v_current_stock, v_item.quantity)
      );
    END IF;
  END LOOP;
  
  -- Deduct stock for each item
  FOR v_item IN SELECT * FROM public.dispatch_items WHERE dispatch_id = p_dispatch_id
  LOOP
    INSERT INTO public.stock_transactions (model_id, transaction_type, quantity, reference_id, employee_id, notes)
    VALUES (v_item.model_id, 'dispatch', -v_item.quantity, p_dispatch_id, p_employee_id, 'Dispatch confirmed');
  END LOOP;
  
  -- Update dispatch status
  UPDATE public.dispatches
  SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
  WHERE id = p_dispatch_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel a dispatch (reversal)
CREATE OR REPLACE FUNCTION public.cancel_dispatch(p_dispatch_id UUID, p_employee_id UUID, p_reason TEXT)
RETURNS JSON AS $$
DECLARE
  v_dispatch RECORD;
  v_item RECORD;
BEGIN
  SELECT * INTO v_dispatch FROM public.dispatches WHERE id = p_dispatch_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch not found');
  END IF;
  
  IF v_dispatch.status != 'confirmed' THEN
    RETURN json_build_object('success', false, 'error', 'Only confirmed dispatches can be cancelled');
  END IF;
  
  -- Reverse stock for each item
  FOR v_item IN SELECT * FROM public.dispatch_items WHERE dispatch_id = p_dispatch_id
  LOOP
    INSERT INTO public.stock_transactions (model_id, transaction_type, quantity, reference_id, employee_id, notes)
    VALUES (v_item.model_id, 'dispatch_reversal', v_item.quantity, p_dispatch_id, p_employee_id, 
      format('Dispatch cancelled: %s', COALESCE(p_reason, 'No reason provided')));
  END LOOP;
  
  -- Update dispatch status
  UPDATE public.dispatches
  SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_employee_id, 
      cancellation_reason = p_reason, updated_at = NOW()
  WHERE id = p_dispatch_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. INDEXES
-- ============================================
CREATE INDEX idx_production_date ON public.production_entries(production_date);
CREATE INDEX idx_production_model ON public.production_entries(model_id);
CREATE INDEX idx_production_employee ON public.production_entries(employee_id);
CREATE INDEX idx_dispatch_date ON public.dispatches(dispatch_date);
CREATE INDEX idx_dispatch_status ON public.dispatches(status);
CREATE INDEX idx_dispatch_employee ON public.dispatches(employee_id);
CREATE INDEX idx_dispatch_items_dispatch ON public.dispatch_items(dispatch_id);
CREATE INDEX idx_dispatch_items_model ON public.dispatch_items(model_id);
CREATE INDEX idx_stock_model ON public.stock_transactions(model_id);
CREATE INDEX idx_stock_type ON public.stock_transactions(transaction_type);
CREATE INDEX idx_stock_created ON public.stock_transactions(created_at);

-- ============================================
-- 7. TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER tr_models_updated_at BEFORE UPDATE ON public.cooler_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER tr_dispatches_updated_at BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

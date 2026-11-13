-- Jospo E41 - PART 3: Functions, Indexes, and Triggers
-- Paste this in Supabase SQL Editor and click Run

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
CREATE INDEX IF NOT EXISTS idx_production_date ON public.production_entries(production_date);
CREATE INDEX IF NOT EXISTS idx_production_model ON public.production_entries(model_id);
CREATE INDEX IF NOT EXISTS idx_production_employee ON public.production_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_date ON public.dispatches(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_status ON public.dispatches(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_employee ON public.dispatches(employee_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_dispatch ON public.dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_model ON public.dispatch_items(model_id);
CREATE INDEX IF NOT EXISTS idx_stock_model ON public.stock_transactions(model_id);
CREATE INDEX IF NOT EXISTS idx_stock_type ON public.stock_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_stock_created ON public.stock_transactions(created_at);

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

DROP TRIGGER IF EXISTS tr_employees_updated_at ON public.employees;
CREATE TRIGGER tr_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS tr_models_updated_at ON public.cooler_models;
CREATE TRIGGER tr_models_updated_at BEFORE UPDATE ON public.cooler_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS tr_dispatches_updated_at ON public.dispatches;
CREATE TRIGGER tr_dispatches_updated_at BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

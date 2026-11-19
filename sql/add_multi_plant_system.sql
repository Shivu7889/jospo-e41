-- ====================================================================
-- Jospo Enterprise Multi-Plant System Migration
-- Plants: E41 G2 (Main), D4 (Unit 2), C116 (Unit 3)
-- ====================================================================

-- 1. EMPLOYEES: Add plant column and support 'owner' role
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS plant TEXT NOT NULL DEFAULT 'E41 G2';

-- Update check constraints on employees
ALTER TABLE public.employees 
  DROP CONSTRAINT IF EXISTS employees_role_check;

ALTER TABLE public.employees 
  ADD CONSTRAINT employees_role_check 
  CHECK (role IN ('owner', 'admin', 'production', 'dispatch'));

-- 2. PRODUCTION ENTRIES: Add plant column
ALTER TABLE public.production_entries 
  ADD COLUMN IF NOT EXISTS plant TEXT NOT NULL DEFAULT 'E41 G2';

CREATE INDEX IF NOT EXISTS idx_production_plant 
  ON public.production_entries(plant, production_date);

-- 3. DISPATCHES: Add multi-plant transfer columns
ALTER TABLE public.dispatches 
  ADD COLUMN IF NOT EXISTS destination_plant TEXT,
  ADD COLUMN IF NOT EXISTS transfer_status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS receipt_notes TEXT;

-- For any existing local dispatches, ensure default transfer_status
UPDATE public.dispatches 
SET transfer_status = 'completed' 
WHERE transfer_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_dispatches_from_plant 
  ON public.dispatches(from_location);

CREATE INDEX IF NOT EXISTS idx_dispatches_dest_plant 
  ON public.dispatches(destination_plant, transfer_status);

-- 4. STOCK TRANSACTIONS: Add plant column & transfer transaction types
ALTER TABLE public.stock_transactions 
  ADD COLUMN IF NOT EXISTS plant TEXT NOT NULL DEFAULT 'E41 G2';

-- Update transaction_type check constraint
ALTER TABLE public.stock_transactions 
  DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;

ALTER TABLE public.stock_transactions 
  ADD CONSTRAINT stock_transactions_transaction_type_check 
  CHECK (transaction_type IN ('production', 'dispatch', 'dispatch_reversal', 'adjustment', 'transfer_in', 'transfer_out'));

CREATE INDEX IF NOT EXISTS idx_stock_transactions_plant 
  ON public.stock_transactions(plant, model_id);

-- 5. MULTI-PLANT STOCK VIEW
CREATE OR REPLACE VIEW public.plant_stock_summary AS
SELECT
  COALESCE(st.plant, 'E41 G2') AS plant,
  m.id AS model_id,
  m.name AS model_name,
  m.code AS model_code,
  COALESCE(SUM(st.quantity), 0)::INTEGER AS current_stock
FROM public.cooler_models m
LEFT JOIN public.stock_transactions st ON m.id = st.model_id
WHERE m.is_active = true
GROUP BY COALESCE(st.plant, 'E41 G2'), m.id, m.name, m.code;

-- 6. GRANT PERMISSIONS
GRANT ALL ON public.plant_stock_summary TO authenticated;
GRANT ALL ON public.plant_stock_summary TO service_role;

-- 7. UPDATE CONFIRM_DISPATCH AND CANCEL_DISPATCH TO SUPPORT MULTI-PLANT
CREATE OR REPLACE FUNCTION public.confirm_dispatch(p_dispatch_id UUID, p_employee_id UUID)
RETURNS JSON AS $$
DECLARE
  v_dispatch RECORD;
  v_item RECORD;
  v_current_stock INTEGER;
  v_plant TEXT;
BEGIN
  -- Get the dispatch
  SELECT * INTO v_dispatch FROM public.dispatches WHERE id = p_dispatch_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch not found');
  END IF;
  
  IF v_dispatch.status != 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch is not in draft status');
  END IF;

  -- Determine origin plant
  v_plant := COALESCE(v_dispatch.from_location, 'E41 G2');
  IF v_plant ILIKE '%D4%' THEN
    v_plant := 'D4';
  ELSIF v_plant ILIKE '%C116%' OR v_plant ILIKE '%C-116%' THEN
    v_plant := 'C116';
  ELSE
    v_plant := 'E41 G2';
  END IF;
  
  -- Check stock availability for each item at this plant
  FOR v_item IN 
    SELECT di.*, m.name AS model_name 
    FROM public.dispatch_items di 
    JOIN public.cooler_models m ON di.model_id = m.id 
    WHERE di.dispatch_id = p_dispatch_id
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock
    FROM public.stock_transactions
    WHERE model_id = v_item.model_id 
      AND (plant = v_plant OR (plant IS NULL AND v_plant = 'E41 G2'));
    
    IF v_current_stock < v_item.quantity THEN
      RETURN json_build_object('success', false, 'error', 
        format('Insufficient stock at plant %s for %s. Available: %s, Required: %s', v_plant, v_item.model_name, v_current_stock, v_item.quantity)
      );
    END IF;
  END LOOP;
  
  -- Deduct stock for each item from this plant
  FOR v_item IN SELECT * FROM public.dispatch_items WHERE dispatch_id = p_dispatch_id
  LOOP
    INSERT INTO public.stock_transactions (model_id, transaction_type, quantity, reference_id, employee_id, plant, notes)
    VALUES (v_item.model_id, 'dispatch', -v_item.quantity, p_dispatch_id, p_employee_id, v_plant, format('Dispatch confirmed from plant %s', v_plant));
  END LOOP;
  
  -- Update dispatch status and ensure transfer_status is in_transit if local
  UPDATE public.dispatches
  SET 
    status = 'confirmed', 
    confirmed_at = NOW(), 
    updated_at = NOW(),
    transfer_status = CASE 
      WHEN destination_plant IS NOT NULL OR dispatch_type = 'local' THEN 'in_transit'
      ELSE COALESCE(transfer_status, 'completed')
    END
  WHERE id = p_dispatch_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.cancel_dispatch(p_dispatch_id UUID, p_employee_id UUID, p_reason TEXT)
RETURNS JSON AS $$
DECLARE
  v_dispatch RECORD;
  v_item RECORD;
  v_plant TEXT;
BEGIN
  SELECT * INTO v_dispatch FROM public.dispatches WHERE id = p_dispatch_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch not found');
  END IF;
  
  IF v_dispatch.status != 'confirmed' THEN
    RETURN json_build_object('success', false, 'error', 'Only confirmed dispatches can be cancelled');
  END IF;

  v_plant := COALESCE(v_dispatch.from_location, 'E41 G2');
  IF v_plant ILIKE '%D4%' THEN
    v_plant := 'D4';
  ELSIF v_plant ILIKE '%C116%' OR v_plant ILIKE '%C-116%' THEN
    v_plant := 'C116';
  ELSE
    v_plant := 'E41 G2';
  END IF;
  
  -- Reverse stock for each item back to origin plant
  FOR v_item IN SELECT * FROM public.dispatch_items WHERE dispatch_id = p_dispatch_id
  LOOP
    INSERT INTO public.stock_transactions (model_id, transaction_type, quantity, reference_id, employee_id, plant, notes)
    VALUES (v_item.model_id, 'dispatch_reversal', v_item.quantity, p_dispatch_id, p_employee_id, v_plant,
      format('Dispatch cancelled: %s (Plant %s)', COALESCE(p_reason, 'No reason provided'), v_plant));
  END LOOP;
  
  -- Update dispatch status
  UPDATE public.dispatches
  SET status = 'cancelled', cancellation_reason = p_reason, cancelled_by = p_employee_id, updated_at = NOW()
  WHERE id = p_dispatch_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

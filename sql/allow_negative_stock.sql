-- ==============================================================================
-- ALLOW NEGATIVE STOCK IN CONFIRM_DISPATCH (OVERDRAFT / ADVANCE DISPATCH)
-- ==============================================================================
-- This migration updates public.confirm_dispatch to allow stock to go into
-- negative balance. This enables dispatching coolers produced during the day
-- before daily production is logged by thekedars in the evening.
-- When thekedar production is entered in the evening, stock balances out automatically.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.confirm_dispatch(p_dispatch_id UUID, p_employee_id UUID)
RETURNS JSON AS $$
DECLARE
  v_dispatch RECORD;
  v_item RECORD;
  v_plant TEXT;
BEGIN
  -- 1. Get the dispatch
  SELECT * INTO v_dispatch FROM public.dispatches WHERE id = p_dispatch_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch not found');
  END IF;
  
  IF v_dispatch.status != 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch is not in draft status');
  END IF;

  -- 2. Determine origin plant
  v_plant := COALESCE(v_dispatch.from_location, 'E41 G2');
  IF v_plant ILIKE '%D4%' THEN
    v_plant := 'D4';
  ELSIF v_plant ILIKE '%C116%' OR v_plant ILIKE '%C-116%' THEN
    v_plant := 'C116';
  ELSE
    v_plant := 'E41 G2';
  END IF;
  
  -- 3. Deduct stock for each item from this plant (Negative stock allowed)
  FOR v_item IN SELECT * FROM public.dispatch_items WHERE dispatch_id = p_dispatch_id
  LOOP
    INSERT INTO public.stock_transactions (
      model_id, 
      transaction_type, 
      quantity, 
      reference_id, 
      employee_id, 
      plant, 
      notes
    )
    VALUES (
      v_item.model_id, 
      'dispatch', 
      -v_item.quantity, 
      p_dispatch_id, 
      p_employee_id, 
      v_plant, 
      format('Dispatch confirmed from plant %s', v_plant)
    );
  END LOOP;
  
  -- 4. Update dispatch status and transfer_status
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

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.confirm_dispatch(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_dispatch(UUID, UUID) TO service_role;

-- ============================================================================
-- Jospo Enterprise Multi-Plant System - Multi-Plant Co-Loading Party Dispatch
-- Allows a vehicle to be partially loaded at Plant 1 (e.g. E41 G2),
-- travel to Plant 2 (e.g. D4) for additional loading, and then dispatch to Party.
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

-- 1. Add co-loading columns to public.dispatches
ALTER TABLE public.dispatches 
  ADD COLUMN IF NOT EXISTS is_coloading BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_loading_plant TEXT,
  ADD COLUMN IF NOT EXISTS coloading_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS second_plant TEXT,
  ADD COLUMN IF NOT EXISTS second_plant_employee_id UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS second_plant_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS second_plant_notes TEXT,
  ADD COLUMN IF NOT EXISTS third_plant TEXT,
  ADD COLUMN IF NOT EXISTS third_plant_employee_id UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS third_plant_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS third_plant_notes TEXT;

-- Index for fast lookup of incoming co-loading vehicles at each plant
CREATE INDEX IF NOT EXISTS idx_dispatches_coloading 
  ON public.dispatches(next_loading_plant, coloading_status);

-- 2. Add loaded_plant and loaded_by to public.dispatch_items
ALTER TABLE public.dispatch_items 
  ADD COLUMN IF NOT EXISTS loaded_plant TEXT NOT NULL DEFAULT 'E41 G2',
  ADD COLUMN IF NOT EXISTS loaded_by UUID REFERENCES public.employees(id);

-- 3. Update unique constraint on dispatch_items to allow same model from different plants
ALTER TABLE public.dispatch_items 
  DROP CONSTRAINT IF EXISTS dispatch_items_dispatch_id_model_id_key;

ALTER TABLE public.dispatch_items 
  DROP CONSTRAINT IF EXISTS dispatch_items_dispatch_id_model_id_loaded_plant_key;

ALTER TABLE public.dispatch_items 
  ADD CONSTRAINT dispatch_items_dispatch_id_model_id_loaded_plant_key 
  UNIQUE (dispatch_id, model_id, loaded_plant);

-- 4. Tag existing dispatch items with their dispatch's from_location
UPDATE public.dispatch_items di
SET loaded_plant = COALESCE(d.from_location, 'E41 G2')
FROM public.dispatches d
WHERE di.dispatch_id = d.id AND (di.loaded_plant IS NULL OR di.loaded_plant = '');

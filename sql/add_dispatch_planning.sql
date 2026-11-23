-- ====================================================================
-- Jospo Enterprise Multi-Plant System - Owner Dispatch Planning Schema
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. Create dispatch_plans Header Table
-- Supports:
--   - Destination-first planning (vehicle_number is optional at planning stage)
--   - Multi-plant manufacturing (plant can be E41 G2, D4, C116, or MULTI)
--   - Dispatch strategies (single_plant, coloading, split, auto)
CREATE TABLE IF NOT EXISTS public.dispatch_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plant TEXT NOT NULL DEFAULT 'E41 G2',
  vehicle_number TEXT DEFAULT '', -- Optional at planning time! Assigned when truck arrives at dock.
  destination TEXT NOT NULL,      -- Party Name or Destination Plant
  dispatch_type TEXT NOT NULL DEFAULT 'party' CHECK (dispatch_type IN ('party', 'local')),
  dispatch_mode TEXT NOT NULL DEFAULT 'auto' CHECK (dispatch_mode IN ('auto', 'single_plant', 'coloading', 'split')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'loading', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'high')),
  notes TEXT,
  driver_phone TEXT,
  created_by UUID REFERENCES public.employees(id),
  linked_dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If table already existed previously with vehicle_number NOT NULL, make it optional:
ALTER TABLE public.dispatch_plans ALTER COLUMN vehicle_number DROP NOT NULL;
ALTER TABLE public.dispatch_plans ALTER COLUMN vehicle_number SET DEFAULT '';
ALTER TABLE public.dispatch_plans ADD COLUMN IF NOT EXISTS dispatch_mode TEXT DEFAULT 'auto';

-- 2. Create dispatch_plan_items Line Items Table
-- Tracks item target quantity and which manufacturing plant produces it!
CREATE TABLE IF NOT EXISTS public.dispatch_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.dispatch_plans(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.cooler_models(id) ON DELETE CASCADE,
  plant TEXT NOT NULL DEFAULT 'E41 G2', -- Responsible plant for this cooler model
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure plant column exists on line items if table was previously created:
ALTER TABLE public.dispatch_plan_items ADD COLUMN IF NOT EXISTS plant TEXT DEFAULT 'E41 G2';

-- 3. Add plan_id to dispatches table to link actual dispatch back to plan
ALTER TABLE public.dispatches 
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.dispatch_plans(id) ON DELETE SET NULL;

-- 4. Indexes for fast filtering across plants
CREATE INDEX IF NOT EXISTS idx_dispatch_plans_date_plant 
  ON public.dispatch_plans(plan_date, plant, status);

CREATE INDEX IF NOT EXISTS idx_dispatch_plans_status 
  ON public.dispatch_plans(status);

CREATE INDEX IF NOT EXISTS idx_dispatch_plan_items_plan 
  ON public.dispatch_plan_items(plan_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_plan_items_plant 
  ON public.dispatch_plan_items(plant);

CREATE INDEX IF NOT EXISTS idx_dispatches_plan_id 
  ON public.dispatches(plan_id);

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_dispatch_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_dispatch_plans_updated_at ON public.dispatch_plans;
CREATE TRIGGER tr_dispatch_plans_updated_at
  BEFORE UPDATE ON public.dispatch_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_dispatch_plans_updated_at();

-- 6. Enable Row Level Security (RLS) & Grant Access
ALTER TABLE public.dispatch_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_plan_items ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.dispatch_plans TO authenticated, service_role;
GRANT ALL ON public.dispatch_plan_items TO authenticated, service_role;

DROP POLICY IF EXISTS "auth_read_dispatch_plans" ON public.dispatch_plans;
CREATE POLICY "auth_read_dispatch_plans" ON public.dispatch_plans
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_write_dispatch_plans" ON public.dispatch_plans;
CREATE POLICY "auth_write_dispatch_plans" ON public.dispatch_plans
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_read_dispatch_plan_items" ON public.dispatch_plan_items;
CREATE POLICY "auth_read_dispatch_plan_items" ON public.dispatch_plan_items
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_write_dispatch_plan_items" ON public.dispatch_plan_items;
CREATE POLICY "auth_write_dispatch_plan_items" ON public.dispatch_plan_items
  FOR ALL USING (auth.role() = 'authenticated');

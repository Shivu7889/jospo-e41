-- ====================================================================
-- Jospo Enterprise Multi-Plant System - Owner Dispatch Planning Schema
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. Create dispatch_plans Header Table
CREATE TABLE IF NOT EXISTS public.dispatch_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plant TEXT NOT NULL DEFAULT 'E41 G2',
  vehicle_number TEXT NOT NULL,
  destination TEXT NOT NULL,
  dispatch_type TEXT NOT NULL DEFAULT 'party' CHECK (dispatch_type IN ('party', 'local')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'loading', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'high')),
  notes TEXT,
  driver_phone TEXT,
  created_by UUID REFERENCES public.employees(id),
  linked_dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create dispatch_plan_items Line Items Table
CREATE TABLE IF NOT EXISTS public.dispatch_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.dispatch_plans(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.cooler_models(id) ON DELETE CASCADE,
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Add plan_id to dispatches table to link actual dispatch back to plan
ALTER TABLE public.dispatches 
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.dispatch_plans(id) ON DELETE SET NULL;

-- 4. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_dispatch_plans_date_plant 
  ON public.dispatch_plans(plan_date, plant, status);

CREATE INDEX IF NOT EXISTS idx_dispatch_plans_status 
  ON public.dispatch_plans(status);

CREATE INDEX IF NOT EXISTS idx_dispatch_plan_items_plan 
  ON public.dispatch_plan_items(plan_id);

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

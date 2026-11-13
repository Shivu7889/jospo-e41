-- Jospo E41 - PART 1: Tables and Views
-- Paste this in Supabase SQL Editor and click Run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.employees (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'production', 'dispatch')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE public.production_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES public.cooler_models(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  remarks TEXT,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE public.dispatch_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.cooler_models(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(dispatch_id, model_id)
);

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

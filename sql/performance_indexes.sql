-- ====================================================================
-- Jospo Enterprise High-Performance Database Indexes
-- Run this in your Supabase SQL Editor for instant 5x-10x speedup
-- ====================================================================

-- 1. Index-Only Scan for Stock Transactions (Massive speedup for Stock & Models API)
CREATE INDEX IF NOT EXISTS idx_stock_tx_plant_model_qty 
  ON public.stock_transactions(plant, model_id, quantity);

CREATE INDEX IF NOT EXISTS idx_stock_tx_model_qty 
  ON public.stock_transactions(model_id, quantity);

-- 2. Index for Production Entries by Plant and Date
CREATE INDEX IF NOT EXISTS idx_prod_entries_plant_date 
  ON public.production_entries(plant, production_date);

CREATE INDEX IF NOT EXISTS idx_prod_entries_date_model 
  ON public.production_entries(production_date, model_id);

-- 3. Composite Index for Dispatches
CREATE INDEX IF NOT EXISTS idx_dispatches_status_date_from 
  ON public.dispatches(status, dispatch_date, from_location);

CREATE INDEX IF NOT EXISTS idx_dispatches_transfer_speed 
  ON public.dispatches(destination_plant, transfer_status);

-- 4. Index for Dispatch Items
CREATE INDEX IF NOT EXISTS idx_dispatch_items_dispatch_qty 
  ON public.dispatch_items(dispatch_id, quantity);

-- Analyze tables to refresh PostgreSQL query planner statistics
ANALYZE public.stock_transactions;
ANALYZE public.production_entries;
ANALYZE public.dispatches;
ANALYZE public.dispatch_items;
ANALYZE public.cooler_models;
ANALYZE public.employees;

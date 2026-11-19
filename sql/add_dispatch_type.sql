-- Jospo E41 - Dispatch Type Migration (Local Dispatch to Other Plant vs Party Dispatch)
-- Run this in Supabase SQL Editor to add native dispatch_type column and index

ALTER TABLE public.dispatches 
ADD COLUMN IF NOT EXISTS dispatch_type TEXT NOT NULL DEFAULT 'party' CHECK (dispatch_type IN ('local', 'party'));

CREATE INDEX IF NOT EXISTS idx_dispatches_type 
ON public.dispatches(dispatch_type);

COMMENT ON COLUMN public.dispatches.dispatch_type IS 'Type of dispatch: "local" (Inter-plant transfer to our other plant) or "party" (Commercial dispatch to customer/dealer)';

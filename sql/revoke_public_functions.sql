-- Jospo E41 — Revoke public execution on SECURITY DEFINER functions
-- These functions should only be callable by authenticated users, not anonymous/public
-- Run this in Supabase SQL Editor

-- Revoke public access
REVOKE EXECUTE ON FUNCTION public.confirm_dispatch(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_dispatch(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;

-- Grant only to authenticated role
GRANT EXECUTE ON FUNCTION public.confirm_dispatch(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_dispatch(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

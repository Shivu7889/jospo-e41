-- =========================================================================
-- SQL Script: Reassign 4 Production Entries from 2026-11-17 to Thekedar 'Chotu'
-- Run this in your Supabase SQL Editor.
-- =========================================================================

-- 1. Ensure 'Chotu' is registered in contractors table (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contractors') THEN
    INSERT INTO public.contractors (name) VALUES ('Chotu')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

-- 2. Update the 4 production entries for 2026-11-17 to Thekedar 'Chotu'
-- Matches:
--   - ICECOOL-65-NCG-WG (17 units)
--   - TURBOCARE-ICECOOL-55-NCG-WG (77 units)
--   - TURBOCARE-ICECOOL-65-NCG-WG (35 units)
--   - ROLEX-65-NCG-WG (91 units)
UPDATE public.production_entries pe
SET contractor_name = 'Chotu',
    remarks = CASE 
      WHEN pe.remarks IS NULL OR pe.remarks = '' OR pe.remarks = '—' THEN '[Thekedar: Chotu]'
      WHEN pe.remarks LIKE '%[Thekedar:%' THEN regexp_replace(pe.remarks, '\[Thekedar:[^\]]+\]', '[Thekedar: Chotu]')
      ELSE '[Thekedar: Chotu] ' || pe.remarks 
    END
FROM public.cooler_models cm
WHERE pe.model_id = cm.id
  AND pe.production_date = '2026-11-17'
  AND (
    (cm.code = 'ICECOOL-65-NCG-WG' AND pe.quantity = 17) OR
    (cm.code = 'TURBOCARE-ICECOOL-55-NCG-WG' AND pe.quantity = 77) OR
    (cm.code = 'TURBOCARE-ICECOOL-65-NCG-WG' AND pe.quantity = 35) OR
    (cm.code = 'ROLEX-65-NCG-WG' AND pe.quantity = 91)
  );

-- 3. Verify the updated rows
SELECT 
  pe.id,
  pe.production_date,
  pe.contractor_name,
  cm.code AS model_code,
  cm.name AS model_name,
  pe.quantity,
  pe.remarks
FROM public.production_entries pe
JOIN public.cooler_models cm ON pe.model_id = cm.id
WHERE pe.production_date = '2026-11-17'
  AND pe.contractor_name = 'Chotu'
ORDER BY pe.created_at ASC;

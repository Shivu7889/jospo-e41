-- Jospo E41 - PART 2: Security Policies
-- Paste this in Supabase SQL Editor and click Run (AFTER Part 1)

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooler_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_employees" ON public.employees FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_models" ON public.cooler_models FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_production" ON public.production_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_dispatches" ON public.dispatches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_dispatch_items" ON public.dispatch_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_stock" ON public.stock_transactions FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_all_employees" ON public.employees FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_models" ON public.cooler_models FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_production" ON public.production_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_dispatches" ON public.dispatches FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_dispatch_items" ON public.dispatch_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_stock" ON public.stock_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "production_insert_entries" ON public.production_entries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'production'))
);
CREATE POLICY "production_insert_stock" ON public.stock_transactions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'production'))
);

CREATE POLICY "dispatch_insert_dispatches" ON public.dispatches FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_update_dispatches" ON public.dispatches FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_insert_items" ON public.dispatch_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_update_items" ON public.dispatch_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_delete_items" ON public.dispatch_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);
CREATE POLICY "dispatch_insert_stock" ON public.stock_transactions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'dispatch'))
);

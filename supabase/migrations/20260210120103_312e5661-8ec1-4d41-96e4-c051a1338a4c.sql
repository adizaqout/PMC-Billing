-- Add amount column to purchase_orders
ALTER TABLE public.purchase_orders ADD COLUMN amount numeric DEFAULT NULL;

-- Seed PO type lookup values
INSERT INTO public.lookup_values (category, value, label, sort_order, is_active)
VALUES
  ('po_type', 'original', 'Original', 1, true),
  ('po_type', 'revised', 'Revised', 2, true),
  ('po_type', 'variation_order', 'Variation Order', 3, true)
ON CONFLICT DO NOTHING;
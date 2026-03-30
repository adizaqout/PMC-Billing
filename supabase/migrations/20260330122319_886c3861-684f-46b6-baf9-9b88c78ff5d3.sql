INSERT INTO public.dashboard_gadgets (gadget_key, title, description, gadget_type, is_active, sort_order, default_width, default_height, config)
VALUES ('staff_allocation', 'Staff Allocation by Project & Function', 'Stacked bar chart showing number of staff per project grouped by position function for the current period', 'chart', true, 40, 12, 4, '{}')
ON CONFLICT DO NOTHING;
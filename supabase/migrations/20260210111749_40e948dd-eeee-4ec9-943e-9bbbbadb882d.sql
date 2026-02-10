
-- Add project_id to purchase_orders
ALTER TABLE public.purchase_orders 
ADD COLUMN project_id uuid REFERENCES public.projects(id);

-- Create index for performance
CREATE INDEX idx_purchase_orders_project_id ON public.purchase_orders(project_id);

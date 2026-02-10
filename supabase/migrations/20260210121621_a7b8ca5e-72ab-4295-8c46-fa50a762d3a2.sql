-- Add unique constraint for PO Number + Revision Number + PO Line Item
CREATE UNIQUE INDEX uq_po_number_revision_lineitem
ON public.purchase_orders (
  lower(po_number),
  COALESCE(revision_number, 0),
  lower(COALESCE(po_reference, ''))
);
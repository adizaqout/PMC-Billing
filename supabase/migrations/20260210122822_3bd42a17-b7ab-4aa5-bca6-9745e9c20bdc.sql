
-- Add unique position_id column to positions table
ALTER TABLE public.positions ADD COLUMN position_id TEXT;

-- Create a function to auto-generate position_id
CREATE OR REPLACE FUNCTION public.generate_position_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(position_id FROM 'POS-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.positions
  WHERE position_id ~ '^POS-\d+$';
  
  NEW.position_id := 'POS-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger to auto-generate position_id on insert
CREATE TRIGGER generate_position_id_trigger
BEFORE INSERT ON public.positions
FOR EACH ROW
WHEN (NEW.position_id IS NULL)
EXECUTE FUNCTION public.generate_position_id();

-- Backfill existing positions with position_id
DO $$
DECLARE
  rec RECORD;
  counter INTEGER := 0;
BEGIN
  FOR rec IN SELECT id FROM public.positions ORDER BY created_at LOOP
    counter := counter + 1;
    UPDATE public.positions SET position_id = 'POS-' || LPAD(counter::TEXT, 4, '0') WHERE id = rec.id;
  END LOOP;
END $$;

-- Now make it NOT NULL and UNIQUE
ALTER TABLE public.positions ALTER COLUMN position_id SET NOT NULL;
ALTER TABLE public.positions ADD CONSTRAINT positions_position_id_unique UNIQUE (position_id);

-- Drop the auto-generate trigger for position_id
DROP TRIGGER IF EXISTS generate_position_id_trigger ON public.positions;
DROP FUNCTION IF EXISTS public.generate_position_id();

-- Remove the unique constraint if it exists on position_id  
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_position_id_key;

-- Make position_id nullable (user-entered, not required for system)
-- Add a system_id column that is auto-generated as Consultant+Serial
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS system_id TEXT;

-- Create function to generate system_id = ConsultantName-Serial
CREATE OR REPLACE FUNCTION public.generate_position_system_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  consultant_name TEXT;
  next_serial INTEGER;
BEGIN
  SELECT name INTO consultant_name FROM public.consultants WHERE id = NEW.consultant_id;
  
  SELECT COALESCE(MAX(
    CASE WHEN system_id ~ ('^' || regexp_replace(consultant_name, '[^a-zA-Z0-9]', '', 'g') || '-\d+$')
    THEN CAST(SUBSTRING(system_id FROM '-(\d+)$') AS INTEGER)
    ELSE 0 END
  ), 0) + 1 INTO next_serial
  FROM public.positions
  WHERE consultant_id = NEW.consultant_id;
  
  NEW.system_id := regexp_replace(consultant_name, '[^a-zA-Z0-9]', '', 'g') || '-' || LPAD(next_serial::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER generate_position_system_id_trigger
BEFORE INSERT ON public.positions
FOR EACH ROW
WHEN (NEW.system_id IS NULL)
EXECUTE FUNCTION public.generate_position_system_id();

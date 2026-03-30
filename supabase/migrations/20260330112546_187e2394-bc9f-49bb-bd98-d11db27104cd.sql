-- Fill existing null short_names with name
UPDATE public.consultants SET short_name = name WHERE short_name IS NULL;

-- Make short_name NOT NULL
ALTER TABLE public.consultants ALTER COLUMN short_name SET NOT NULL;

-- Update the system_id generation trigger to use short_name
CREATE OR REPLACE FUNCTION public.generate_position_system_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  consultant_short TEXT;
  next_serial INTEGER;
BEGIN
  SELECT short_name INTO consultant_short FROM public.consultants WHERE id = NEW.consultant_id;
  
  SELECT COALESCE(MAX(
    CASE WHEN system_id ~ ('^' || regexp_replace(consultant_short, '[^a-zA-Z0-9]', '', 'g') || '-\d+$')
    THEN CAST(SUBSTRING(system_id FROM '-(\d+)$') AS INTEGER)
    ELSE 0 END
  ), 0) + 1 INTO next_serial
  FROM public.positions
  WHERE consultant_id = NEW.consultant_id;
  
  NEW.system_id := regexp_replace(consultant_short, '[^a-zA-Z0-9]', '', 'g') || '-' || LPAD(next_serial::TEXT, 3, '0');
  RETURN NEW;
END;
$function$;
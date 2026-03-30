
-- Update the trigger to use short_name properly (already uses short_name, just ensure clean output)
CREATE OR REPLACE FUNCTION public.generate_position_system_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  consultant_short TEXT;
  next_serial INTEGER;
  clean_prefix TEXT;
BEGIN
  SELECT short_name INTO consultant_short FROM public.consultants WHERE id = NEW.consultant_id;
  
  clean_prefix := regexp_replace(consultant_short, '[^a-zA-Z0-9]', '', 'g');
  
  SELECT COALESCE(MAX(
    CASE WHEN system_id ~ ('^' || clean_prefix || '-\d+$')
    THEN CAST(SUBSTRING(system_id FROM '-(\d+)$') AS INTEGER)
    ELSE 0 END
  ), 0) + 1 INTO next_serial
  FROM public.positions
  WHERE consultant_id = NEW.consultant_id;
  
  NEW.system_id := clean_prefix || '-' || LPAD(next_serial::TEXT, 3, '0');
  RETURN NEW;
END;
$function$;

-- Regenerate all existing system_ids using short_name
UPDATE public.positions p
SET system_id = sub.new_id
FROM (
  SELECT 
    p2.id,
    regexp_replace(c.short_name, '[^a-zA-Z0-9]', '', 'g') || '-' || LPAD(ROW_NUMBER() OVER (PARTITION BY p2.consultant_id ORDER BY p2.created_at)::TEXT, 3, '0') AS new_id
  FROM public.positions p2
  JOIN public.consultants c ON c.id = p2.consultant_id
) sub
WHERE p.id = sub.id;

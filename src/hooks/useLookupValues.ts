import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LookupValue {
  id: string;
  category: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export function useLookupValues(category: string) {
  return useQuery({
    queryKey: ["lookup_values", category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lookup_values")
        .select("*")
        .eq("category", category)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as LookupValue[];
    },
  });
}

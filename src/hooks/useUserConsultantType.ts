import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Resolves the logged-in user's consultant_type via:
 *   user -> profile.consultant_id -> consultants.consultant_type
 *
 * Returns:
 *   - "PMC" | "Supervision" if the user is bound to a single consultant
 *   - "all" if the user is admin/superadmin OR has no consultant binding (treated as "All Companies")
 */
export function useUserConsultantType() {
  const { user, isSuperAdmin, roles } = useAuth();
  const isAdmin = isSuperAdmin || roles.includes("admin");

  const { data, isLoading } = useQuery({
    queryKey: ["user-consultant-type", user?.id],
    enabled: !!user?.id && !isAdmin,
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("consultant_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!profile?.consultant_id) return "all" as const;
      const { data: consultant } = await supabase
        .from("consultants")
        .select("consultant_type")
        .eq("id", profile.consultant_id)
        .maybeSingle();
      const ct = (consultant as any)?.consultant_type;
      if (ct === "Supervision") return "Supervision" as const;
      if (ct === "PMC") return "PMC" as const;
      return "all" as const;
    },
  });

  if (isAdmin) return { consultantType: "all" as const, isLoading: false };
  return { consultantType: (data ?? "all") as "all" | "PMC" | "Supervision", isLoading };
}

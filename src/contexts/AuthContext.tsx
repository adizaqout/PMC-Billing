import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type PermissionLevel = "no_access" | "read" | "modify";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  permissions: Record<string, PermissionLevel>;
  featureToggles: Record<string, boolean>;
  roles: string[];
  isSuperAdmin: boolean;
  hasModuleAccess: (module: string) => boolean;
  hasFeatureEnabled: (featureKey: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  permissions: {},
  featureToggles: {},
  roles: [],
  isSuperAdmin: false,
  hasModuleAccess: () => false,
  hasFeatureEnabled: () => false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>({});
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const fetchPermissions = async (userId: string) => {
    try {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role, group_id")
        .eq("user_id", userId);

      const roleList = userRoles?.map((r) => r.role) || [];
      setRoles(roleList);
      const isSuper = roleList.includes("superadmin");
      setIsSuperAdmin(isSuper);

      const groupIds = userRoles?.map((r) => r.group_id) || [];
      if (isSuper) {
        setPermissions({});
        setFeatureToggles({ ai_assistant: true });
        return;
      }

      if (groupIds.length === 0) {
        setPermissions({});
        setFeatureToggles({});
        return;
      }

      const [{ data: groupPerms }, { data: featureRows }] = await Promise.all([
        supabase.from("group_permissions").select("module_name, permission").in("group_id", groupIds),
        supabase.from("group_feature_toggles").select("feature_key, is_enabled").in("group_id", groupIds),
      ]);

      const permMap: Record<string, PermissionLevel> = {};
      const levels: Record<string, number> = { no_access: 0, read: 1, modify: 2 };

      groupPerms?.forEach((gp) => {
        const current = permMap[gp.module_name] || "no_access";
        if (levels[gp.permission] > levels[current]) {
          permMap[gp.module_name] = gp.permission as PermissionLevel;
        }
      });

      const featureMap: Record<string, boolean> = {};
      featureRows?.forEach((row) => {
        featureMap[row.feature_key] = featureMap[row.feature_key] || Boolean(row.is_enabled);
      });

      setPermissions(permMap);
      setFeatureToggles(featureMap);
    } catch (err) {
      console.error("Failed to fetch permissions:", err);
      setPermissions({});
      setFeatureToggles({});
      setRoles([]);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
        if (session?.user) {
          setTimeout(() => fetchPermissions(session.user.id), 0);
        } else {
          setPermissions({});
          setFeatureToggles({});
          setRoles([]);
          setIsSuperAdmin(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        fetchPermissions(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasModuleAccess = (module: string): boolean => {
    if (isSuperAdmin) return true;
    if (roles.includes("admin")) return true;
    const perm = permissions[module];
    return perm === "read" || perm === "modify";
  };

  const hasFeatureEnabled = (featureKey: string) => {
    if (isSuperAdmin || roles.includes("admin")) return true;
    return Boolean(featureToggles[featureKey]);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut, permissions, featureToggles, roles, isSuperAdmin, hasModuleAccess, hasFeatureEnabled }}>
      {children}
    </AuthContext.Provider>
  );
}

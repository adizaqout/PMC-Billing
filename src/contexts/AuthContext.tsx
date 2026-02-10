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
  roles: string[];
  isSuperAdmin: boolean;
  hasModuleAccess: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  permissions: {},
  roles: [],
  isSuperAdmin: false,
  hasModuleAccess: () => false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const fetchPermissions = async (userId: string) => {
    try {
      // Fetch user roles
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role, group_id")
        .eq("user_id", userId);

      const roleList = userRoles?.map(r => r.role) || [];
      setRoles(roleList);
      const isSuper = roleList.includes("superadmin");
      setIsSuperAdmin(isSuper);

      if (isSuper) {
        // Superadmin has access to everything
        setPermissions({});
        return;
      }

      // Fetch group permissions for all user's groups
      const groupIds = userRoles?.map(r => r.group_id) || [];
      if (groupIds.length === 0) {
        setPermissions({});
        return;
      }

      const { data: groupPerms } = await supabase
        .from("group_permissions")
        .select("module_name, permission")
        .in("group_id", groupIds);

      // Merge permissions: highest permission wins across groups
      const permMap: Record<string, PermissionLevel> = {};
      const levels: Record<string, number> = { no_access: 0, read: 1, modify: 2 };
      
      groupPerms?.forEach(gp => {
        const current = permMap[gp.module_name] || "no_access";
        if (levels[gp.permission] > levels[current]) {
          permMap[gp.module_name] = gp.permission as PermissionLevel;
        }
      });

      setPermissions(permMap);
    } catch (err) {
      console.error("Failed to fetch permissions:", err);
      setPermissions({});
      setRoles([]);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
        if (session?.user) {
          // Defer to avoid Supabase auth deadlock
          setTimeout(() => fetchPermissions(session.user.id), 0);
        } else {
          setPermissions({});
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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut, permissions, roles, isSuperAdmin, hasModuleAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

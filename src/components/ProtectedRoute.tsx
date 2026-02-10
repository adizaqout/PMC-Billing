import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  module?: string;
}

export default function ProtectedRoute({ children, adminOnly, module }: ProtectedRouteProps) {
  const { session, loading, isSuperAdmin, roles, hasModuleAccess } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isSuperAdmin && !roles.includes("admin")) {
    return <Navigate to="/" replace />;
  }

  if (module && !hasModuleAccess(module)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

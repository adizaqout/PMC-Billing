import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";
import aldarLogo from "@/assets/aldar-logo.webp";
import {
  LayoutDashboard,
  Building2,
  FileText,
  ShoppingCart,
  Receipt,
  FolderKanban,
  Users,
  Briefcase,
  CalendarCheck,
  Grid3X3,
  BarChart3,
  Bot,
  Settings,
  Lock,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  module?: string; // maps to group_permissions module_name
  adminOnly?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Overview", icon: LayoutDashboard, path: "/" },
    ],
  },
  {
    title: "Master Data",
    items: [
      { label: "Consultants", icon: Building2, path: "/consultants", module: "consultants" },
      { label: "Framework Agreements", icon: FileText, path: "/framework-agreements", module: "framework_agreements" },
      { label: "Service Orders", icon: ShoppingCart, path: "/service-orders", module: "service_orders" },
      { label: "Purchase Orders", icon: Receipt, path: "/purchase-orders", module: "purchase_orders" },
      { label: "Projects", icon: FolderKanban, path: "/projects", module: "projects" },
      { label: "Invoices", icon: FileText, path: "/invoices", module: "invoices" },
      { label: "Positions", icon: Briefcase, path: "/positions", module: "positions" },
      { label: "Employees", icon: Users, path: "/employees", module: "employees" },
    ],
  },
  {
    title: "Deployment",
    items: [
      { label: "Deployment Schedules", icon: Grid3X3, path: "/deployments", module: "deployments" },
      { label: "Period Control", icon: Lock, path: "/period-control", module: "period_control" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", icon: BarChart3, path: "/reports", module: "reports" },
      { label: "AI Assistant", icon: Bot, path: "/ai-assistant", module: "ai_assistant" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Admin Panel", icon: Settings, path: "/admin", adminOnly: true },
    ],
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user, signOut, hasModuleAccess, hasFeatureEnabled, isSuperAdmin, roles } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mini, setMini] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(navSections.map((s) => [s.title, true]))
  );

  const isAdminRole = isSuperAdmin || roles.includes("admin");

  const toggleSection = (title: string) => {
    if (mini) return;
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const filteredSections = navSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.adminOnly) return isAdminRole;
        if (!item.module) return true;
        if (item.module === "ai_assistant") return hasModuleAccess(item.module) && hasFeatureEnabled("ai_assistant");
        return hasModuleAccess(item.module);
      }),
    }))
    .filter(section => section.items.length > 0);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 z-50 lg:hidden p-2 rounded-md bg-sidebar text-sidebar-foreground"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside
        className={`
          fixed top-0 left-0 h-screen z-40 flex flex-col
          bg-sidebar border-r border-sidebar-border
          transition-all duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          ${mini ? "w-14" : "w-60"}
          lg:translate-x-0 lg:static lg:shrink-0
        `}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center gap-2 px-3 h-14 border-b border-sidebar-border shrink-0">
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <img src={aldarLogo} alt="Aldar" className="w-8 h-8 object-contain" />
          </div>
          {!mini && (
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-semibold text-sidebar-accent-foreground leading-tight">Consultants Deployment</span>
              <span className="text-[10px] text-sidebar-muted leading-tight">Management System</span>
            </div>
          )}
          <button
            onClick={() => setMini(!mini)}
            className="hidden lg:flex p-1 rounded hover:bg-sidebar-accent text-sidebar-muted hover:text-sidebar-accent-foreground transition-colors shrink-0"
            title={mini ? "Expand sidebar" : "Collapse sidebar"}
          >
            {mini ? <ChevronRight size={14} /> : <ChevronDown size={14} className="rotate-90" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-1">
          {filteredSections.map((section) => (
            <div key={section.title}>
              {!mini && (
                <button
                  onClick={() => toggleSection(section.title)}
                  className="sidebar-section-title flex items-center justify-between w-full mt-3 first:mt-1"
                >
                  {section.title}
                  {expandedSections[section.title] ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                </button>
              )}
              {(mini || expandedSections[section.title]) && (
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`sidebar-nav-item ${
                        location.pathname === item.path ? "active" : ""
                      } ${mini ? "justify-center px-0" : ""}`}
                      title={mini ? item.label : undefined}
                    >
                      <item.icon size={16} />
                      {!mini && <span>{item.label}</span>}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-sidebar-border shrink-0">
          <div className={`flex items-center ${mini ? "justify-center" : "gap-2"}`}>
            <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-sidebar-accent-foreground">
                {user?.email?.[0]?.toUpperCase() || "?"}
              </span>
            </div>
            {!mini && (
              <>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-xs font-medium text-sidebar-accent-foreground truncate">
                    {user?.email || "Unknown"}
                  </span>
                </div>
                <button
                  onClick={signOut}
                  className="p-1.5 rounded hover:bg-sidebar-accent text-sidebar-muted hover:text-sidebar-accent-foreground transition-colors"
                  title="Sign out"
                >
                  <LogOut size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}

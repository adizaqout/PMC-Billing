import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
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

const navSections = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    ],
  },
  {
    title: "Master Data",
    items: [
      { label: "Consultants", icon: Building2, path: "/consultants" },
      { label: "Framework Agreements", icon: FileText, path: "/framework-agreements" },
      { label: "Service Orders", icon: ShoppingCart, path: "/service-orders" },
      { label: "Purchase Orders", icon: Receipt, path: "/purchase-orders" },
      { label: "Projects", icon: FolderKanban, path: "/projects" },
      { label: "Invoices", icon: FileText, path: "/invoices" },
      { label: "Positions", icon: Briefcase, path: "/positions" },
      { label: "Employees", icon: Users, path: "/employees" },
    ],
  },
  {
    title: "Deployment",
    items: [
      { label: "Deployment Schedules", icon: Grid3X3, path: "/deployments" },
      { label: "Period Control", icon: Lock, path: "/period-control" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", icon: BarChart3, path: "/reports" },
      { label: "AI Assistant", icon: Bot, path: "/ai-assistant" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Admin Panel", icon: Settings, path: "/admin" },
    ],
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(navSections.map((s) => [s.title, true]))
  );

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="fixed top-3 left-3 z-50 lg:hidden p-2 rounded-md bg-sidebar text-sidebar-foreground"
      >
        {collapsed ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside
        className={`
          fixed top-0 left-0 h-screen z-40 flex flex-col
          bg-sidebar border-r border-sidebar-border
          transition-all duration-200
          ${collapsed ? "w-64 translate-x-0" : "-translate-x-full w-64"}
          lg:translate-x-0 lg:static lg:w-60 lg:shrink-0
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border shrink-0">
          <div className="w-7 h-7 rounded bg-sidebar-primary flex items-center justify-center">
            <span className="text-sidebar-primary-foreground text-xs font-bold">PMC</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-accent-foreground leading-tight">PMC Billing</span>
            <span className="text-[10px] text-sidebar-muted leading-tight">Deployment Control</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {navSections.map((section) => (
            <div key={section.title}>
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
              {expandedSections[section.title] && (
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setCollapsed(false)}
                      className={`sidebar-nav-item ${
                        location.pathname === item.path ? "active" : ""
                      }`}
                    >
                      <item.icon size={16} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center">
              <span className="text-xs font-medium text-sidebar-accent-foreground">A</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-sidebar-accent-foreground">Admin User</span>
              <span className="text-[10px] text-sidebar-muted">Superadmin</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {collapsed && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setCollapsed(false)}
        />
      )}
    </>
  );
}

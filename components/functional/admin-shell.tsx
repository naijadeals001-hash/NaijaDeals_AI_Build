"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  UserCheck,
  Package,
  CreditCard,
  Users,
  Truck,
  Car,
  DollarSign,
  ClipboardList,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
  Bell,
  Shield,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Store,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-provider";

export interface AdminUser {
  name: string;
  email: string;
  avatar?: string;
  actorType?: string;
  roles?: string[];
  vendorIds?: string[];
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
  children?: NavItem[];
  roles?: string[];
}

const adminNavItems: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard className="h-5 w-5" />,
    href: "/admin",
  },
  {
    id: "operations",
    label: "Operations",
    icon: <Shield className="h-5 w-5" />,
    href: "#",
    children: [
      { id: "orders", label: "Orders", icon: <ShoppingBag className="h-4 w-4" />, href: "/admin?tab=orders" },
      { id: "deliveries", label: "Deliveries", icon: <Truck className="h-4 w-4" />, href: "/admin?tab=deliveries" },
      { id: "rides", label: "Rides", icon: <Car className="h-4 w-4" />, href: "/admin?tab=rides" },
      { id: "payouts", label: "Payouts", icon: <DollarSign className="h-4 w-4" />, href: "/admin?tab=payouts" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    icon: <Package className="h-5 w-5" />,
    href: "#",
    children: [
      { id: "products", label: "Products", icon: <Package className="h-4 w-4" />, href: "/admin?tab=products" },
      { id: "applications", label: "Seller applications", icon: <UserCheck className="h-4 w-4" />, href: "/admin?tab=applications" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: <CreditCard className="h-5 w-5" />,
    href: "#",
    children: [
      { id: "payments", label: "Payments", icon: <CreditCard className="h-4 w-4" />, href: "/admin?tab=payments" },
      { id: "payouts-finance", label: "Payouts", icon: <DollarSign className="h-4 w-4" />, href: "/admin?tab=payouts" },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: <Users className="h-5 w-5" />,
    href: "#",
    children: [
      { id: "users", label: "Users", icon: <Users className="h-4 w-4" />, href: "/admin?tab=users" },
      { id: "vendors", label: "Vendors", icon: <Store className="h-4 w-4" />, href: "/admin?tab=vendors" },
      { id: "couriers", label: "Couriers", icon: <Truck className="h-4 w-4" />, href: "/admin?tab=couriers" },
      { id: "drivers", label: "Drivers", icon: <Car className="h-4 w-4" />, href: "/admin?tab=drivers" },
    ],
  },
  {
    id: "audit",
    label: "Audit log",
    icon: <ClipboardList className="h-5 w-5" />,
    href: "/admin?tab=audit",
  },
  {
    id: "settings",
    label: "Settings",
    icon: <Settings className="h-5 w-5" />,
    href: "/admin?tab=settings",
    roles: ["super_admin"],
  },
];

export function AdminShell({
  children,
  user,
  pathname: currentPathname = "/admin",
}: {
  children: React.ReactNode;
  user: AdminUser;
  pathname?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(["operations", "catalog", "finance", "people"]);
  const [lastFocusedElement, setLastFocusedElement] = useState<HTMLElement | null>(null);
  const { t } = useLocale();

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    // Restore focus to the menu button
    if (lastFocusedElement) {
      lastFocusedElement.focus();
    }
  }, [lastFocusedElement]);

  const openSidebar = useCallback(() => {
    // Store the currently focused element before opening
    setLastFocusedElement(document.activeElement as HTMLElement);
    setSidebarOpen(true);
  }, []);

  // Handle Escape key to close mobile sidebar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sidebarOpen) {
        event.preventDefault();
        closeSidebar();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, closeSidebar]);

  const isActive = (href: string) => {
    if (href === "#") return false;
    const tab = href.includes("tab=") ? href.split("tab=")[1] : "overview";
    return pathname?.includes(`tab=${tab}`) || (tab === "overview" && pathname === "/admin");
  };

  const isSectionExpanded = (sectionId: string) => expandedSections.includes(sectionId);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => (prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]));
  };

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } });
    router.push("/");
    router.refresh();
  }

  const userRoles = user.roles ?? [];
  const filteredNavItems = adminNavItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.some((role) => userRoles.includes(role) || user.actorType === role.toUpperCase());
  });

  return (
    <div className="min-h-screen bg-surface text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 h-screen border-r border-border-soft bg-canvas transition-all duration-200 ${
          sidebarCollapsed ? "w-16" : "w-64"
        } lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        aria-label="Control Center navigation"
      >
        <div className="flex h-full flex-col">
          {/* Brand header */}
          <div className={`flex h-16 items-center justify-between border-b border-border-soft px-4 ${sidebarCollapsed ? "justify-center" : ""}`}>
            <Link href="/admin" className="flex items-center gap-2" aria-label="Control Center home">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-black text-white shadow-lift">
                CC
              </span>
              {!sidebarCollapsed && <span className="font-display text-xl font-extrabold text-primary">Control Center</span>}
            </Link>
            {!sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-low hover:text-ink"
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!sidebarCollapsed}
              >
                {sidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Main navigation">
            {filteredNavItems.map((section) => {
              const hasChildren = !!(section.children && section.children.length > 0);
              const isSectionActive = hasChildren
                ? section.children?.some((child) => isActive(child.href))
                : isActive(section.href);

              return (
                <div key={section.id} className="group">
                  {hasChildren ? (
                    <>
                      <button
                        onClick={() => toggleSection(section.id)}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                          isSectionActive
                            ? "bg-primary-soft text-primary"
                            : "text-muted hover:bg-surface-low hover:text-ink"
                        }`}
                        aria-expanded={isSectionExpanded(section.id)}
                        aria-controls={`${section.id}-submenu`}
                      >
                        <span className="shrink-0" aria-hidden="true">{section.icon}</span>
                        {!sidebarCollapsed && (
                          <span className="flex-1 text-left truncate">{section.label}</span>
                        )}
                        {!sidebarCollapsed && (
                          <span className={`transition-transform ${isSectionExpanded(section.id) ? "rotate-180" : ""}`}>
                            <ChevronDown className="h-4 w-4 text-muted" />
                          </span>
                        )}
                      </button>
                      {!sidebarCollapsed && (
                        <ul
                          id={`${section.id}-submenu`}
                          role="list"
                          className={`overflow-hidden transition-all duration-200 ${
                            isSectionExpanded(section.id) ? "max-h-64 opacity-100 mt-1" : "max-h-0 opacity-0"
                          }`}
                          aria-label={`${section.label} submenu`}
                        >
                          {section.children?.map((child) => (
                            <li key={child.id}>
                              <Link
                                href={child.href}
                                className={`flex items-center gap-3 rounded-xl px-6 py-2 text-sm font-medium transition-colors ${
                                  isActive(child.href)
                                    ? "bg-primary-soft text-primary"
                                    : "text-muted hover:bg-surface-low hover:text-ink"
                                }`}
                                aria-current={isActive(child.href) ? "page" : undefined}
                              >
                                <span className="shrink-0" aria-hidden="true">{child.icon}</span>
                                <span className="truncate">{child.label}</span>
                                {child.badge && (
                                  <span className="ml-auto min-w-5 h-5 rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary text-center">
                                    {child.badge > 99 ? "99+" : child.badge}
                                  </span>
                                )}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <Link
                      href={section.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                        isActive(section.href)
                          ? "bg-primary-soft text-primary"
                          : "text-muted hover:bg-surface-low hover:text-ink"
                      }`}
                      aria-current={isActive(section.href) ? "page" : undefined}
                    >
                      <span className="shrink-0" aria-hidden="true">{section.icon}</span>
                      {!sidebarCollapsed && <span className="truncate">{section.label}</span>}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>

          {/* User section */}
          <div className={`border-t border-border-soft p-4 ${sidebarCollapsed ? "px-2" : ""}`}>
            {!sidebarCollapsed ? (
              <>
                <div className="flex items-center gap-3 rounded-xl bg-primary-soft p-3 mb-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-sm font-bold text-white">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{user.name}</p>
                    <p className="text-xs text-muted truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-low hover:text-crimson"
                >
                  <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Sign out</span>
                </button>
              </>
            ) : (
              <div className="flex justify-center">
                <button
                  onClick={signOut}
                  className="rounded-lg p-2 text-muted hover:bg-surface-low hover:text-crimson"
                  aria-label="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile sidebar toggle */}
      <button
        className="fixed bottom-6 left-6 z-40 lg:hidden rounded-full bg-primary p-3 shadow-lift text-white"
        onClick={openSidebar}
        aria-label="Open navigation menu"
        aria-expanded={sidebarOpen}
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Top header */}
      <header className={`sticky top-0 z-30 border-b border-border-soft bg-canvas/95 backdrop-blur ${sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              className="rounded-lg p-2 text-muted hover:bg-surface-low lg:hidden"
              onClick={openSidebar}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="hidden font-display text-xl font-extrabold text-ink lg:block">
              {currentPathname.includes("tab=")
                ? currentPathname.split("tab=")[1].replace(/-/g, " ").replace(/\\b\\w/g, (c) => c.toUpperCase())
                : "Operations dashboard"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search orders, users, products..."
                className="h-10 w-64 rounded-xl border border-border-soft bg-canvas pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                aria-label="Search Control Center"
              />
            </div>

            {/* Notifications */}
            <button className="relative rounded-full p-2 text-muted hover:bg-surface-low" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-crimson text-[10px] font-bold text-white flex items-center justify-center">
                3
              </span>
            </button>

            {/* Refresh */}
            <button className="rounded-full p-2 text-muted hover:bg-surface-low" aria-label="Refresh data">
              <RefreshCw className="h-5 w-5" />
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                className="flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-sm font-bold text-primary"
                aria-expanded="false"
                aria-haspopup="true"
              >
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline truncate max-w-[140px]">{user.name}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main
        id="main-content"
        className={`pt-6 pb-12 ${sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"} lg:px-8`}
        role="main"
      >
        <div className="mx-auto max-w-7xl px-4">{children}</div>
      </main>
    </div>
  );
}
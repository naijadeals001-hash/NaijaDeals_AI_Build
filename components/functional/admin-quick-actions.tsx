"use client";

import { UserPlus, Car, Truck, DollarSign, MapPin, Tag, Settings, Plus, Zap, Shield, Package, Utensils } from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  href: string;
  roles?: string[];
}

const quickActions: QuickAction[] = [
  {
    id: "add-driver",
    label: "Add Driver",
    description: "Onboard new driver to fleet",
    icon: <UserPlus className="h-5 w-5" />,
    color: "text-[#00E676]",
    bgColor: "bg-[#00E676]/10",
    href: "/admin?module=drive&tab=drivers&action=add",
    roles: ["admin", "super_admin"],
  },
  {
    id: "add-vehicle",
    label: "Add Vehicle",
    description: "Register new vehicle to fleet",
    icon: <Car className="h-5 w-5" />,
    color: "text-[#3B82F6]",
    bgColor: "bg-[#3B82F6]/10",
    href: "/admin?module=drive&tab=vehicles&action=add",
    roles: ["admin", "super_admin"],
  },
  {
    id: "set-fare-rule",
    label: "Set Fare Rule",
    description: "Configure dynamic pricing rules",
    icon: <DollarSign className="h-5 w-5" />,
    color: "text-[#F59E0B]",
    bgColor: "bg-[#F59E0B]/10",
    href: "/admin?module=drive&tab=pricing",
    roles: ["admin", "super_admin"],
  },
  {
    id: "create-promo",
    label: "Create Promo",
    description: "Launch rider/driver promotion",
    icon: <Tag className="h-5 w-5" />,
    color: "text-[#EC4899]",
    bgColor: "bg-[#EC4899]/10",
    href: "/admin?module=drive&tab=promotions&action=create",
    roles: ["admin", "super_admin"],
  },
  {
    id: "manage-zones",
    label: "Manage Zones",
    description: "Configure service areas & pricing",
    icon: <MapPin className="h-5 w-5" />,
    color: "text-[#8B5CF6]",
    bgColor: "bg-[#8B5CF6]/10",
    href: "/admin?module=drive&tab=zones",
    roles: ["admin", "super_admin"],
  },
  {
    id: "system-settings",
    label: "System Settings",
    description: "Global configuration & features",
    icon: <Settings className="h-5 w-5" />,
    color: "text-[#84CC16]",
    bgColor: "bg-[#84CC16]/10",
    href: "/admin?tab=settings",
    roles: ["super_admin"],
  },
  {
    id: "add-courier",
    label: "Add Courier",
    description: "Onboard new courier partner",
    icon: <Truck className="h-5 w-5" />,
    color: "text-[#F97316]",
    bgColor: "bg-[#F97316]/10",
    href: "/admin?module=send&tab=couriers&action=add",
    roles: ["admin", "super_admin"],
  },
  {
    id: "add-restaurant",
    label: "Add Restaurant",
    description: "Onboard new restaurant partner",
    icon: <Utensils className="h-5 w-5" />,
    color: "text-[#EF4444]",
    bgColor: "bg-[#EF4444]/10",
    href: "/admin?module=eats&tab=restaurants&action=add",
    roles: ["admin", "super_admin"],
  },
];

interface QuickActionsProps {
  userRoles: string[];
  userActorType?: string;
}

export function QuickActions({ userRoles, userActorType }: QuickActionsProps) {
  const isSuperAdmin = userRoles.includes("super_admin") || userActorType === "SUPER_ADMIN";

  const filteredActions = quickActions.filter((action) => {
    if (!action.roles) return true;
    if (isSuperAdmin) return true;
    return action.roles.some((r) => userRoles.includes(r));
  });

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft" aria-label="Quick actions">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[#F59E0B]" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Quick Actions</h2>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {filteredActions.map((action) => (
          <a
            key={action.id}
            href={action.href}
            className="group flex items-start gap-3 rounded-xl border border-[#21262D] bg-[#21262D] p-4 hover:border-[#30363D] hover:bg-[#30363D]/50 transition-all duration-200"
          >
            <div className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-lg ${action.bgColor} ${action.color}`}>
              {action.icon}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-[#F0F6FC] group-hover:text-[#00E676] transition-colors">{action.label}</p>
              <p className="mt-0.5 text-[11px] text-[#8B949E] truncate">{action.description}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
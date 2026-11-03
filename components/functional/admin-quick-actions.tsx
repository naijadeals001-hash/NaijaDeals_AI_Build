"use client";

import { UserCheck, Package, CreditCard, DollarSign, Users, ClipboardList, Settings, Zap, ShieldCheck } from "lucide-react";
import type { AdminTab } from "@/lib/admin/admin-navigation";

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  tab: AdminTab;
  superAdminOnly?: boolean;
}

const quickActions: QuickAction[] = [
  {
    id: "review-applications",
    label: "Review applications",
    description: "Approve or reject seller applications",
    icon: <UserCheck className="h-5 w-5" />,
    color: "text-[#00E676]",
    bgColor: "bg-[#00E676]/10",
    tab: "applications"
  },
  {
    id: "manage-products",
    label: "Moderate products",
    description: "Activate or suspend catalogue items",
    icon: <Package className="h-5 w-5" />,
    color: "text-[#3B82F6]",
    bgColor: "bg-[#3B82F6]/10",
    tab: "products"
  },
  {
    id: "payments",
    label: "Payments",
    description: "Inspect provider references and status",
    icon: <CreditCard className="h-5 w-5" />,
    color: "text-[#F59E0B]",
    bgColor: "bg-[#F59E0B]/10",
    tab: "payments"
  },
  {
    id: "payouts",
    label: "Payouts",
    description: "Settle vendor balances",
    icon: <DollarSign className="h-5 w-5" />,
    color: "text-[#F97316]",
    bgColor: "bg-[#F97316]/10",
    tab: "payouts"
  },
  {
    id: "users",
    label: "Users & roles",
    description: "Inspect accounts and role assignments",
    icon: <Users className="h-5 w-5" />,
    color: "text-[#8B5CF6]",
    bgColor: "bg-[#8B5CF6]/10",
    tab: "users"
  },
  {
    id: "audit",
    label: "Audit log",
    description: "Review recorded administrative actions",
    icon: <ClipboardList className="h-5 w-5" />,
    color: "text-[#EC4899]",
    bgColor: "bg-[#EC4899]/10",
    tab: "audit"
  },
  {
    id: "seed-fixtures",
    label: "Local fixtures",
    description: "Read the documented development accounts",
    icon: <ShieldCheck className="h-5 w-5" />,
    color: "text-[#22C55E]",
    bgColor: "bg-[#22C55E]/10",
    tab: "settings",
    superAdminOnly: true
  },
  {
    id: "settings",
    label: "Platform settings",
    description: "Super-admin-only configuration snapshot",
    icon: <Settings className="h-5 w-5" />,
    color: "text-[#84CC16]",
    bgColor: "bg-[#84CC16]/10",
    tab: "settings",
    superAdminOnly: true
  }
];

export function QuickActions({
  isSuperAdmin,
  onNavigate
}: {
  isSuperAdmin: boolean;
  onNavigate: (tab: AdminTab) => void;
}) {
  const actions = quickActions.filter((action) => !action.superAdminOnly || isSuperAdmin);

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft" aria-label="Quick actions">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-5 w-5 text-[#F59E0B]" aria-hidden="true" />
        <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Quick Actions</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onNavigate(action.tab)}
            className="group flex items-start gap-3 rounded-xl border border-[#21262D] bg-[#21262D] p-4 text-left transition-all duration-200 hover:border-[#30363D] hover:bg-[#30363D]/50"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.bgColor} ${action.color}`}>
              {action.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#F0F6FC] transition-colors group-hover:text-[#00E676]">{action.label}</p>
              <p className="mt-0.5 truncate text-[11px] text-[#8B949E]">{action.description}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

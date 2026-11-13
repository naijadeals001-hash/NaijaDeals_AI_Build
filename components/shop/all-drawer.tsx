"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BadgeDollarSign,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Grid2x2,
  Heart,
  Leaf,
  MapPin,
  Package,
  Plus,
  Store,
  Tag,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet,
  X
} from "lucide-react";
import { publicServices } from "@/lib/data/public-services";

export type ShopDepartment = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  description?: string | null;
  /** Published taxonomy flags. Absent when the legacy flat category list is used. */
  isSelectable?: boolean;
  showOnHomepage?: boolean;
  /**
   * Optional server-reported counts. When every node supplies one the drawer
   * uses them instead of downloading the catalogue; the source is never mixed
   * so a parent and its children cannot be counted twice.
   */
  productCount?: number | null;
  subtreeProductCount?: number | null;
  /** Optional country availability supplied by the taxonomy API. */
  canPublish?: boolean | null;
  restrictionNote?: string | null;
  children?: ShopDepartment[];
};

export type DepartmentStatus = "loading" | "ready" | "error";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

/**
 * Modal panel behaviour shared by the Marketplace ALL and Account & Lists
 * panels: background scroll lock, initial focus, Escape/backdrop close and a
 * focus trap that returns focus to the trigger when the panel closes.
 */
export function useShopPanel({
  open,
  onClose,
  panelRef,
  initialFocusRef,
  returnFocusRef
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement>;
  initialFocusRef: RefObject<HTMLElement>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const trigger =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const focusTimer = window.setTimeout(() => {
      (initialFocusRef.current ?? panelRef.current)?.focus();
    }, 0);

    const focusable = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        if (element.tabIndex < 0) return false;
        return element.offsetWidth > 0 || element.offsetHeight > 0 || element === document.activeElement;
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      const panel = panelRef.current;
      if (!panel) return;
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;

      if (trigger && document.contains(trigger)) {
        window.requestAnimationFrame(() => {
          if (document.contains(trigger)) trigger.focus();
        });
      }
    };
    // The refs are stable; re-running on callback identity would move focus
    // back to the close button on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelRef, initialFocusRef, returnFocusRef]);
}

/**
 * Shared responsive frame: a bottom sheet below lg and a side drawer at lg+.
 * The panel header stays fixed while the body scrolls, so the close button is
 * always reachable.
 */
export function ShopPanelFrame({
  open,
  onClose,
  side,
  panelId,
  labelledBy,
  panelRef,
  initialFocusRef,
  returnFocusRef,
  children
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  panelId: string;
  labelledBy: string;
  panelRef: RefObject<HTMLDivElement>;
  initialFocusRef: RefObject<HTMLButtonElement>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  useShopPanel({ open, onClose, panelRef, initialFocusRef, returnFocusRef });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div
        className="shop-nav-overlay absolute inset-0 bg-[#041f12]/65 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`shop-nav-sheet ${
          side === "left" ? "shop-nav-drawer-left" : "shop-nav-drawer-right"
        } absolute inset-x-0 bottom-0 flex h-[92dvh] flex-col overflow-hidden rounded-t-[26px] bg-white text-[#14241b] shadow-[0_-18px_60px_rgba(4,31,18,0.35)] outline-none lg:inset-y-0 lg:bottom-auto lg:h-full lg:w-[430px] lg:max-w-[92vw] lg:rounded-none ${
          side === "left" ? "lg:left-0 lg:right-auto" : "lg:left-auto lg:right-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Every slug in a department subtree — catalogue counts include subcategories. */
function subtreeSlugs(department: ShopDepartment): string[] {
  const slugs = [department.slug];
  for (const child of department.children ?? []) slugs.push(...subtreeSlugs(child));
  return slugs;
}

function flattenDepartments(departments: ShopDepartment[]): ShopDepartment[] {
  const rows: ShopDepartment[] = [];
  for (const department of departments) {
    rows.push(department);
    rows.push(...flattenDepartments(department.children ?? []));
  }
  return rows;
}

/** A subtree total supplied by the server, or null when the field is absent. */
function serverSubtreeCount(department: ShopDepartment): number | null {
  if (typeof department.subtreeProductCount === "number") return department.subtreeProductCount;
  if (typeof department.productCount !== "number") return null;
  let total = department.productCount;
  for (const child of department.children ?? []) {
    const childCount = serverSubtreeCount(child);
    if (childCount === null) return null;
    total += childCount;
  }
  return total;
}

/**
 * True only when the whole tree reports counts. Mixing server subtree counts
 * with a locally derived catalogue count could count one listing twice, so the
 * drawer commits to a single source for every node.
 */
function hasCompleteServerCounts(departments: ShopDepartment[]): boolean {
  return departments.every((department) => serverSubtreeCount(department) !== null);
}

function subtreeCount(
  department: ShopDepartment,
  counts: Record<string, number>,
  useServerCounts: boolean
): number | null {
  if (useServerCounts) return serverSubtreeCount(department);
  return subtreeSlugs(department).reduce((total, slug) => total + (counts[slug] ?? 0), 0);
}

/** Level vocabulary used by the directory summary and node labels. */
function taxonomyLevels(departments: ShopDepartment[]) {
  let total = 0;
  let categories = 0;
  let subcategories = 0;
  const walk = (nodes: ShopDepartment[], depth: number) => {
    for (const node of nodes) {
      total += 1;
      if (depth === 1) categories += 1;
      else if (depth >= 2) subcategories += 1;
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(departments, 0);
  return { departments: departments.length, categories, subcategories, total };
}

const DISCOVER_LINKS = [  { href: "/naijashop/deals", label: "Price drops", description: "Seller-recorded reductions only", icon: Tag },
  { href: "/naijashop/bestsellers", label: "Bestsellers", description: "Popular listings, ordered by price", icon: TrendingUp },
  { href: "/naijashop/categories", label: "All departments", description: "Browse the full directory", icon: Grid2x2 },
  { href: "/naijashop/sellers", label: "Sell on NaijaDeals", description: "Open a verified seller account", icon: BadgeCheck }
] as const;

const WHOLESALE_LINKS = [
  {
    href: "/naijafresh/business",
    label: "Request a bulk produce quote",
    description: "The farm sets its own quote; nothing is charged until you book.",
    icon: Leaf
  },
  {
    href: "/naijasend/quote",
    label: "Get a freight quote",
    description: "Independent Deliveries & Freight transporters quote larger loads.",
    icon: Truck
  },
  {
    href: "/naijasend/enterprise",
    label: "Enterprise logistics",
    description: "Repeat and scheduled business deliveries.",
    icon: Boxes
  },
  {
    href: "/naijashop/sellers",
    label: "Seller account support",
    description: "How a verified seller account is opened and run.",
    icon: Store
  },
  {
    href: "/sell",
    label: "Open a seller account",
    description: "Apply to publish retail or bulk listings.",
    icon: BadgeDollarSign
  }
] as const;

const EARN_LINKS = [
  { href: "/affiliate", label: "Affiliate programme", description: "Refer customers through your own tracked links.", icon: BadgeDollarSign },
  { href: "/sell", label: "Sell on NaijaDeals", description: "Apply for a seller account and publish listings.", icon: Store },
  { href: "/naijagigs/pro", label: "Offer professional services", description: "Join NaijaGigs as a verified professional.", icon: Users },
  { href: "/naijastay/host", label: "Host on NaijaStay", description: "List a hotel, shortlet or serviced apartment.", icon: Heart },
  { href: "/naijafresh/farmers", label: "Sell farm produce", description: "Join NaijaFresh as a farm or producer.", icon: Leaf }
] as const;

const HELP_LINKS = [
  { href: "/naijashop/help", label: "Marketplace help", description: "Delivery, payments, returns and account help.", icon: CircleHelp },
  { href: "/account", label: "Your account", description: "Profile, password and saved items.", icon: UserRound },
  { href: "/account#addresses", label: "Delivery addresses", description: "Add or change your default address.", icon: MapPin },
  { href: "/orders", label: "Orders & returns", description: "Track orders and raise a return.", icon: Package },
  { href: "/wallet", label: "Wallet & payments", description: "NaijaPay balance, escrow and transactions.", icon: Wallet },
  { href: "/naijashop/plus", label: "Plus membership", description: "Membership benefits and status.", icon: Plus }
] as const;

function RowLink({
  href,
  label,
  description,
  icon: Icon,
  onClick
}: {
  href: string;
  label: string;
  description: string;
  icon: typeof Compass;
  onClick: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="group flex min-h-11 items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-inset"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef4ea] text-[#0b5c33]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-extrabold leading-tight text-[#14241b] group-hover:text-[#0b5c33]">{label}</span>
          <span className="mt-0.5 block text-[10.5px] leading-4 text-[#566359]">{description}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#7a9c80]" aria-hidden />
      </Link>
    </li>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
  action
}: {
  id: string;
  icon: typeof Compass;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 id={id} className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {title}
        </h3>
        {description ? <p className="mt-1 text-[10.5px] leading-4 text-[#566359]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function DepartmentSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading departments" className="mt-2 grid grid-cols-2 gap-1.5">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-[#eef3ec]" aria-hidden />
      ))}
    </div>
  );
}

export function AllDrawer({
  open,
  onClose,
  returnFocusRef,
  departments,
  categoryCounts,
  departmentsStatus,
  countsAvailable,
  signedIn,
  taxonomyAvailable = false,
  directoryNotice = ""
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  departments: ShopDepartment[];
  categoryCounts: Record<string, number>;
  departmentsStatus: DepartmentStatus;
  countsAvailable: boolean;
  signedIn: boolean | null;
  /** True when the tree came from /api/taxonomy (flags are meaningful). */
  taxonomyAvailable?: boolean;
  /** Explains a legacy fallback without pretending the hierarchy is complete. */
  directoryNotice?: string;
}) {
  const [view, setView] = useState<"main" | "departments">("main");
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const departmentsTriggerRef = useRef<HTMLButtonElement>(null);
  const lastView = useRef<"main" | "departments">("main");

  const close = () => {
    setView("main");
    lastView.current = "main";
    setExpandedDepartments(new Set());
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setView("main");
      lastView.current = "main";
      setExpandedDepartments(new Set());
      return;
    }
    if (view === lastView.current) return;
    lastView.current = view;
    if (view === "departments") {
      backButtonRef.current?.focus();
    } else {
      departmentsTriggerRef.current?.focus();
    }
  }, [open, view]);

  // One count source for the whole tree. Server-reported subtree counts win;
  // otherwise the catalogue is counted once and summed over subtree slugs.
  const serverCounts = hasCompleteServerCounts(departments);
  const countsKnown = countsAvailable || serverCounts;
  const countOf = (department: ShopDepartment): number | null =>
    countsKnown ? subtreeCount(department, categoryCounts, serverCounts) : null;

  const countLabel = (department: ShopDepartment) => {
    const count = countOf(department);
    if (count === null) return "Live stock unavailable";
    if (count === 0) return "No demonstration listings yet";
    return `${count} live ${count === 1 ? "listing" : "listings"}`;
  };

  const populatedDepartments = countsKnown
    ? departments.filter((department) => (countOf(department) ?? 0) > 0)
    : [];
  const featuredNodeCount = taxonomyAvailable
    ? flattenDepartments(departments).filter((department) => department.showOnHomepage).length
    : 0;
  const levels = taxonomyLevels(departments);
  const taxonomyNodeCount = levels.total;
  const directorateSummary = !countsKnown
    ? `${levels.departments} departments · ${levels.categories} categories · ${levels.subcategories} subcategories · ${levels.total} published nodes · live counts unavailable`
    : `${levels.departments} departments · ${levels.categories} categories · ${levels.subcategories} subcategories · ${populatedDepartments.length} of ${levels.departments} departments with published demonstration listings · ${
        taxonomyAvailable
          ? `${featuredNodeCount} homepage-featured ${featuredNodeCount === 1 ? "node" : "nodes"}`
          : "homepage selection unavailable"
      }`;

  function toggleDepartment(id: string) {
    setExpandedDepartments((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderDepartment(department: ShopDepartment, depth: number): ReactNode {
    const children = department.children ?? [];
    const isOpen = expandedDepartments.has(department.id);
    const count = countOf(department);
    const empty = count === 0;
    const browseOnly = department.isSelectable === false;
    const notAvailable = department.canPublish === false;
    const listId = `shop-all-dept-${department.id}`;

    return (
      <li key={department.id}>
        <div className={`flex items-stretch gap-1 ${depth > 0 ? "border-l border-[#eef3ec] pl-2" : ""}`}>
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleDepartment(department.id)}
              aria-expanded={isOpen}
              aria-controls={listId}
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${department.name} subcategories`}
              className="grid min-h-12 w-9 shrink-0 place-items-center rounded-lg text-[#4b5b51] transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
            >
              {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
            </button>
          ) : (
            <span className="w-2 shrink-0" aria-hidden />
          )}
          <Link
            href={`/naijashop/c/${department.slug}`}
            onClick={close}
            aria-label={`${department.name}, ${countLabel(department)}`}
            className="group flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 text-[12.5px] font-semibold text-[#14241b] transition hover:text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-inset"
          >
            <span className="min-w-0">
              <span className="block truncate">{department.name}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[9.5px] font-normal text-[#566359]">
                {depth === 0 ? <span className="uppercase tracking-wide">Department</span> : <span>Subcategory</span>}
                {department.showOnHomepage ? (
                  <span className="rounded-full bg-[#e8f2df] px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide text-[#0b5c33]">
                    Homepage
                  </span>
                ) : null}
                {browseOnly ? (
                  <span className="rounded-full bg-[#f4efe4] px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide text-[#7a4c00]">
                    Browse only
                  </span>
                ) : null}
                {notAvailable ? (
                  <span className="rounded-full bg-[#f4efe4] px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide text-[#7a4c00]">
                    Not available in your market
                  </span>
                ) : null}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] font-normal text-[#566359]">
              {count === null ? "Counts unavailable" : count === 0 ? "No demonstration listings yet" : `${count} demo`}
              <ChevronRight className="h-3.5 w-3.5 text-[#7a9c80]" aria-hidden />
            </span>
          </Link>
        </div>
        {empty && countsKnown ? (
          <p className="ml-[2.4rem] pb-2 text-[9.5px] leading-3.5 text-[#7a4c00]">
            {notAvailable
              ? "Not available in your market yet — no demonstration listing can be published here."
              : depth === 0
                ? `Published department — no demonstration listings yet.${
                    populatedDepartments.length > 0
                      ? ` Try ${populatedDepartments
                          .slice(0, 2)
                          .map((candidate) => candidate.name)
                          .join(" or ")}.`
                      : ""
                  }`
                : browseOnly
                  ? "Browse-only node: sellers cannot publish listings directly here."
                  : "Published category — no demonstration listings yet."}
          </p>
        ) : null}
        {children.length > 0 && isOpen ? (
          <ul id={listId} className="space-y-0.5">
            {children.map((child) => renderDepartment(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  }

  const departmentLinks = (
    <ul className="mt-2 divide-y divide-[#eef3ec]">{departments.map((department) => renderDepartment(department, 0))}</ul>
  );

  return (
    <ShopPanelFrame
      open={open}
      onClose={close}
      side="left"
      panelId="shop-all-panel"
      labelledBy="shop-all-title"
      panelRef={panelRef}
      initialFocusRef={closeButtonRef}
      returnFocusRef={returnFocusRef}
    >
      <div className="shrink-0 bg-[#07351f] px-4 pb-3.5 pt-4 text-white">
        <div className="flex items-start gap-2.5">
          {view === "departments" ? (
            <button
              ref={backButtonRef}
              type="button"
              onClick={() => setView("main")}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[11px] font-extrabold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-[#8ed14b]" aria-hidden>
              <Compass className="h-5 w-5" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#8fb89a]">NaijaDeals Marketplace</p>
            <h2 id="shop-all-title" className="mt-0.5 truncate text-[17px] font-extrabold leading-tight">
              {view === "departments" ? "Shop by department" : "All"}
            </h2>
            <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-[#b9d5bd]">
              {view === "departments" ? "The published hierarchy, including categories with no demonstration listings yet." : "Shop, bulk buying and the NaijaDeals ecosystem."}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close All menu"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {view === "main" ? (
          <div className="space-y-6">
            <section aria-labelledby="shop-all-discover">
              <SectionHeading id="shop-all-discover" icon={Compass} title="Discover" />
              <ul className="mt-2 grid grid-cols-2 gap-1.5">
                {DISCOVER_LINKS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={close}
                        className="group flex h-full min-h-[4.5rem] flex-col justify-between rounded-xl border border-[#e1e8de] bg-[#f7faf4] p-3 transition hover:border-[#b9cbb4] hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                      >
                        <Icon className="h-4 w-4 text-[#0b5c33]" aria-hidden />
                        <span>
                          <span className="mt-2 block text-[12px] font-extrabold leading-tight text-[#14241b]">{item.label}</span>
                          <span className="mt-0.5 block text-[9.5px] leading-3.5 text-[#566359]">{item.description}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="shop-all-departments">
              <SectionHeading
                id="shop-all-departments"
                icon={Grid2x2}
                title="Shop by department"
                description={
                  departmentsStatus === "loading"
                    ? "Loading the published department directory…"
                    : departmentsStatus === "error"
                      ? "The department directory could not be refreshed."
                      : directorateSummary
                }
                action={
                  departmentsStatus === "ready" && departments.length > 0 ? (
                    <button
                      ref={departmentsTriggerRef}
                      type="button"
                      onClick={() => setView("departments")}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-extrabold text-[#0b5c33] transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                    >
                      All
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null
                }
              />

              {directoryNotice ? (
                <p className="mt-2 rounded-lg border border-[#eadfc6] bg-[#fbf4e4] px-2.5 py-2 text-[10px] leading-4 text-[#7a4c00]">
                  {directoryNotice}
                </p>
              ) : null}

              {departmentsStatus === "loading" ? <DepartmentSkeleton /> : null}

              {departmentsStatus === "error" ? (
                <div role="alert" className="mt-2 rounded-xl border border-[#eadfc6] bg-[#fbf4e4] p-3 text-[11px] leading-5 text-[#7a4c00]">
                  <p>Only departments found in live listings are shown for now.</p>
                  <Link href="/naijashop/categories" onClick={close} className="mt-1 inline-flex font-extrabold text-[#0b5c33] underline">
                    Open the departments page
                  </Link>
                </div>
              ) : null}

              {departmentsStatus === "ready" && departments.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-[#cfdccb] bg-[#f7faf4] p-3 text-[11px] leading-5 text-[#4b5b51]">
                  No departments are published yet.{" "}
                  <Link href="/naijashop/categories" onClick={close} className="font-extrabold text-[#0b5c33] underline">
                    Check all departments
                  </Link>
                  .
                </div>
              ) : null}

              {departments.length > 0 ? (
                <ul className="mt-2 grid grid-cols-2 gap-1.5">
                  {departments.map((department) => {
                    const live = countOf(department);
                    return (
                      <li key={department.id}>
                        <Link
                          href={`/naijashop/c/${department.slug}`}
                          onClick={close}
                          className="flex h-full min-h-11 flex-col justify-center gap-0.5 rounded-xl bg-[#eef4ea] px-3 py-2 text-[11.5px] font-extrabold text-[#0b5c33] transition hover:bg-[#e2eddc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                        >
                          <span className="flex min-w-0 items-center justify-between gap-1.5">
                            <span className="min-w-0 truncate">{department.name}</span>
                            {department.showOnHomepage ? (
                              <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-[#0b5c33]">
                                Featured
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center justify-between gap-1.5 text-[9.5px] font-semibold text-[#4b5b51]">
                            <span>
                              {live === null
                                ? "Live stock unavailable"
                                : live === 0
                                  ? "No demonstration listings yet"
                                  : `${live} live`}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>

            <section aria-labelledby="shop-all-wholesale">
              <SectionHeading
                id="shop-all-wholesale"
                icon={Boxes}
                title="Wholesale & Producers"
                description="Bulk prices are quoted by the producer; there is no combined wholesale checkout."
              />
              <ul className="mt-1 divide-y divide-[#eef3ec]">
                {WHOLESALE_LINKS.map((item) => (
                  <RowLink key={item.label} {...item} onClick={close} />
                ))}
              </ul>
            </section>

            <section aria-labelledby="shop-all-ecosystem">
              <SectionHeading
                id="shop-all-ecosystem"
                icon={Grid2x2}
                title="Explore NaijaDeals"
                description="One account across the services that exist today."
              />
              <ul className="mt-2 grid grid-cols-2 gap-1.5">
                {publicServices
                  .filter((service) => service.key !== "shop" && service.key !== "earn")
                  .map((service) => {
                    const Icon = service.icon;
                    return (
                      <li key={service.key}>
                        <Link
                          href={service.href}
                          onClick={close}
                          className="group flex min-h-11 items-center gap-2 rounded-xl border border-[#e1e8de] px-2.5 py-2 transition hover:border-[#b9cbb4] hover:bg-[#f7faf4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eef4ea] text-[#0b5c33]">
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-[11.5px] font-extrabold text-[#14241b]">
                              <span className="truncate">{service.label}</span>
                              {service.status !== "live" ? (
                                <span className="shrink-0 rounded-full bg-[#fbf4e4] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-[#7a4c00]">
                                  {service.status === "preview" ? "Preview" : "Setup"}
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-[9px] text-[#566359]">{service.description}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </section>

            <section aria-labelledby="shop-all-earn">
              <SectionHeading
                id="shop-all-earn"
                icon={BadgeDollarSign}
                title="Earn with NaijaDeals"
                description="Programme approval is required; no earnings are implied."
              />
              <ul className="mt-1 divide-y divide-[#eef3ec]">
                {EARN_LINKS.map((item) => (
                  <RowLink key={item.label} {...item} onClick={close} />
                ))}
              </ul>
            </section>

            <section aria-labelledby="shop-all-help">
              <SectionHeading id="shop-all-help" icon={CircleHelp} title="Help & Settings" />
              <ul className="mt-1 divide-y divide-[#eef3ec]">
                {HELP_LINKS.map((item) => (
                  <RowLink key={item.label} {...item} onClick={close} />
                ))}
              </ul>

              <div className="mt-3 rounded-2xl border border-[#e1e8de] bg-[#f7faf4] p-3.5">
                {signedIn === null ? (
                  <p role="status" className="text-[11.5px] font-semibold text-[#566359]">
                    Checking your session…
                  </p>
                ) : signedIn ? (
                  <Link
                    href="/account"
                    onClick={close}
                    className="flex min-h-11 items-center justify-between gap-2 text-[12px] font-extrabold text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                  >
                    Manage your NaijaDeals account
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link
                      href="/login?next=/naijashop"
                      onClick={close}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#07351f] px-4 text-[12px] font-extrabold text-white transition hover:bg-[#0b4a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/register?next=/naijashop"
                      onClick={close}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#b9cbb4] px-4 text-[12px] font-extrabold text-[#0b5c33] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                    >
                      Create account
                    </Link>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-5">
            <nav aria-label="All departments shortcuts">
              <ul className="divide-y divide-[#eef3ec]">
                <RowLink
                  href="/naijashop/categories"
                  label="Open the full departments page"
                  description="Search and filter every live listing."
                  icon={Grid2x2}
                  onClick={close}
                />
                <RowLink
                  href="/naijashop/deals"
                  label="Price drops"
                  description="Only listings with a seller-recorded higher compare-at price."
                  icon={Tag}
                  onClick={close}
                />
                <RowLink
                  href="/naijashop/bestsellers"
                  label="Bestsellers"
                  description="Popular listings ordered by price, not invented sales rank."
                  icon={TrendingUp}
                  onClick={close}
                />
              </ul>
            </nav>

            <section aria-labelledby="shop-all-departments-list">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 id="shop-all-departments-list" className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">
                    Published departments
                  </h3>
                  <p className="mt-1 text-[10.5px] leading-4 text-[#566359]">
                    {directorateSummary}. Counts include subcategories.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#eef4ea] px-2.5 py-1 text-[10px] font-extrabold text-[#0b5c33]">
                  {taxonomyNodeCount}
                </span>
              </div>

              {directoryNotice ? (
                <p className="mt-2 rounded-lg border border-[#eadfc6] bg-[#fbf4e4] px-2.5 py-2 text-[10px] leading-4 text-[#7a4c00]">
                  {directoryNotice}
                </p>
              ) : null}

              {departmentsStatus === "loading" ? <DepartmentSkeleton /> : null}

              {departmentsStatus === "error" ? (
                <div role="alert" className="mt-2 rounded-xl border border-[#eadfc6] bg-[#fbf4e4] p-3 text-[11px] leading-5 text-[#7a4c00]">
                  Departments could not be refreshed.{" "}
                  <Link href="/naijashop/categories" onClick={close} className="font-extrabold underline">
                    Browse the departments page
                  </Link>
                  .
                </div>
              ) : null}

              {departmentsStatus === "ready" && departments.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-[#cfdccb] bg-[#f7faf4] p-3 text-[11px] leading-5 text-[#4b5b51]">
                  No departments are published yet. Live listings will appear here once their department is published.
                </p>
              ) : null}

              {departmentsStatus === "ready" && departments.length > 0 && countsKnown && populatedDepartments.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-[#cfdccb] bg-[#f7faf4] p-3 text-[11px] leading-5 text-[#4b5b51]">
                  <p className="font-extrabold text-[#14241b]">The directory is published; no department has demonstration listings yet.</p>
                  <p className="mt-1">
                    Every category below is a real published node. Until a seller publishes stock you can browse the full
                    departments page, check price drops, or open a seller account.
                  </p>
                  <span className="mt-2 flex flex-wrap gap-2 font-extrabold">
                    <Link href="/naijashop/categories" onClick={close} className="text-[#0b5c33] underline">
                      All departments
                    </Link>
                    <Link href="/naijashop/deals" onClick={close} className="text-[#0b5c33] underline">
                      Price drops
                    </Link>
                    <Link href="/sell" onClick={close} className="text-[#0b5c33] underline">
                      Start selling
                    </Link>
                  </span>
                </div>
              ) : null}

              {departments.length > 0 ? departmentLinks : null}
            </section>

            <Link
              href="/sell"
              onClick={close}
              className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#07351f] px-4 text-[12px] font-extrabold text-white transition hover:bg-[#0b4a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              <Store className="h-4 w-4" aria-hidden />
              Sell on NaijaDeals
            </Link>

            <p className="text-[9.5px] leading-4 text-[#566359]">
              {levels.departments} departments / {levels.categories} categories / {levels.subcategories} subcategories.{" "}
              {countsKnown
                ? serverCounts
                  ? "Counts are server-reported published listings, including subcategories."
                  : "Counts are counted from published listings, including subcategories."
                : "Live listing counts are unavailable right now."}{" "}
              Homepage cards use the taxonomy&apos;s homepage flag, not product count. A published node with no demonstration listings
              stays in the directory and says so instead of disappearing.
            </p>
          </div>
        )}
      </div>
    </ShopPanelFrame>
  );
}

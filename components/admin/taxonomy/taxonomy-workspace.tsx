"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Globe2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert
} from "lucide-react";
import {
  TaxonomyApiError,
  getAdminCategoryRequests,
  getAdminTaxonomy,
  normaliseAttributeType,
  taxonomyErrorMessage,
  type AdminTaxonomyNode,
  type SellerCategoryRequest
} from "@/lib/taxonomy-api";
import {
  TaxonomyNodeEditor,
  attributeRowsFrom,
  emptyNodeDraft,
  type NodeDraft,
  type ParentOption
} from "./taxonomy-node-editor";
import { TaxonomyRequestsPanel } from "./taxonomy-requests-panel";

type FlatAdminNode = { node: AdminTaxonomyNode; level: number; path: string; parentId: string | null };

function flattenAdmin(nodes: AdminTaxonomyNode[], parentPath = "", parentId: string | null = null): FlatAdminNode[] {
  const rows: FlatAdminNode[] = [];
  for (const node of nodes) {
    const path = parentPath ? `${parentPath} / ${node.name}` : node.name;
    rows.push({ node, level: parentPath ? parentPath.split(" / ").length : 0, path, parentId });
    if (node.children && node.children.length > 0) rows.push(...flattenAdmin(node.children, path, node.id));
  }
  return rows;
}

function descendantIds(node: AdminTaxonomyNode): string[] {
  const ids: string[] = [];
  for (const child of node.children ?? []) {
    ids.push(child.id, ...descendantIds(child));
  }
  return ids;
}

function nodeProductCount(node: AdminTaxonomyNode): number | null {
  if (typeof node.productCount === "number") return node.productCount;
  if (typeof node._count?.products === "number") return node._count.products;
  return null;
}

function draftFromNode(node: AdminTaxonomyNode, parentId: string | null): NodeDraft {
  return {
    id: node.id,
    parentId: node.parentId ?? parentId ?? "",
    key: node.key ?? "",
    name: node.name,
    slug: node.slug,
    description: node.description ?? "",
    imageUrl: node.imageUrl ?? "",
    imageAlt: node.imageAlt ?? "",
    isSelectable: node.isSelectable !== false,
    showOnHomepage: node.showOnHomepage === true,
    isActive: node.isActive !== false,
    sortOrder: typeof node.sortOrder === "number" ? String(node.sortOrder) : "",
    deprecatedAt: node.deprecatedAt ?? null,
    productCount: nodeProductCount(node),
    originalParentId: node.parentId ?? parentId ?? "",
    aliases: (node.aliases ?? []).map((alias) => ({ alias: alias.alias, locale: alias.locale ?? "en" })),
    attributes: attributeRowsFrom(
      (node.attributes ?? []).map((attribute) => ({ ...attribute, type: normaliseAttributeType(attribute.type) }))
    ),
    countryRules: (node.countryRules ?? []).map((rule) => ({
      countryCode: rule.countryCode,
      canPublish: rule.canPublish !== false,
      note: rule.note ?? ""
    }))
  };
}

function filterTree(nodes: AdminTaxonomyNode[], query: string): AdminTaxonomyNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const matches = (node: AdminTaxonomyNode) =>
    `${node.name} ${node.slug} ${node.key ?? ""} ${(node.aliases ?? []).map((alias) => alias.alias).join(" ")}`
      .toLowerCase()
      .includes(q);
  const walk = (list: AdminTaxonomyNode[]): AdminTaxonomyNode[] => {
    const kept: AdminTaxonomyNode[] = [];
    for (const node of list) {
      if (matches(node)) {
        kept.push(node);
        continue;
      }
      const children = walk(node.children ?? []);
      if (children.length > 0) kept.push({ ...node, children });
    }
    return kept;
  };
  return walk(nodes);
}

function levelLabel(level: number) {
  return level === 0 ? "Department" : level === 1 ? "Category" : level === 2 ? "Subcategory" : `Level ${level}`;
}

/**
 * Control Center → Catalog → Taxonomy.
 *
 * Browsing, creating, editing, reparenting (with the server's product-count
 * guard), aliases, attributes, country rules, deprecation and the seller
 * request queue. Every mutation is sent to the permission-checked API; nothing
 * is applied locally and no success message is shown before the server
 * confirms it.
 */
export function TaxonomyWorkspace({
  canWrite,
  canRead,
  scopeCountryCode = null,
  scopeCityCode = null,
  roles = []
}: {
  canWrite: boolean;
  canRead: boolean;
  /** Signed-in administrator's country scope; null means platform-wide. */
  scopeCountryCode?: string | null;
  scopeCityCode?: string | null;
  roles?: string[];
}) {
  const [departments, setDepartments] = useState<AdminTaxonomyNode[]>([]);
  const [requests, setRequests] = useState<SellerCategoryRequest[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<NodeDraft | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");

  const [requestFilter, setRequestFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  // Matches the server rule for scoped staff: PATCH requires an existing
  // country rule for the actor's country, and creation must attach one. The
  // GET response only contains countryRules visible to the actor, so presence
  // of this rule is the exact writable signal — not a client-side guess.
  const scopeCountry = scopeCountryCode ? scopeCountryCode.trim().toUpperCase() : null;
  const scopeLabel = scopeCountry
    ? `${scopeCountry}${scopeCityCode ? ` / ${scopeCityCode}` : ""}`
    : "Platform-wide";
  const nodeInScope = useCallback(
    (node: Pick<AdminTaxonomyNode, "countryRules"> | null | undefined) => {
      if (!scopeCountry) return true;
      if (!node) return false;
      return (node.countryRules ?? []).some(
        (rule) => typeof rule.countryCode === "string" && rule.countryCode.toUpperCase() === scopeCountry
      );
    },
    [scopeCountry]
  );

  const load = useCallback(async () => {
    setStatus("loading");
    setLoadError("");
    try {
      const data = await getAdminTaxonomy();
      setDepartments(data.departments);
      setExpanded((current) => {
        if (current.size > 0) return current;
        return new Set(flattenAdmin(data.departments).map((row) => row.node.id));
      });
      setStatus("ready");
      return data;
    } catch (failure) {
      setLoadError(
        taxonomyErrorMessage(failure, {
          technical: true,
          missingEndpoint: "The taxonomy API is not enabled on this build yet."
        })
      );
      setStatus("error");
      return null;
    }
  }, []);

  const loadRequests = useCallback(async (filter: "PENDING" | "ALL") => {
    setRequestsLoading(true);
    setRequestsError("");
    try {
      const rows = await getAdminCategoryRequests(filter);
      setRequests(rows);
    } catch (failure) {
      // The admin tree also carries requests; use them rather than showing a
      // second "unavailable" state when only the dedicated route is missing.
      if (failure instanceof TaxonomyApiError && (failure.status === 404 || failure.status === 405)) {
        const fallback = await load();
        if (fallback) {
          setRequests(
            filter === "ALL" ? fallback.requests : fallback.requests.filter((request) => request.status === "PENDING")
          );
          setRequestsError("");
          setRequestsLoading(false);
          return;
        }
      }
      setRequestsError(taxonomyErrorMessage(failure, { technical: true }));
    } finally {
      setRequestsLoading(false);
    }
  }, [load]);

  useEffect(() => {
    if (!canRead) {
      setStatus("ready");
      return;
    }
    void load().then((data) => {
      if (data) setRequests(data.requests);
    });
  }, [canRead, load]);

  useEffect(() => {
    if (!canRead) return;
    void loadRequests(requestFilter);
    // Only re-run when the operator changes the filter; the initial load above
    // already seeds the embedded request list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestFilter]);

  const flat = useMemo(() => flattenAdmin(departments), [departments]);
  const parentOptions = useMemo<ParentOption[]>(
    () => flat.map((row) => ({ id: row.node.id, name: row.node.name, path: row.path, level: row.level })),
    [flat]
  );

  const stats = useMemo(() => {
    const nodes = flat.map((row) => row.node);
    const knownCounts = flat
      .map((row) => nodeProductCount(row.node))
      .filter((count): count is number => typeof count === "number");
    return {
      total: flat.length,
      active: nodes.filter((node) => node.isActive !== false && !node.deprecatedAt).length,
      selectable: nodes.filter((node) => node.isSelectable !== false).length,
      featured: nodes.filter((node) => node.showOnHomepage === true).length,
      deprecated: nodes.filter((node) => Boolean(node.deprecatedAt)).length,
      inScope: scopeCountry ? nodes.filter((node) => nodeInScope(node)).length : nodes.length,
      productRefs: knownCounts.length === flat.length ? knownCounts.reduce((sum, count) => sum + count, 0) : null
    };
  }, [flat, nodeInScope, scopeCountry]);

  const visibleTree = useMemo(() => filterTree(departments, search), [departments, search]);
  const searching = search.trim().length > 0;

  function beginCreate(parentId = "") {
    setEditorMode("create");
    const draft = emptyNodeDraft(parentId);
    // A scoped administrator can only create a node that carries their own
    // country rule (the API rejects the write otherwise). Seed it so the form
    // reflects the real requirement instead of failing on submit.
    if (scopeCountry) {
      draft.countryRules = [{ countryCode: scopeCountry, canPublish: true, note: "" }];
    }
    setEditing(draft);
    setError("");
    setNotice("");
    setIssues([]);
    window.requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  function beginEdit(node: AdminTaxonomyNode, parentId: string | null) {
    setEditorMode("edit");
    setEditing(draftFromNode(node, parentId));
    setError("");
    setNotice("");
    setIssues([]);
    window.requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  async function send(url: string, method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    setIssues([]);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        code?: unknown;
        details?: { issues?: unknown };
      };
      if (!response.ok) {
        const rawMessage =
          typeof data?.error === "string" ? data.error : `The change was rejected (HTTP ${response.status}).`;
        const fieldIssues = Array.isArray(data?.details?.issues)
          ? (data.details.issues as Array<{ field?: unknown; message?: unknown }>)
              .map((issue) => ({
                field: typeof issue.field === "string" ? issue.field : "",
                message: typeof issue.message === "string" ? issue.message : ""
              }))
              .filter((issue) => issue.message)
          : [];
        const message = taxonomyErrorMessage(rawMessage, { technical: true });
        setError(typeof data?.code === "string" ? `${message} (${data.code})` : message);
        setIssues(fieldIssues);
        return false;
      }
      setNotice(success);
      await load();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request failed before reaching the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!editing) return;
    const parent = editing.parentId;
    const parentLevel = parent ? parentOptions.find((option) => option.id === parent)?.level ?? -1 : -1;
    const attributes = editing.attributes.map((attribute) => ({
      key: attribute.key.trim(),
      label: attribute.label.trim(),
      type: attribute.type,
      required: attribute.required,
      ...(attribute.type === "SELECT"
        ? {
            options: attribute.options
              .split(",")
              .map((option) => option.trim())
              .filter(Boolean)
          }
        : {})
    }));
    const payload: Record<string, unknown> = {
      parentId: parent || null,
      key: editing.key.trim() || null,
      name: editing.name.trim(),
      slug: editing.slug.trim() || undefined,
      description: editing.description.trim() || null,
      imageUrl: editing.imageUrl.trim() || null,
      imageAlt: editing.imageAlt.trim() || null,
      isSelectable: editing.isSelectable,
      showOnHomepage: editing.showOnHomepage,
      isActive: editing.isActive,
      sortOrder: editing.sortOrder ? Number(editing.sortOrder) : 0,
      aliases: editing.aliases
        .map((alias) => ({ alias: alias.alias.trim(), locale: alias.locale.trim() || "en" }))
        .filter((alias) => alias.alias),
      attributes,
      countryRules: editing.countryRules.map((rule) => ({
        countryCode: rule.countryCode,
        canPublish: rule.canPublish,
        note: rule.note.trim() || null
      }))
    };

    if (editorMode === "create") {
      payload.level = parent ? Math.max(parentLevel + 1, 1) : 0;
      const created = await send("/api/admin/taxonomy", "POST", payload, "Taxonomy node created.");
      if (created) setEditing(null);
      return;
    }

    if (parent !== editing.originalParentId && (editing.productCount ?? 0) > 0) {
      payload.confirmProductCount = editing.productCount;
    }
    const saved = await send(
      `/api/admin/taxonomy/${encodeURIComponent(editing.id)}`,
      "PATCH",
      payload,
      "Taxonomy changes saved and audited."
    );
    if (saved) {
      const refreshed = await load();
      const updated = refreshed ? flattenAdmin(refreshed.departments).find((row) => row.node.id === editing.id) : null;
      if (updated) setEditing(draftFromNode(updated.node, updated.parentId));
      else setEditing(null);
    }
  }

  async function deprecate() {
    if (!editing) return;
    const count = editing.productCount;
    const warning =
      count === null
        ? `Deprecate "${editing.name}"? It leaves the public tree; the server decides whether listed products block it.`
        : count === 0
          ? `Deprecate "${editing.name}"? It has no listed products and will leave the public tree.`
          : `Deprecate "${editing.name}"? ${count} listed ${count === 1 ? "product keeps" : "products keep"} this recorded category; customers stop seeing the node in the tree.`;
    if (!window.confirm(`${warning}\n\nTo replace it, publish the replacement category first.`)) return;
    const ok = await send(
      `/api/admin/taxonomy/${encodeURIComponent(editing.id)}`,
      "PATCH",
      { deprecatedAt: new Date().toISOString() },
      "Category deprecated. It is hidden from the public tree; historical listings are unchanged."
    );
    if (ok) {
      const refreshed = await load();
      if (refreshed) {
        const updated = flattenAdmin(refreshed.departments).find((row) => row.node.id === editing.id);
        if (updated) setEditing(draftFromNode(updated.node, updated.parentId));
      }
    }
  }

  async function restore() {
    if (!editing) return;
    const ok = await send(
      `/api/admin/taxonomy/${encodeURIComponent(editing.id)}`,
      "PATCH",
      { deprecatedAt: null },
      "Category restored to the public tree."
    );
    if (ok) {
      const refreshed = await load();
      if (refreshed) {
        const updated = flattenAdmin(refreshed.departments).find((row) => row.node.id === editing.id);
        if (updated) setEditing(draftFromNode(updated.node, updated.parentId));
      }
    }
  }

  async function resolveRequest(
    id: string,
    input: {
      action: "APPROVED" | "REJECTED";
      categoryId?: string | null;
      note?: string | null;
      createCategory?: { name: string; parentId?: string | null } | null;
    }
  ) {
    const ok = await send(
      `/api/admin/taxonomy/requests/${encodeURIComponent(id)}/resolve`,
      "POST",
      input,
      input.action === "APPROVED" ? "Request approved and the seller sees the resolution." : "Request rejected with the seller note."
    );
    if (ok) await loadRequests(requestFilter);
    return ok;
  }

  const editorNode = editing && editorMode === "edit" ? flat.find((row) => row.node.id === editing.id)?.node ?? null : null;
  const editorScopeLocked = Boolean(
    editorNode && !nodeInScope(editorNode)
  );
  const editorReadOnlyReason = editorScopeLocked
    ? `This node has no ${scopeCountry} country rule, so your ${scopeLabel} scope cannot edit, deprecate or restore it. You can still inspect its published fields.`
    : !canWrite
      ? "Your role lacks `products:moderate`. The hierarchy and seller requests stay readable; create, edit, deprecate and resolve controls are disabled."
      : null;

  if (!canRead) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#21262D] bg-[#0B0E14] p-6 text-[#F0F6FC]">
        <h1 className="text-xl font-extrabold">Taxonomy access restricted</h1>
        <p className="mt-2 text-sm text-[#8B949E]">
          Your role does not include `products:read`, which the taxonomy browser requires.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-[#F0F6FC]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#00E676]">Catalog</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Taxonomy</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#8B949E]">
            One published hierarchy for the Marketplace. Customers see active, non-deprecated nodes; sellers list only in
            selectable nodes their country allows. Every change is permission-checked, region-scoped and audited.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => beginCreate("")}
            title={
              !canWrite
                ? "products:moderate is required to create taxonomy nodes."
                : scopeCountry
                  ? `The new node will carry a ${scopeCountry} country rule, which your scope requires.`
                  : undefined
            }
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#00E676] px-4 text-sm font-extrabold text-[#04140B] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden /> New node
          </button>
          {canWrite && scopeCountry ? (
            <span className="max-w-64 text-right text-[10px] leading-4 text-[#8B949E]">
              New nodes must include a {scopeCountry} country rule.
            </span>
          ) : null}
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-[#F85149]/50 bg-[#F85149]/10 p-3 text-sm text-[#FFB4AE]">
          <p className="font-bold">{error}</p>
          {issues.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>
                  {issue.field ? `${issue.field}: ` : ""}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-xl border border-[#00E676]/40 bg-[#00E676]/10 p-3 text-sm text-[#B7FFD4]">
          {notice}
        </div>
      ) : null}
      <div
        className={`rounded-xl border p-3 text-xs leading-5 ${
          scopeCountry
            ? "border-[#58A6FF]/40 bg-[#58A6FF]/10 text-[#C9E3FF]"
            : "border-[#30363D] bg-[#161B22] text-[#C9D1D9]"
        }`}
      >
        <p className="flex flex-wrap items-center gap-2 font-extrabold">
          {scopeCountry ? <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden /> : <Globe2 className="h-4 w-4 shrink-0" aria-hidden />}
          Regional scope: {scopeLabel}
          {roles.length > 0 ? (
            <span className="font-semibold opacity-80">Roles: {roles.join(", ")}</span>
          ) : null}
        </p>
        {scopeCountry ? (
          <p className="mt-1">
            You can create nodes that carry a {scopeCountry} country rule and edit, deprecate or restore nodes that already
            have one. {stats.total - stats.inScope} of {stats.total} nodes are outside your scope and stay read-only; the
            seller request queue is limited to your region. The server re-checks scope on every write and answers 403 when a
            control is used outside it, so these labels are guidance rather than the security boundary.
          </p>
        ) : (
          <p className="mt-1">
            Platform-wide scope: every taxonomy node is within scope, including country rules for any market. Editing still
            requires `products:moderate` on every write; this session {canWrite ? "has it" : "does not have it"}.
          </p>
        )}
      </div>

      {!canWrite ? (
        <div className="rounded-xl border border-[#F2D48C]/40 bg-[#F2D48C]/10 p-3 text-sm text-[#F2D48C]">
          Read-only: your role lacks `products:moderate`. Browsing and request review stay available; create, edit and
          deprecate controls are hidden or disabled.
        </div>
      ) : null}

      <section aria-labelledby="taxonomy-tree-heading" className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="taxonomy-tree-heading" className="text-lg font-extrabold">
              Published hierarchy
            </h2>
            <p className="mt-1 text-xs text-[#8B949E]">
              {stats.total} nodes · {stats.active} public · {stats.selectable} listable · {stats.featured} on the homepage ·{" "}
              {stats.deprecated} deprecated
              {scopeCountry ? ` · ${stats.inScope} writable in ${scopeCountry} scope` : ""}
              {stats.productRefs !== null ? ` · ${stats.productRefs} listed product references` : " · product counts not reported"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block">
              <span className="sr-only">Search the taxonomy</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8B949E]" aria-hidden />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value.slice(0, 80))}
                type="search"
                placeholder="Name, key or alias"
                className="min-h-9 w-52 rounded-lg border border-[#30363D] bg-[#161B22] pl-8 pr-2 text-xs text-[#F0F6FC]"
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#30363D] px-2.5 text-xs font-bold text-[#8B949E]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
            </button>
          </div>
        </div>

        {status === "loading" ? (
          <p role="status" className="mt-3 flex items-center gap-2 text-sm text-[#8B949E]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading the taxonomy…
          </p>
        ) : null}

        {status === "error" ? (
          <div role="alert" className="mt-3 rounded-xl border border-[#F85149]/50 bg-[#F85149]/10 p-3 text-sm text-[#FFB4AE]">
            {loadError}
            <button
              type="button"
              onClick={() => void load()}
              className="ml-2 min-h-9 rounded-lg border border-[#F85149]/50 px-2 text-xs font-bold"
            >
              Try again
            </button>
          </div>
        ) : null}

        {status === "ready" && departments.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-[#30363D] p-4 text-sm text-[#8B949E]">
            No taxonomy nodes exist yet. Create the first department to start the hierarchy.
          </div>
        ) : null}

        {status === "ready" && departments.length > 0 && visibleTree.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[#30363D] p-3 text-sm text-[#8B949E]">
            No node matches “{search.trim()}”. Clear the search to see the full hierarchy.
          </p>
        ) : null}

        {visibleTree.length > 0 ? (
          <ul className="mt-3 space-y-0.5">
            {visibleTree.map((node) => (
              <TreeBranch
                key={node.id}
                node={node}
                level={0}
                path=""
                parentId={null}
                expanded={expanded}
                forceOpen={searching}
                onToggle={(id) =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onEdit={beginEdit}
                onCreateChild={canWrite ? (parentId: string) => beginCreate(parentId) : undefined}
                canWrite={canWrite}
                scopeCountry={scopeCountry}
              />
            ))}
          </ul>
        ) : null}

        <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-[#8B949E]">
          <FolderTree className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Empty selectable categories stay in the tree so customers see an honest empty state; they are never hidden by
          product count.
        </p>
      </section>

      <div ref={editorRef}>
        {editing ? (
          <TaxonomyNodeEditor
            draft={editing}
            onChange={setEditing}
            parentOptions={parentOptions}
            blockedParentIds={
              new Set(
                editorMode === "edit" && editing.id
                  ? [
                      editing.id,
                      ...descendantIds(
                        flat.find((row) => row.node.id === editing.id)?.node ?? { id: editing.id, name: "", slug: "", children: [] }
                      )
                    ]
                  : []
              )
            }
            mode={editorMode}
            disabled={!canWrite || editorScopeLocked}
            readOnlyReason={editorReadOnlyReason}
            scopeCountryCode={scopeCountry}
            busy={busy}
            onSave={() => void saveDraft()}
            onCancel={() => setEditing(null)}
            onDeprecate={() => void deprecate()}
            onRestore={() => void restore()}
          />
        ) : null}
      </div>

      <TaxonomyRequestsPanel
        requests={requests}
        filter={requestFilter}
        onFilterChange={setRequestFilter}
        nodes={parentOptions.map((option) => ({ id: option.id, name: option.name, path: option.path }))}
        canWrite={canWrite}
        scopeCountryCode={scopeCountry}
        busy={busy}
        loading={requestsLoading}
        error={requestsError}
        onRetry={() => void loadRequests(requestFilter)}
        onResolve={resolveRequest}
      />

      {status === "ready" && stats.deprecated > 0 ? (
        <p className="flex items-start gap-1.5 rounded-xl border border-[#F2D48C]/30 bg-[#F2D48C]/10 p-3 text-[11px] leading-4 text-[#F2D48C]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Deprecated nodes are excluded from the public and seller trees. Listings keep their recorded category; publish a
          replacement node before deprecating a node customers still depend on.
        </p>
      ) : null}
    </div>
  );
}

function TreeBranch({
  node,
  level,
  path,
  parentId,
  expanded,
  forceOpen,
  onToggle,
  onEdit,
  onCreateChild,
  canWrite,
  scopeCountry
}: {
  node: AdminTaxonomyNode;
  level: number;
  path: string;
  parentId: string | null;
  expanded: Set<string>;
  forceOpen: boolean;
  onToggle: (id: string) => void;
  onEdit: (node: AdminTaxonomyNode, parentId: string | null) => void;
  onCreateChild?: (parentId: string) => void;
  canWrite: boolean;
  scopeCountry: string | null;
}) {
  const children = node.children ?? [];
  const isOpen = forceOpen || expanded.has(node.id);
  const fullPath = path ? `${path} / ${node.name}` : node.name;
  const productCount = nodeProductCount(node);
  const deprecated = Boolean(node.deprecatedAt);
  const inactive = node.isActive === false;
  const withinScope =
    !scopeCountry ||
    (node.countryRules ?? []).some(
      (rule) => typeof rule.countryCode === "string" && rule.countryCode.toUpperCase() === scopeCountry
    );

  return (
    <li>
      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-1 hover:bg-[#161B22] ${
          deprecated ? "opacity-70" : ""
        }`}
        style={{ paddingLeft: `${6 + Math.min(level, 4) * 16}px` }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-[#8B949E] hover:text-[#F0F6FC]"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          onClick={() => onEdit(node, parentId)}
          title={withinScope ? "Open the editor" : `Read-only: no ${scopeCountry} country rule`}
          className="min-h-8 truncate rounded px-1 text-left text-[13px] font-bold text-[#F0F6FC] underline decoration-transparent hover:bg-[#21262D] hover:decoration-[#58A6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58A6FF]"
        >
          {node.name}
          {!withinScope ? <span className="sr-only"> (outside your administrative scope; opens read-only)</span> : null}
        </button>

        <span className="text-[10px] text-[#8B949E]">{levelLabel(level)}</span>
        <span className="text-[10px] text-[#6E7681]">/{node.slug}</span>
        {node.key ? <span className="text-[10px] text-[#6E7681]">key: {node.key}</span> : null}
        <span className="text-[10px] text-[#8B949E]">
          {productCount === null ? "products unknown" : `${productCount} listed`}
        </span>

        {node.isSelectable === false ? (
          <span className="rounded bg-[#F2D48C]/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#F2D48C]">
            Not listable
          </span>
        ) : null}
        {node.showOnHomepage ? (
          <span className="rounded bg-[#00E676]/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#00E676]">
            Homepage
          </span>
        ) : null}
        {!withinScope ? (
          <span
            className="inline-flex items-center gap-1 rounded bg-[#58A6FF]/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#9ECBFF]"
            title={`This node has no ${scopeCountry} country rule, so your scope cannot edit or deprecate it.`}
          >
            <Lock className="h-2.5 w-2.5" aria-hidden />
            Outside {scopeCountry} scope
          </span>
        ) : null}
        {inactive ? (
          <span className="rounded bg-[#8B949E]/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#C9D1D9]">
            Inactive
          </span>
        ) : null}
        {deprecated ? (
          <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#FFB4AE]">
            Deprecated
          </span>
        ) : null}

        <span className="ml-auto flex items-center gap-2">
          {!deprecated && node.isActive !== false ? (
            <a
              href={`/naijashop/c/${node.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-bold text-[#58A6FF] underline"
            >
              Public page
            </a>
          ) : null}
          {canWrite && withinScope && onCreateChild ? (
            <button
              type="button"
              onClick={() => onCreateChild(node.id)}
              className="text-[10px] font-bold text-[#00E676] underline"
            >
              Add child
            </button>
          ) : null}
        </span>
      </div>

      {children.length > 0 && isOpen ? (
        <ul className="space-y-0.5">
          {children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              level={level + 1}
              path={fullPath}
              parentId={node.id}
              expanded={expanded}
              forceOpen={forceOpen}
              onToggle={onToggle}
              onEdit={onEdit}
              onCreateChild={onCreateChild}
              canWrite={canWrite}
              scopeCountry={scopeCountry}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

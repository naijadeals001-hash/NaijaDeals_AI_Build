"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Image as ImageIcon, Lock, Plus, Save, ShieldAlert, Trash2, Undo2, X } from "lucide-react";
import { COUNTRIES } from "@/lib/config/commerce";
import { normaliseAttributeType, type TaxonomyAttributeType } from "@/lib/taxonomy-api";

export type AliasRow = { alias: string; locale: string };
export type AttributeRow = { key: string; label: string; type: TaxonomyAttributeType; required: boolean; options: string };
export type CountryRuleRow = { countryCode: string; canPublish: boolean; note: string };

export type NodeDraft = {
  id: string;
  parentId: string;
  key: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  isSelectable: boolean;
  showOnHomepage: boolean;
  isActive: boolean;
  sortOrder: string;
  deprecatedAt: string | null;
  productCount: number | null;
  originalParentId: string;
  aliases: AliasRow[];
  attributes: AttributeRow[];
  countryRules: CountryRuleRow[];
};

export type ParentOption = { id: string; name: string; path: string; level: number };

export function emptyNodeDraft(parentId = ""): NodeDraft {
  return {
    id: "",
    parentId,
    key: "",
    name: "",
    slug: "",
    description: "",
    imageUrl: "",
    imageAlt: "",
    isSelectable: true,
    showOnHomepage: false,
    isActive: true,
    sortOrder: "",
    deprecatedAt: null,
    productCount: null,
    originalParentId: parentId,
    aliases: [],
    attributes: [],
    countryRules: []
  };
}

const ATTRIBUTE_TYPES: TaxonomyAttributeType[] = ["TEXT", "NUMBER", "SELECT", "BOOLEAN"];

const inputClass =
  "mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm text-[#F0F6FC] disabled:opacity-60";
const smallInputClass =
  "min-h-9 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-2 text-xs text-[#F0F6FC] disabled:opacity-60";
const labelClass = "text-[11px] font-bold text-[#8B949E]";
const sectionClass = "rounded-xl border border-[#21262D] bg-[#0D1117] p-3";

/**
 * Create/edit form for one taxonomy node: identity, placement, availability,
 * aliases, attributes and country rules. The save payload is assembled by the
 * workspace, which owns the API call and the audited success state.
 */
export function TaxonomyNodeEditor({
  draft,
  onChange,
  parentOptions,
  blockedParentIds,
  mode,
  disabled,
  readOnlyReason = null,
  scopeCountryCode = null,
  busy,
  onSave,
  onCancel,
  onDeprecate,
  onRestore
}: {
  draft: NodeDraft;
  onChange: (draft: NodeDraft) => void;
  parentOptions: ParentOption[];
  blockedParentIds: Set<string>;
  mode: "create" | "edit";
  /** True when the caller lacks the permission or the node is outside its scope. */
  disabled: boolean;
  /** Why the form is read-only, shown verbatim to the operator. */
  readOnlyReason?: string | null;
  /** Signed-in administrator's country scope; null means platform-wide. */
  scopeCountryCode?: string | null;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDeprecate: () => void;
  onRestore: () => void;
}) {
  const [problems, setProblems] = useState<string[]>([]);
  const [moveConfirmed, setMoveConfirmed] = useState(false);
  const scopedCountry = scopeCountryCode ? scopeCountryCode.trim().toUpperCase() : null;

  const parentChanged = mode === "edit" && draft.parentId !== draft.originalParentId;
  const needsMoveConfirmation = parentChanged && (draft.productCount ?? 0) > 0;

  useEffect(() => {
    setMoveConfirmed(false);
  }, [draft.id, draft.parentId]);

  const parentLevel = useMemo(() => {
    if (!draft.parentId) return -1;
    return parentOptions.find((option) => option.id === draft.parentId)?.level ?? -1;
  }, [draft.parentId, parentOptions]);

  function update(patch: Partial<NodeDraft>) {
    onChange({ ...draft, ...patch });
  }

  function updateAlias(index: number, patch: Partial<AliasRow>) {
    update({ aliases: draft.aliases.map((row, position) => (position === index ? { ...row, ...patch } : row)) });
  }

  function updateAttribute(index: number, patch: Partial<AttributeRow>) {
    update({ attributes: draft.attributes.map((row, position) => (position === index ? { ...row, ...patch } : row)) });
  }

  function updateRule(index: number, patch: Partial<CountryRuleRow>) {
    update({ countryRules: draft.countryRules.map((row, position) => (position === index ? { ...row, ...patch } : row)) });
  }

  function validate(): boolean {
    const found: string[] = [];
    if (!draft.name.trim()) found.push("Name is required.");
    if (draft.name.trim().length > 80) found.push("Name must be 80 characters or fewer.");
    if (draft.sortOrder !== "" && (!/^\d+$/.test(draft.sortOrder) || Number(draft.sortOrder) > 100000)) {
      found.push("Sort order must be a whole number between 0 and 100000.");
    }
    if (draft.parentId && blockedParentIds.has(draft.parentId)) {
      found.push("A category cannot be moved under itself or one of its own children.");
    }
    const aliasKeys = new Set<string>();
    for (const alias of draft.aliases) {
      const value = alias.alias.trim().toLowerCase();
      if (!value) {
        found.push("Remove empty alias rows or give each alias a value.");
        continue;
      }
      if (aliasKeys.has(value)) found.push(`Duplicate alias "${alias.alias.trim()}".`);
      aliasKeys.add(value);
    }
    const attributeKeys = new Set<string>();
    for (const attribute of draft.attributes) {
      const key = attribute.key.trim();
      const label = attribute.label.trim();
      if (!key || !label) {
        found.push("Every attribute needs a key and a label.");
        continue;
      }
      if (!/^[a-z0-9_]+$/i.test(key)) found.push(`Attribute key "${key}" may only use letters, digits and underscores.`);
      if (attributeKeys.has(key)) found.push(`Duplicate attribute key "${key}".`);
      attributeKeys.add(key);
      if (attribute.type === "SELECT" && !attribute.options.trim()) {
        found.push(`Select attribute "${label}" needs at least one option.`);
      }
    }
    const ruleCodes = new Set<string>();
    for (const rule of draft.countryRules) {
      if (!rule.countryCode) {
        found.push("Every country rule needs a country.");
        continue;
      }
      if (ruleCodes.has(rule.countryCode)) found.push(`Duplicate country rule for ${rule.countryCode}.`);
      ruleCodes.add(rule.countryCode);
    }
    if (scopedCountry) {
      if (!draft.countryRules.some((rule) => rule.countryCode.toUpperCase() === scopedCountry)) {
        found.push(`Your ${scopedCountry} administrative scope requires a ${scopedCountry} country rule on this node.`);
      }
      const outside = draft.countryRules.find((rule) => rule.countryCode && rule.countryCode.toUpperCase() !== scopedCountry);
      if (outside) {
        found.push(`Your scope cannot configure ${outside.countryCode} rules; remove that rule.`);
      }
    }
    if (needsMoveConfirmation && !moveConfirmed) {
      found.push(
        `This category is referenced by ${draft.productCount} listed ${
          draft.productCount === 1 ? "product" : "products"
        }. Confirm the move before saving.`
      );
    }
    setProblems(found);
    return found.length === 0;
  }

  return (
    <section aria-labelledby="taxonomy-editor-heading" className={`${sectionClass} mt-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="taxonomy-editor-heading" className="text-base font-extrabold text-[#F0F6FC]">
            {mode === "create" ? "New taxonomy node" : `${disabled ? "Inspect" : "Edit"} ${draft.name || "node"}`}
          </h2>
          <p className="mt-1 text-xs text-[#8B949E]">
            Level is derived from the parent. Unpublishing or deprecating a node keeps its recorded listings; it only leaves
            the public tree.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#30363D] px-3 text-xs font-bold text-[#8B949E]">
          <X className="h-3.5 w-3.5" aria-hidden /> Close
        </button>
      </div>

      {disabled ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#F2D48C]/40 bg-[#F2D48C]/10 p-3 text-xs leading-5 text-[#F2D48C]">
          {scopedCountry ? <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span>
            <span className="block font-extrabold">Read-only</span>
            {readOnlyReason ??
              "This form is read-only in the current session. The server still enforces the permission and scope on every write."}
          </span>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          Name
          <input
            value={draft.name}
            disabled={disabled}
            maxLength={80}
            onChange={(event) => update({ name: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Slug (lowercase hyphens; blank derives from the name)
          <input
            value={draft.slug}
            disabled={disabled}
            maxLength={80}
            onChange={(event) => update({ slug: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Key (stable integration identifier, optional)
          <input
            value={draft.key}
            disabled={disabled}
            maxLength={80}
            onChange={(event) => update({ key: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Parent
          <select
            value={draft.parentId}
            disabled={disabled}
            onChange={(event) => update({ parentId: event.target.value })}
            className={inputClass}
          >
            <option value="">None — top-level department</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id} disabled={blockedParentIds.has(option.id)}>
                {option.path}
                {blockedParentIds.has(option.id) ? " (not allowed)" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[10px] font-normal text-[#8B949E]">
            Resulting level: {draft.parentId ? Math.max(parentLevel + 1, 1) : 0}
          </span>
        </label>
        <label className={labelClass}>
          Sort order (lower appears first)
          <input
            value={draft.sortOrder}
            disabled={disabled}
            inputMode="numeric"
            placeholder="0"
            onChange={(event) => update({ sortOrder: event.target.value.replace(/[^0-9]/g, "").slice(0, 6) })}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Image (project path or https URL)
          <input
            value={draft.imageUrl}
            disabled={disabled}
            maxLength={500}
            onChange={(event) => update({ imageUrl: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Image alt text
          <input
            value={draft.imageAlt}
            disabled={disabled}
            maxLength={200}
            onChange={(event) => update({ imageAlt: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Description (shown to sellers as inclusion context)
          <textarea
            value={draft.description}
            disabled={disabled}
            rows={2}
            maxLength={2000}
            onChange={(event) => update({ description: event.target.value })}
            className={`${inputClass} py-2`}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-[11px] font-bold text-[#F0F6FC]">
          <input
            type="checkbox"
            checked={draft.isSelectable}
            disabled={disabled}
            onChange={(event) => update({ isSelectable: event.target.checked })}
          />
          Selectable (sellers may list directly here)
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-[#F0F6FC]">
          <input
            type="checkbox"
            checked={draft.showOnHomepage}
            disabled={disabled}
            onChange={(event) => update({ showOnHomepage: event.target.checked })}
          />
          Show on homepage
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-[#F0F6FC]">
          <input
            type="checkbox"
            checked={draft.isActive}
            disabled={disabled}
            onChange={(event) => update({ isActive: event.target.checked })}
          />
          Active in the public tree
        </label>
      </div>

      {draft.imageUrl ? (
        <div className="mt-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draft.imageUrl} alt={draft.imageAlt || "Category image preview"} className="h-14 w-20 rounded-lg object-cover" />
          <span className="text-[10px] text-[#8B949E]">
            <ImageIcon className="mr-1 inline h-3 w-3" aria-hidden />
            The image must load for the node above the public tree.
          </span>
        </div>
      ) : null}

      {needsMoveConfirmation ? (
        <div className="mt-3 rounded-lg border border-[#F2D48C]/40 bg-[#F2D48C]/10 p-3 text-xs text-[#F2D48C]">
          <p className="flex items-start gap-2 font-bold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Moving this category changes where its {draft.productCount} listed{" "}
            {draft.productCount === 1 ? "product appears" : "products appear"}.
          </p>
          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={moveConfirmed}
              disabled={disabled}
              onChange={(event) => setMoveConfirmed(event.target.checked)}
            />
            I understand {draft.productCount} listed {draft.productCount === 1 ? "product references" : "products reference"} this category.
          </label>
        </div>
      ) : null}

      <fieldset className={`${sectionClass} mt-3`}>
        <legend className="px-1 text-[11px] font-extrabold uppercase tracking-wide text-[#8B949E]">
          Aliases ({draft.aliases.length})
        </legend>
        <p className="text-[10px] text-[#8B949E]">Seller search matches aliases in addition to the published name and key.</p>
        {draft.aliases.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {draft.aliases.map((alias, index) => (
              <div key={index} className="grid gap-1.5 sm:grid-cols-[1fr_120px_auto]">
                <input
                  aria-label={`Alias ${index + 1}`}
                  value={alias.alias}
                  disabled={disabled}
                  onChange={(event) => updateAlias(index, { alias: event.target.value.slice(0, 80) })}
                  className={smallInputClass}
                />
                <input
                  aria-label={`Alias ${index + 1} locale`}
                  value={alias.locale}
                  disabled={disabled}
                  onChange={(event) => updateAlias(index, { locale: event.target.value.slice(0, 10) })}
                  className={smallInputClass}
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => update({ aliases: draft.aliases.filter((_, position) => position !== index) })}
                  className="min-h-9 rounded-lg border border-[#30363D] px-2 text-xs font-bold text-[#FFB4AE] disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-[#8B949E]">No aliases yet.</p>
        )}
        <button
          type="button"
          disabled={disabled || draft.aliases.length >= 20}
          onClick={() => update({ aliases: [...draft.aliases, { alias: "", locale: "en" }] })}
          className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#30363D] px-2.5 text-xs font-bold text-[#58A6FF] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add alias
        </button>
      </fieldset>

      <fieldset className={`${sectionClass} mt-3`}>
        <legend className="px-1 text-[11px] font-extrabold uppercase tracking-wide text-[#8B949E]">
          Attributes ({draft.attributes.length})
        </legend>
        <p className="text-[10px] text-[#8B949E]">
          Sellers must complete required attributes. Server validation uses these rows; select options are comma-separated.
        </p>
        {draft.attributes.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {draft.attributes.map((attribute, index) => (
              <li key={index} className="rounded-lg border border-[#21262D] p-2">
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_130px_auto]">
                  <label className="text-[10px] font-bold text-[#8B949E]">
                    Key
                    <input
                      value={attribute.key}
                      disabled={disabled}
                      onChange={(event) => updateAttribute(index, { key: event.target.value.slice(0, 40) })}
                      className={smallInputClass}
                    />
                  </label>
                  <label className="text-[10px] font-bold text-[#8B949E]">
                    Label
                    <input
                      value={attribute.label}
                      disabled={disabled}
                      onChange={(event) => updateAttribute(index, { label: event.target.value.slice(0, 80) })}
                      className={smallInputClass}
                    />
                  </label>
                  <label className="text-[10px] font-bold text-[#8B949E]">
                    Type
                    <select
                      value={attribute.type}
                      disabled={disabled}
                      onChange={(event) => updateAttribute(index, { type: normaliseAttributeType(event.target.value) })}
                      className={smallInputClass}
                    >
                      {ATTRIBUTE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-[10px] font-bold text-[#F0F6FC]">
                    <input
                      type="checkbox"
                      checked={attribute.required}
                      disabled={disabled}
                      onChange={(event) => updateAttribute(index, { required: event.target.checked })}
                    />
                    Required
                  </label>
                </div>
                {attribute.type === "SELECT" ? (
                  <label className="mt-1.5 block text-[10px] font-bold text-[#8B949E]">
                    Options (comma separated)
                    <input
                      value={attribute.options}
                      disabled={disabled}
                      onChange={(event) => updateAttribute(index, { options: event.target.value })}
                      className={smallInputClass}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => update({ attributes: draft.attributes.filter((_, position) => position !== index) })}
                  className="mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#30363D] px-2 text-[11px] font-bold text-[#FFB4AE] disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" aria-hidden /> Remove attribute
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[#8B949E]">No attributes: sellers may list with price, image and description only.</p>
        )}
        <button
          type="button"
          disabled={disabled || draft.attributes.length >= 20}
          onClick={() =>
            update({
              attributes: [...draft.attributes, { key: "", label: "", type: "TEXT", required: false, options: "" }]
            })
          }
          className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#30363D] px-2.5 text-xs font-bold text-[#58A6FF] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add attribute
        </button>
      </fieldset>

      <fieldset className={`${sectionClass} mt-3`}>
        <legend className="px-1 text-[11px] font-extrabold uppercase tracking-wide text-[#8B949E]">
          Country restrictions ({draft.countryRules.length})
        </legend>
        <p className="text-[10px] text-[#8B949E]">
          {scopedCountry
            ? `Your administrative scope is ${scopedCountry}. A ${scopedCountry} country rule is required on every node your scope saves, and you cannot configure other countries.`
            : "With no rule a category is publishable everywhere; a rule decides whether sellers in that market can use it."}
        </p>
        {draft.countryRules.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {draft.countryRules.map((rule, index) => {
              const mutableRule = !disabled && (!scopedCountry || rule.countryCode.toUpperCase() !== scopedCountry);
              return (
                <div key={index} className="grid gap-1.5 sm:grid-cols-[150px_auto_1fr_auto]">
                  <select
                    aria-label={`Country rule ${index + 1} country`}
                    value={rule.countryCode}
                    disabled={disabled || Boolean(scopedCountry)}
                    onChange={(event) => updateRule(index, { countryCode: event.target.value })}
                    className={smallInputClass}
                  >
                    <option value="">Choose country…</option>
                    {Object.values(COUNTRIES)
                      .filter((country) => !scopedCountry || country.code.toUpperCase() === scopedCountry)
                      .map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name} ({country.code})
                        </option>
                      ))}
                  </select>
                  <label className="flex items-center gap-2 text-[10px] font-bold text-[#F0F6FC]">
                    <input
                      type="checkbox"
                      checked={rule.canPublish}
                      disabled={disabled}
                      onChange={(event) => updateRule(index, { canPublish: event.target.checked })}
                    />
                    Can publish
                  </label>
                  <input
                    aria-label={`Country rule ${index + 1} note`}
                    value={rule.note}
                    disabled={disabled}
                    placeholder="Reason shown to sellers"
                    onChange={(event) => updateRule(index, { note: event.target.value.slice(0, 200) })}
                    className={smallInputClass}
                  />
                  <button
                    type="button"
                    disabled={!mutableRule}
                    title={
                      scopedCountry && !mutableRule
                        ? `A ${scopedCountry} rule is required by your administrative scope and cannot be removed.`
                        : undefined
                    }
                    onClick={() => update({ countryRules: draft.countryRules.filter((_, position) => position !== index) })}
                    className="min-h-9 rounded-lg border border-[#30363D] px-2 text-xs font-bold text-[#FFB4AE] disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-[#8B949E]">
            {scopedCountry ? `No country rule yet. A ${scopedCountry} rule is required before saving.` : "No country restrictions."}
          </p>
        )}
        <button
          type="button"
          disabled={
            disabled ||
            draft.countryRules.length >= 12 ||
            (Boolean(scopedCountry) && draft.countryRules.some((rule) => rule.countryCode.toUpperCase() === scopedCountry))
          }
          onClick={() =>
            update({
              countryRules: [
                ...draft.countryRules,
                { countryCode: scopedCountry ?? "", canPublish: true, note: "" }
              ]
            })
          }
          className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#30363D] px-2.5 text-xs font-bold text-[#58A6FF] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add {scopedCountry ?? "country"} rule
        </button>
      </fieldset>

      {problems.length > 0 ? (
        <div role="alert" className="mt-3 rounded-lg border border-[#F85149]/50 bg-[#F85149]/10 p-2 text-xs text-[#FFB4AE]">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!disabled ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (validate()) onSave();
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#00E676] px-4 text-sm font-extrabold text-[#04140B] disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? "Saving…" : mode === "create" ? "Create node" : "Save changes"}
          </button>
        ) : null}
        <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-[#30363D] px-4 text-sm font-bold">
          {disabled ? "Close" : "Cancel"}
        </button>
        {!disabled && mode === "edit" ? (
          draft.deprecatedAt ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRestore}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#00E676]/50 px-3 text-xs font-bold text-[#00E676] disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden /> Restore to the tree
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onDeprecate}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#F85149]/50 px-3 text-xs font-bold text-[#FFB4AE] disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Deprecate category
            </button>
          )
        ) : null}
        {!disabled && mode === "edit" ? (
          <span className="text-[10px] leading-4 text-[#8B949E]">
            {draft.deprecatedAt
              ? "Deprecated: hidden from the public tree. Restoring makes it available again."
              : `Deprecating hides the node from customers and sellers. ${
                  draft.productCount === null
                    ? "The server decides whether listed products block the change."
                    : `${draft.productCount} listed ${draft.productCount === 1 ? "product keeps" : "products keep"} its recorded category.`
                }`}
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function attributeRowsFrom(
  attributes: Array<{ key: string; label: string; type: TaxonomyAttributeType; required: boolean; options: string[] }>
): AttributeRow[] {
  return attributes.map((attribute) => ({
    key: attribute.key,
    label: attribute.label,
    type: attribute.type,
    required: attribute.required,
    options: attribute.options.join(", ")
  }));
}

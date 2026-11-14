# Taxonomy API contract (coordinator-owned)

Schema already migrated (review + TEST): `Category.parentId/level/key/isSelectable/showOnHomepage/deprecatedAt`,
`CategoryAlias`, `CategoryAttribute`, `CategoryCountryRule`, `CategoryRequest`, `Product.attributes`.

## Public
`GET /api/taxonomy?country=&city=`
```json
{ "countryCode", "city", "departments": [{ "id","key","name","slug","description","imageUrl","imageAlt",
  "level","sortOrder","isSelectable","showOnHomepage","browsingVisible","canPublish","restrictionNote",
  "restrictionReason","isRegulated","productCount","subtreeProductCount",
  "children": [{ "...same", "children": [] }] }] }
```
Only `isActive=true`, `deprecatedAt=null`, ordered by sortOrder. Include selectable nodes with zero products.
`browsingVisible` and `canPublish` are required explicit booleans in every node: a node without either flag,
a non-array root, or a response naming another `countryCode` is a malformed response (client error
`malformed_taxonomy_response`), never a reason to default to visible/publishable or to render an empty tree.
`browsingVisible=false` nodes stay published here and on their category page; they are only excluded from
browsing lists. `canPublish=false` nodes stay browsable with `restrictionNote`/`restrictionReason`
(`country_rule` or `market_eligibility_unresolved`). Malformed country/city is rejected with 400; counts are
market-scoped and are browsing counts, not delivery/checkout eligibility.

`GET /api/categories` remains for the existing Shop shell and returns the same active tree roots used by
navigation, always for one explicit market. The effective market is the validated `country`/`city` query pair,
or the visitor's shared locale (`readLocale`) when the query omits them; an explicit country wins over the
locale and its city must belong to it. Unsupported country/city returns 400 `invalid_market`/`invalid_city`.
`getCategories` requires an explicit country and rejects a request without one (`market_required`): there is
no implicit NG service fallback. Responses are `Cache-Control: no-store`, because switching market must never
reuse another market's roots or counts. Selected-market browsing is separate from delivery/checkout
eligibility and must not be used to infer it.

`GET /api/taxonomy/categories?country=NG&city=Lagos`
Returns every active, reachable level-1 node with `browsingVisible=true` in published
department/category order, including image/alt, effective `canPublish`, `restrictionNote`,
`restrictionReason`, `productCount`, `subtreeProductCount`, `parentId` and `parentName`.
Browsing and publishing are independent: a country-restricted node remains in this projection
with `canPublish=false` and a zero listing count so the rail/directory can show its restriction
notice; `browsingVisible=false` is the only browsing-removal flag. The selected country is part
of the request key; clients must not omit it or reuse a response across markets.

## Seller (authenticated seller)
`GET /api/seller/categories` → `{ categories: [{ id,key,name,path,level,isSelectable,attributes:[{key,label,type,required,options}],canPublish,restrictionNote }] }`
Only active, non-deprecated, selectable nodes reachable from active parents. `canPublish` is an explicit
boolean computed from CategoryCountryRule along the ancestor chain for the seller's country: a disallowing
rule on the node or an ancestor restricts it, and an `isRegulated` node without an explicit country rule is
fail-closed (`market_eligibility_unresolved`). There is no default-true fallback: clients reject an entry
whose `canPublish` (or `isSelectable`) is missing or not a boolean instead of treating it as publishable,
and only `canPublish === true` enables listing controls.
`GET /api/seller/category-suggest?q=` → `{ suggestions: [{ categoryId, path, reason }] }` max 3, alias/name match only; no external AI call.
`POST /api/seller/category-requests` `{ suggestedName, description, parentId?, imageUrl? }` → 201 `{ id,status:"PENDING" }`; product stays draft.
`GET /api/seller/category-requests` → own requests.
`POST /api/seller/products` (existing): require `categoryId` that is active, non-deprecated, `isSelectable`, and `canPublish` for the seller country; accept `attributes` object validated against CategoryAttribute (required, type, options); default status DRAFT.
`PATCH /api/seller/products/[id]`: same validation; cannot publish into restricted/selectable=false/deprecated category.

## Admin (products:read / products:moderate, country scope)
`GET /api/admin/taxonomy` → full tree incl inactive/aliases/attributes/countryRules + `{ requests: [...] }`.
`POST /api/admin/taxonomy` create node `{ parentId?, key, name, slug, description, imageUrl?, imageAlt?, level?, isSelectable?, showOnHomepage?, browsingVisible?, isRegulated?, isActive?, sortOrder? }`.
`PATCH /api/admin/taxonomy/[id]` edit fields, aliases `[{alias,locale}]`, attributes `[{key,label,type,required,options}]`, countryRules `[{countryCode,canPublish,note}]`, `browsingVisible`, `isRegulated`, deprecatedAt. Safe reparent rules: no cycles, level = parent.level+1, cannot move referenced products without explicit `confirmProductCount`.
`GET /api/admin/taxonomy/requests` pending/all.
`POST /api/admin/taxonomy/requests/[id]/resolve` `{ action:"APPROVED"|"REJECTED", categoryId?, note?, createCategory? }`.
`isRegulated` is a platform-wide publication decision: a country-scoped administrator may resend the current
value (editors submit every flag on save) but changing it, including setting it on create, returns 403
`region_forbidden`. Only a platform-wide administrator may set or clear it.
Audit every mutation, including the `isRegulated` before/after values and the deciding authority
(`scope: { scopeCountryCode, isRegulatedFlagAuthority }`). Never delete a referenced category; deprecate instead.

## UI
Seller: searchable category picker with breadcrumb/inclusion text and attribute fields; localStorage draft; Request category form; status list.
Admin: `/admin/taxonomy` hierarchy browse/create/edit, aliases, attributes, rules, deprecate, requests resolve.
Customer: All drawer/department directory use `/api/taxonomy`; empty selectable categories show honest empty state; homepage shows only `showOnHomepage` departments/shelves. Distinguish total/populated/featured counts.

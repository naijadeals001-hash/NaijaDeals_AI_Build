# Taxonomy API contract (coordinator-owned)

Schema already migrated (review + TEST): `Category.parentId/level/key/isSelectable/showOnHomepage/deprecatedAt`,
`CategoryAlias`, `CategoryAttribute`, `CategoryCountryRule`, `CategoryRequest`, `Product.attributes`.

## Public
`GET /api/taxonomy`
```json
{ "departments": [{ "id","key","name","slug","description","imageUrl","imageAlt","isSelectable","showOnHomepage",
  "children": [{ "...same", "children": [] }] }] }
```
Only `isActive=true`, `deprecatedAt=null`, ordered by sortOrder. Include selectable nodes with zero products.
`GET /api/categories` remains for the existing Shop shell but must return the same active tree roots used by navigation.

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
Only active, non-deprecated, selectable nodes reachable from active parents; `canPublish` derives from CategoryCountryRule for the seller's country (default true).
`GET /api/seller/category-suggest?q=` → `{ suggestions: [{ categoryId, path, reason }] }` max 3, alias/name match only; no external AI call.
`POST /api/seller/category-requests` `{ suggestedName, description, parentId?, imageUrl? }` → 201 `{ id,status:"PENDING" }`; product stays draft.
`GET /api/seller/category-requests` → own requests.
`POST /api/seller/products` (existing): require `categoryId` that is active, non-deprecated, `isSelectable`, and `canPublish` for the seller country; accept `attributes` object validated against CategoryAttribute (required, type, options); default status DRAFT.
`PATCH /api/seller/products/[id]`: same validation; cannot publish into restricted/selectable=false/deprecated category.

## Admin (products:read / products:moderate, country scope)
`GET /api/admin/taxonomy` → full tree incl inactive/aliases/attributes/countryRules + `{ requests: [...] }`.
`POST /api/admin/taxonomy` create node `{ parentId?, key, name, slug, description, imageUrl?, imageAlt?, level?, isSelectable?, showOnHomepage?, isActive?, sortOrder? }`.
`PATCH /api/admin/taxonomy/[id]` edit fields, aliases `[{alias,locale}]`, attributes `[{key,label,type,required,options}]`, countryRules `[{countryCode,canPublish,note}]`, deprecatedAt. Safe reparent rules: no cycles, level = parent.level+1, cannot move referenced products without explicit `confirmProductCount`.
`GET /api/admin/taxonomy/requests` pending/all.
`POST /api/admin/taxonomy/requests/[id]/resolve` `{ action:"APPROVED"|"REJECTED", categoryId?, note?, createCategory? }`.
Audit every mutation. Never delete a referenced category; deprecate instead.

## UI
Seller: searchable category picker with breadcrumb/inclusion text and attribute fields; localStorage draft; Request category form; status list.
Admin: `/admin/taxonomy` hierarchy browse/create/edit, aliases, attributes, rules, deprecate, requests resolve.
Customer: All drawer/department directory use `/api/taxonomy`; empty selectable categories show honest empty state; homepage shows only `showOnHomepage` departments/shelves. Distinguish total/populated/featured counts.

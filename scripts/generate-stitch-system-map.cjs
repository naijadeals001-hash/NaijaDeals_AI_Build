const fs = require("fs");
const path = require("path");

const root = "D:/stitch_naijadeals_super_ecosystem";
const out = path.resolve("docs/stitch-system-map.md");

const dirs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const systems = [
  { name: "Identity System", keys: ["identity", "kyc", "verification", "verify", "onboarding", "vetting", "personnel", "biometric", "roles", "permissions", "profile", "registry", "driver_compliance", "supplier_vetting"] },
  { name: "Marketplace System", keys: ["shop", "marketplace", "listing", "product", "catalog", "category", "search", "wholesale", "procurement", "agro", "fish", "produce", "livestock", "equipment", "contractor", "utilities", "booking", "stay", "travel", "stream", "creator", "music", "restaurant_detail", "property_detail", "service_inventory"] },
  { name: "Food Commerce System", keys: ["eats", "restaurant", "menu", "mama_cass", "food", "meal", "kitchen", "buka", "jollof"] },
  { name: "Logistics System", keys: ["logistics", "dispatch", "delivery", "courier", "driver", "route", "routing", "fleet", "mission", "tracking", "pickup", "dropoff", "corridor", "hub", "transport", "helicopter", "aviation", "maintenance", "asset", "facility", "solar_hub", "regional_hub", "emergency", "security_dispatch"] },
  { name: "Wallet System", keys: ["wallet", "payment", "payments", "payout", "payouts", "settlement", "financial", "banking", "liquidity", "billing", "invoice", "tax", "tariff", "capital", "reserves", "subscriptions", "transfer"] },
  { name: "Trust System", keys: ["trust", "fraud", "risk", "dispute", "safety", "compliance", "audit", "governance", "policy", "regulatory", "sovereignty", "security", "threat", "evidence", "unboxing", "transparency", "law_enforcement"] },
  { name: "Escrow System", keys: ["escrow", "hold", "release", "refund", "dispute_escrow", "premium_escrow", "insurance"] },
  { name: "Admin System", keys: ["admin", "dashboard", "command", "console", "control", "oversight", "terminal", "manager", "management", "authority", "portal", "analytics", "health", "uptime", "coverage", "kill_switch", "configuration", "settings", "roadmap"] },
  { name: "AI System", keys: ["ai", "aura", "brain", "algorithm", "recommendation", "forecast", "prediction", "matching", "ranking", "scoring", "intelligence", "assistant", "concierge", "support", "localization", "training_data", "ethics"] }
];

const entityMap = [
  ["User", ["user", "customer", "consumer", "member", "family", "profile", "account"]],
  ["Vendor", ["vendor", "merchant", "seller", "business", "supplier", "partner"]],
  ["Restaurant", ["restaurant", "kitchen", "mama_cass", "food", "eats"]],
  ["Driver/Courier", ["driver", "courier", "rider", "fleet", "personnel"]],
  ["Product/Listing", ["product", "listing", "catalog", "marketplace", "shop", "wholesale", "inventory", "produce", "fish", "equipment"]],
  ["Order/Mission", ["order", "mission", "booking", "checkout", "trip", "ride", "delivery"]],
  ["Wallet/Ledger", ["wallet", "ledger", "payment", "transaction", "settlement", "payout", "billing", "tax", "tariff"]],
  ["EscrowHold", ["escrow", "hold", "release", "refund", "reserve"]],
  ["Delivery/Route", ["delivery", "pickup", "dropoff", "route", "tracking", "corridor", "dispatch", "logistics", "hub"]],
  ["Dispute/Case", ["dispute", "resolution", "evidence", "support", "handoff", "refund"]],
  ["Risk/FraudAlert", ["fraud", "risk", "threat", "security", "compliance", "audit", "kyc"]],
  ["AIModel/Rule", ["ai", "brain", "algorithm", "recommendation", "forecast", "scoring", "matching", "ranking"]],
  ["AdminAction/AuditLog", ["admin", "audit", "governance", "policy", "approval", "console", "oversight"]]
];

const eventMap = [
  ["identity.submitted", ["onboarding", "kyc", "identity", "verification", "vetting"]],
  ["identity.verified", ["success", "verification_success", "verified", "biometric"]],
  ["listing.created_or_ranked", ["listing", "catalog", "product", "ranking", "scoring", "marketplace"]],
  ["cart.checkout_started", ["checkout"]],
  ["order.created", ["order", "booking", "checkout", "mission"]],
  ["payment.authorized", ["payment", "transfer", "billing"]],
  ["escrow.hold_created", ["escrow", "hold"]],
  ["escrow.released_or_refunded", ["release", "refund", "payout", "settlement"]],
  ["delivery.assigned", ["dispatch", "assignment", "driver", "courier"]],
  ["delivery.status_changed", ["tracking", "route", "mission", "delivery", "fleet"]],
  ["qr.proof_captured", ["qr", "barcode", "proof", "unboxing", "verification"]],
  ["dispute.opened_or_escalated", ["dispute", "resolution", "handoff", "evidence"]],
  ["risk.alert_created", ["fraud", "risk", "threat", "sentry", "security"]],
  ["ai.recommendation_or_decision", ["ai", "aura", "brain", "recommendation", "forecast", "prediction", "matching", "ranking"]],
  ["admin.action_logged", ["admin", "audit", "governance", "console", "terminal", "command"]]
];

const actionMap = [
  ["Search/filter offers", ["search", "marketplace", "catalog", "discovery"]],
  ["Create/update listing", ["listing", "product", "inventory", "merchant", "vendor"]],
  ["Submit KYC/onboarding", ["onboarding", "kyc", "identity", "vetting", "verification"]],
  ["Approve/reject entity", ["approval", "verification", "admin", "authority"]],
  ["Place order/booking", ["checkout", "order", "booking", "trip"]],
  ["Assign courier/driver", ["dispatch", "assignment", "courier", "driver", "fleet"]],
  ["Track mission status", ["tracking", "mission", "route", "delivery"]],
  ["Capture QR/proof", ["qr", "barcode", "proof", "unboxing"]],
  ["Hold/release/refund escrow", ["escrow", "refund", "release", "settlement"]],
  ["Pay out vendor/driver", ["payout", "settlement", "wallet"]],
  ["Open/resolve dispute", ["dispute", "resolution", "support", "handoff"]],
  ["Review fraud/risk alert", ["fraud", "risk", "threat", "security"]],
  ["Tune AI/rules", ["ai", "brain", "algorithm", "configuration", "tuner"]],
  ["Monitor analytics/health", ["analytics", "health", "uptime", "coverage", "dashboard"]],
  ["Manage compliance/policy", ["compliance", "policy", "regulatory", "governance", "sovereignty"]]
];

const componentMap = [
  ["Top app shell / nav", ["header", "nav", "sidebar", "bottom nav", "tabs"]],
  ["Search/filter controls", ["search", "filter", "select", "input", "chip"]],
  ["Metric/KPI cards", ["metric", "kpi", "stat", "card"]],
  ["Marketplace/listing cards", ["product", "listing", "catalog", "grid", "card"]],
  ["Tables/data grids", ["table", "tbody", "thead", "grid"]],
  ["Timeline/status tracker", ["timeline", "status", "progress", "stepper", "tracking"]],
  ["Map/route panel", ["map", "route", "corridor", "location"]],
  ["Wallet/ledger panels", ["wallet", "ledger", "transaction", "balance", "escrow"]],
  ["Chat/assistant panel", ["chat", "message", "assistant", "aura"]],
  ["Forms/wizards", ["form", "input", "textarea", "onboarding", "step"]],
  ["Approval/action queue", ["approve", "reject", "queue", "action"]],
  ["Risk alert cards", ["risk", "fraud", "alert", "threat"]],
  ["Modal/detail drawer", ["modal", "drawer", "detail", "dialog"]]
];

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function titleize(name) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function htmlText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(name, html, keys) {
  const haystack = `${normalize(name)} ${normalize(htmlText(html || ""))}`;
  return keys.some((key) => haystack.includes(normalize(key)));
}

function collect(name, html, mappings, fallback) {
  const found = mappings
    .filter(([, keys]) => hasAny(name, html, keys))
    .map(([label]) => label);
  return found.length ? Array.from(new Set(found)).slice(0, 6) : [fallback];
}

function systemFor(name, html) {
  const scores = systems.map((system) => ({
    name: system.name,
    score: system.keys.reduce((total, key) => total + (hasAny(name, html, [key]) ? 1 : 0), 0)
  }));
  scores.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scores[0].score > 0 ? scores[0].name : "Admin System";
}

function workflowFor(name, system) {
  const normalized = normalize(name);
  if (normalized.includes("onboarding") || normalized.includes("kyc") || normalized.includes("vetting") || normalized.includes("verification")) return "Identity intake, verification, approval, and trust-score update workflow";
  if (normalized.includes("checkout")) return "Checkout orchestration: cart review, payment authorization, escrow hold, order creation, and mission creation";
  if (normalized.includes("wallet") || normalized.includes("payment") || normalized.includes("settlement") || normalized.includes("payout") || normalized.includes("tax") || normalized.includes("tariff")) return "Money movement workflow: balance, ledger entry, settlement, payout, compliance, and reconciliation";
  if (normalized.includes("escrow") || normalized.includes("dispute") || normalized.includes("refund")) return "Trust resolution workflow: escrow hold, evidence, dispute review, refund/release decision, and audit trail";
  if (normalized.includes("dispatch") || normalized.includes("delivery") || normalized.includes("tracking") || normalized.includes("mission") || normalized.includes("route") || normalized.includes("fleet") || normalized.includes("logistics")) return "Logistics workflow: request, assignment, route monitoring, proof capture, delivery confirmation, and payout trigger";
  if (normalized.includes("restaurant") || normalized.includes("eats") || normalized.includes("menu") || normalized.includes("food")) return "Food commerce workflow: restaurant discovery, menu selection, prep queue, dispatch, delivery, and support";
  if (normalized.includes("marketplace") || normalized.includes("shop") || normalized.includes("product") || normalized.includes("listing") || normalized.includes("catalog") || normalized.includes("search")) return "Marketplace workflow: discovery, filtering, listing evaluation, cart/order conversion, and seller trust display";
  if (normalized.includes("ai") || normalized.includes("aura") || normalized.includes("brain") || normalized.includes("algorithm")) return "AI workflow: model input, recommendation/decision, confidence/risk review, human handoff, and governance logging";
  if (normalized.includes("admin") || normalized.includes("dashboard") || normalized.includes("console") || normalized.includes("command") || normalized.includes("manager")) return "Operations workflow: monitor queues, investigate records, approve actions, change state, and log admin action";
  return `${system.replace(" System", "")} operating workflow represented by this Stitch design`;
}

function componentsFor(name, html) {
  const found = collect(name, html, componentMap, "Operational cards/panels");
  if (/<table|<thead|<tbody/i.test(html) && !found.includes("Tables/data grids")) found.push("Tables/data grids");
  if (/<form|<input|<select|<textarea/i.test(html) && !found.includes("Forms/wizards")) found.push("Forms/wizards");
  if (/<button/i.test(html) && !found.includes("Action buttons")) found.push("Action buttons");
  if (/grid|card/i.test(html) && !found.includes("Grid/card layout")) found.push("Grid/card layout");
  return Array.from(new Set(found)).slice(0, 7);
}

const counts = Object.fromEntries(systems.map((system) => [system.name, 0]));

const entries = dirs.map((name, index) => {
  const dir = path.join(root, name);
  const files = fs.readdirSync(dir).sort();
  const htmlPath = path.join(dir, "code.html");
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  const system = systemFor(name, html);
  counts[system] = (counts[system] || 0) + 1;
  return {
    index: index + 1,
    name,
    files,
    system,
    workflow: workflowFor(name, system),
    entities: collect(name, html, entityMap, "OperationalRecord"),
    events: collect(name, html, eventMap, "system.viewed"),
    actions: collect(name, html, actionMap, "Inspect operational state"),
    components: componentsFor(name, html)
  };
});

const lines = [
  "# Stitch System Map",
  "",
  "This map treats Stitch designs as representations of NaijaDeals operating workflows, not as standalone pages. Each design is mapped to the system it implies, the workflow behind the screen, and the data/events/actions/components needed to implement it as software.",
  "",
  `Source folder: \`${root}\``,
  `Design folders scanned: ${entries.length}`,
  "",
  "## System Counts",
  ""
];

for (const [system, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  lines.push(`- ${system}: ${count}`);
}

lines.push(
  "",
  "## Operating System Interpretation",
  "",
  "- Identity System: actors, KYC, verification, roles, permissions, onboarding, trust enrollment.",
  "- Marketplace System: catalogs, listings, search, pricing, inventory, vendor trust, order conversion.",
  "- Food Commerce System: restaurant discovery, menus, prep workflow, dispatch handoff.",
  "- Logistics System: pickup/dropoff, assignment, route/status changes, QR proof, delivery confirmation.",
  "- Wallet System: balances, ledger entries, payments, settlements, tax/tariff, payouts.",
  "- Trust System: KYC, fraud, disputes, compliance, safety, governance, evidence, audit.",
  "- Escrow System: holds, release/refund decisions, milestones, dispute reserve, evidence.",
  "- Admin System: control center, queues, approvals, configuration, monitoring, audit actions.",
  "- AI System: Aura, recommendations, fraud/risk scoring, dispatch intelligence, support assistants, governance.",
  "",
  "## Design-To-System Map",
  ""
);

for (const entry of entries) {
  lines.push(`### ${entry.index}. ${entry.name}`);
  lines.push("");
  lines.push(`- Design name: ${titleize(entry.name)}`);
  lines.push(`- Source files: ${entry.files.length ? entry.files.map((file) => `\`${file}\``).join(", ") : "`no files detected`"}`);
  lines.push(`- System: ${entry.system}`);
  lines.push(`- Workflow represented: ${entry.workflow}`);
  lines.push(`- Data entities involved: ${entry.entities.join(", ")}`);
  lines.push(`- Events involved: ${entry.events.join(", ")}`);
  lines.push(`- Actions involved: ${entry.actions.join(", ")}`);
  lines.push(`- UI components involved: ${entry.components.join(", ")}`);
  lines.push("");
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join("\n"));
console.log(JSON.stringify({ out, scanned: entries.length, counts }, null, 2));

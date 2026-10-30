import Link from "next/link";
import { ArrowLeft, BadgeCheck, Info, ShieldCheck, Wallet } from "lucide-react";
import { verticals, type Vertical } from "@/lib/data/ecosystem";
import { ModuleCard } from "@/components/sections/ecosystem-home";

const groups: Array<{ title: string; description: string; keys: Vertical["key"][] }> = [
  {
    title: "Shop and everyday needs",
    description: "Physical goods, food and groceries delivered to your address.",
    keys: ["shop", "eats", "fresh", "send"]
  },
  {
    title: "Move, stay and work",
    description: "Rides, shared journeys, vehicle hire and places to stay.",
    keys: ["drive", "stay", "gigs"]
  },
  {
    title: "Money, media and help",
    description: "Payments, creator content and the Aura assistant.",
    keys: ["wallet", "stream", "aura"]
  }
];

export function ProductsPage() {
  const liveCount = verticals.filter((vertical) => vertical.status === "live").length;

  return (
    <div className="space-y-8 pb-4">
      <div>
        <Link
          href="/"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-muted transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to home
        </Link>
        <header className="mt-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Products</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">The NaijaDeals ecosystem</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
            {verticals.length} services share one account, one wallet and one delivery network. {liveCount} are connected
            to live backend data in this environment; the rest open a status page that names exactly what is missing.
          </p>
        </header>
      </div>

      <section className="grid gap-3 rounded-2xl border border-border-soft bg-canvas p-4 sm:grid-cols-3 sm:p-5">
        <StatusNote icon={BadgeCheck} title="Live" body="Connected to real database records and server APIs." tone="live" />
        <StatusNote icon={Info} title="Setup required" body="The route opens and states the missing provider, approval or operational data." tone="setup" />
        <StatusNote icon={ShieldCheck} title="Nothing faked" body="No invented tracking, reviews, stock, revenue or confirmations anywhere." tone="neutral" />
      </section>

      {groups.map((group) => {
        const items = group.keys
          .map((key) => verticals.find((vertical) => vertical.key === key))
          .filter((vertical): vertical is Vertical => Boolean(vertical));

        return (
          <section key={group.title} aria-labelledby={`group-${group.title.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2
                  id={`group-${group.title.replace(/\s+/g, "-").toLowerCase()}`}
                  className="font-display text-xl font-extrabold sm:text-2xl"
                >
                  {group.title}
                </h2>
                <p className="mt-1 text-sm text-muted">{group.description}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((vertical) => (
                <ModuleCard key={vertical.key} vertical={vertical} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-extrabold">One wallet across every service</h2>
            <p className="mt-1 text-sm text-muted">
              NaijaPay is the shared money layer. When a service is connected, payments are verified on the server,
              recorded in the ledger and protected by escrow where the workflow requires it.
            </p>
            <Link
              href="/wallet"
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Open NaijaPay
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusNote({
  icon: Icon,
  title,
  body,
  tone
}: {
  icon: typeof BadgeCheck;
  title: string;
  body: string;
  tone: "live" | "setup" | "neutral";
}) {
  const toneClass =
    tone === "live" ? "bg-primary-soft text-primary" : tone === "setup" ? "bg-amber-soft text-amber-700" : "bg-surface-mid text-ink";

  return (
    <div className="flex gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneClass}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-extrabold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

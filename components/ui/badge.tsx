import { CheckCircle2 } from "lucide-react";

export function TrustBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

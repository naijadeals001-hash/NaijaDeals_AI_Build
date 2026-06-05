import { AlertCircle, Inbox } from "lucide-react";

export function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-44 animate-pulse rounded-xl bg-surface-mid" />
      ))}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", body = "When real APIs connect, this state will fill with live ecosystem data." }) {
  return (
    <div className="rounded-xl border border-dashed border-border-soft bg-canvas p-8 text-center">
      <Inbox className="mx-auto mb-3 h-8 w-8 text-primary" />
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted">{body}</p>
    </div>
  );
}

export function ErrorState({ title = "Something needs attention", body = "The UI is ready to show API validation, retry, or support handoff states." }) {
  return (
    <div className="rounded-xl border border-crimson/20 bg-crimson-soft p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-crimson" />
        <div>
          <h3 className="font-bold text-crimson">{title}</h3>
          <p className="mt-1 text-sm text-muted">{body}</p>
        </div>
      </div>
    </div>
  );
}

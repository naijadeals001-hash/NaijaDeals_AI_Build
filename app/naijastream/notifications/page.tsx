import { StreamNotifications } from "@/components/stream/notifications-client";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Notifications</h1>
      <p className="mt-1 text-[12px] text-white/50">New releases from artists you follow and updates on your activity.</p>
      <div className="mt-4">
        <StreamNotifications />
      </div>
    </main>
  );
}

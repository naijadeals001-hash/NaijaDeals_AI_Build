import { NotConfigured } from "@/components/stream/not-configured";
export const dynamic = "force-dynamic";
export default function Page() {
  return <NotConfigured title="Music videos" body="Video discovery, playback and creator video hosting require a video transcoding and delivery provider. Until that is connected, video content is unavailable rather than simulated." dependency="Video transcoding/delivery provider" />;
}

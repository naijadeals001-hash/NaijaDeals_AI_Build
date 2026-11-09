import { redirect } from "next/navigation";

/** The job form lives at /naijagigs/post-job; the mockup links to /jobs/new. */
export default function NewJobRedirect() {
  redirect("/naijagigs/post-job");
}

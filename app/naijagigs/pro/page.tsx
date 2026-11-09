import { redirect } from "next/navigation";

/** "Create a Profile" from the mockup leads to the professional application. */
export default function ProRedirect() {
  redirect("/naijagigs/pro/apply");
}

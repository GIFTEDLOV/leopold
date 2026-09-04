import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function V2HomeRoute() {
  redirect("/app");
}

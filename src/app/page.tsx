import { redirect } from "next/navigation";
import { tenantPaths } from "@/lib/tenant-paths";

export default function Home() {
  redirect(tenantPaths.dashboard);
}

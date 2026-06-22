import { redirect } from "next/navigation";
import { defaultSport } from "@/lib/sports";

export default function DashboardRootPage() {
  redirect(`/dashboard/${defaultSport()}`);
}

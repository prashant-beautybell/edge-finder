import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { isSportId } from "@/lib/sports";
import { notFound } from "next/navigation";

export default function SportOverviewPage({ params }: { params: { sport: string } }) {
  if (!isSportId(params.sport)) notFound();
  return <DashboardHome sport={params.sport} />;
}

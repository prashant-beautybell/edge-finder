import { HistoricalDashboard } from "@/components/dashboard/HistoricalDashboard";
import { isSportId } from "@/lib/sports";
import { notFound, redirect } from "next/navigation";

export default function SportHistoricalPage({ params }: { params: { sport: string } }) {
  if (!isSportId(params.sport)) notFound();
  if (params.sport !== "racing") {
    redirect(`/dashboard/${params.sport}/today`);
  }
  return <HistoricalDashboard />;
}

import { TodayFootballPicksView } from "@/components/dashboard/TodayFootballPicksView";
import { TodayPicksView } from "@/components/dashboard/TodayPicksView";
import { isSportId } from "@/lib/sports";
import { notFound } from "next/navigation";

export default function SportTodayPicksPage({ params }: { params: { sport: string } }) {
  if (!isSportId(params.sport)) notFound();
  if (params.sport === "football") return <TodayFootballPicksView />;
  return <TodayPicksView />;
}

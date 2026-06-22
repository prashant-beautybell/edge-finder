import { TodayRacingView } from "@/components/dashboard/TodayRacingView";
import { isSportId } from "@/lib/sports";
import { notFound, redirect } from "next/navigation";

export default function SportTodayRacingPage({ params }: { params: { sport: string } }) {
  if (!isSportId(params.sport)) notFound();
  if (params.sport !== "racing") {
    redirect(`/dashboard/${params.sport}/today/fixtures`);
  }
  return <TodayRacingView />;
}

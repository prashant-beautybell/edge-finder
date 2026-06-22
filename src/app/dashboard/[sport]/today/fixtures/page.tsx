import { TodayFootballFixturesView } from "@/components/dashboard/TodayFootballFixturesView";
import { isSportId } from "@/lib/sports";
import { notFound, redirect } from "next/navigation";

export default function SportTodayFixturesPage({ params }: { params: { sport: string } }) {
  if (!isSportId(params.sport)) notFound();
  if (params.sport !== "football") {
    redirect(`/dashboard/${params.sport}/today/racing`);
  }
  return <TodayFootballFixturesView />;
}

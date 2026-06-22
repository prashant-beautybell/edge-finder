import { TodayFootballHome } from "@/components/dashboard/TodayFootballHome";
import { TodayHome } from "@/components/dashboard/TodayHome";
import { isSportId } from "@/lib/sports";
import { notFound } from "next/navigation";

export default function SportTodayPage({ params }: { params: { sport: string } }) {
  if (!isSportId(params.sport)) notFound();
  if (params.sport === "football") return <TodayFootballHome />;
  return <TodayHome />;
}

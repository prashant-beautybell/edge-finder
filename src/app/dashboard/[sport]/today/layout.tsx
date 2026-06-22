import { TodayProvider } from "@/components/dashboard/TodayContext";
import { TodayNav } from "@/components/dashboard/TodayNav";
import { isSportId } from "@/lib/sports";
import { notFound } from "next/navigation";

export default function SportTodayLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { sport: string };
}) {
  if (!isSportId(params.sport)) notFound();

  return (
    <TodayProvider>
      <TodayNav sport={params.sport} />
      {children}
    </TodayProvider>
  );
}

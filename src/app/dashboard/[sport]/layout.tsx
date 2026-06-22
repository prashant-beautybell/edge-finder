import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { isSportId } from "@/lib/sports";

export default function SportLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { sport: string };
}) {
  if (!isSportId(params.sport)) notFound();

  return <DashboardShell sport={params.sport}>{children}</DashboardShell>;
}

import { AlgorithmRulesEditor } from "@/components/dashboard/AlgorithmRulesEditor";
import { isSportId, SPORT_META } from "@/lib/sports";
import { notFound } from "next/navigation";

export default function SportRulesPage({ params }: { params: { sport: string } }) {
  if (!isSportId(params.sport)) notFound();
  const meta = SPORT_META[params.sport];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h2 className="text-2xl font-bold text-betfair-navy">{meta.label} — Algorithm</h2>
        <p className="text-sm text-betfair-muted">
          Edit strong-edge rules for {meta.label.toLowerCase()}. Saved to the {meta.dbLabel}.
        </p>
      </div>
      <AlgorithmRulesEditor sport={params.sport} />
    </div>
  );
}

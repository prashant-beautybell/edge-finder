import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }

  return NextResponse.json(
    {
      error:
        "Use `npm run import:historical` for bulk CSV import. API upload will be added in a later phase.",
    },
    { status: 501 }
  );
  } catch (error) {
    console.error("Import API error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const count = await prisma.historicalRace.count();
    const qualified = await prisma.historicalRace.count({ where: { qualified: true } });
    return NextResponse.json({ totalRows: count, qualifiedRows: qualified });
  } catch (error) {
    console.error("Import status error:", error);
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }
}

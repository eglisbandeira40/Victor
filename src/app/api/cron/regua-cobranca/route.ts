import { NextRequest, NextResponse } from "next/server";
import { executarReguaCobranca } from "@/lib/regua-cobranca";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const resultado = await executarReguaCobranca();
  return NextResponse.json(resultado);
}

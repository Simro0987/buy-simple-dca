import { fetchAllTokenExecutionTechnicals } from "@/lib/tokenExecutionTechnicals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");
    const symbols = symbolsParam
      ? symbolsParam.split(",").map((symbol) => symbol.trim().toUpperCase())
      : undefined;

    const technicals = await fetchAllTokenExecutionTechnicals(symbols);

    return Response.json({
      success: true,
      technicals,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Nepodarilo sa načítať token technické dáta",
      },
      { status: 500 },
    );
  }
}

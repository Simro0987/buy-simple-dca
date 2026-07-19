import { NextResponse } from "next/server";
import { resolveHeroImage } from "@/lib/newsImageHandler";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      url?: string;
      tokens?: string[];
      symbol?: string;
    };

    const title = body.title?.trim();
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 },
      );
    }

    const imageUrl = await resolveHeroImage(
      {
        url,
        title: title ?? "",
        tokens: body.tokens ?? [],
      },
      body.symbol ? { symbol: body.symbol } : undefined,
    );

    return NextResponse.json({ success: true, imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

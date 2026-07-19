import { NextResponse } from "next/server";
import { generateHeroImageUrl } from "@/lib/newsHeroImage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim();

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 },
      );
    }

    const imageUrl = await generateHeroImageUrl(title);

    return NextResponse.json({ success: true, imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

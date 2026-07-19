import { NextResponse } from "next/server";
import { aggregateNews } from "@/lib/newsEngine";
import { generateHeroImageUrl } from "@/lib/newsHeroImage";

export const revalidate = 900;

export async function GET() {
  try {
    const articles = await aggregateNews();

    let heroImageUrl: string | undefined;
    const hero = articles[0];
    if (hero) {
      heroImageUrl = hero.imageUrl ?? (await generateHeroImageUrl(hero.title));
    }

    return NextResponse.json({
      success: true,
      heroImageUrl,
      articles,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, articles: [] },
      { status: 500 },
    );
  }
}

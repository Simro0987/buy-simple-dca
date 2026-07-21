import { getTokenBrandColor } from "@/lib/newsDefiBrands";
import type { TokenImageRef } from "@/lib/newsImageHandler";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchLogoAsDataUri(logoUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(logoUrl, {
      headers: { "User-Agent": "EdgeTraderNewsBot/1.0" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return undefined;

    const contentType = response.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function generateDefiPatternImage(
  token: TokenImageRef,
  brandColor?: string,
): Promise<string> {
  const color = brandColor ?? getTokenBrandColor(token.symbol);
  const symbol = token.symbol.toUpperCase().slice(0, 6);
  const logoDataUri = token.logoUrl
    ? await fetchLogoAsDataUri(token.logoUrl)
    : undefined;

  const logoBlock = logoDataUri
    ? `<image href="${logoDataUri}" x="270" y="110" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="320" cy="160" r="52" fill="${color}" opacity="0.18"/>
       <text x="320" y="172" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="34" font-weight="800">${escapeXml(symbol)}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="defi-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="${color}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
    <radialGradient id="defi-glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#050505" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="#050505"/>
  <rect width="640" height="360" fill="url(#defi-bg)"/>
  <rect width="640" height="360" fill="url(#defi-glow)"/>
  ${logoBlock}
  <text x="320" y="300" text-anchor="middle" fill="${color}" font-family="system-ui,sans-serif" font-size="13" font-weight="700" letter-spacing="4">DEFI · ${escapeXml(symbol)}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

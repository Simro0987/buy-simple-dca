function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generateFintechHeroSvg(title: string): string {
  const hash = hashString(title);
  const accentHue = hash % 360;
  const accent = `hsl(${accentHue}, 85%, 55%)`;
  const accent2 = `hsl(${(accentHue + 40) % 360}, 80%, 45%)`;
  const keywords = title.split(" ").slice(0, 4).join(" · ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#050505"/>
      <stop offset="50%" stop-color="#0a0a0f"/>
      <stop offset="100%" stop-color="#111113"/>
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="30%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="40"/></filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="900" cy="120" r="180" fill="url(#glow)" filter="url(#blur)"/>
  <circle cx="200" cy="500" r="120" fill="${accent2}" opacity="0.12" filter="url(#blur)"/>
  <path d="M0 480 Q300 420 600 460 T1200 440 L1200 630 L0 630 Z" fill="${accent}" opacity="0.08"/>
  <g opacity="0.6">
    <line x1="80" y1="100" x2="1120" y2="100" stroke="${accent}" stroke-width="1" opacity="0.2"/>
    <line x1="80" y1="200" x2="1120" y2="200" stroke="${accent}" stroke-width="1" opacity="0.15"/>
    <line x1="80" y1="300" x2="1120" y2="300" stroke="${accent}" stroke-width="1" opacity="0.1"/>
    <line x1="80" y1="400" x2="1120" y2="400" stroke="${accent}" stroke-width="1" opacity="0.08"/>
  </g>
  <text x="80" y="540" fill="${accent}" font-family="system-ui,sans-serif" font-size="18" font-weight="600" letter-spacing="4">EDGE TRADER · CRYPTO INTEL</text>
  <text x="80" y="200" fill="#ffffff" font-family="system-ui,sans-serif" font-size="42" font-weight="700">${keywords.replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 60)}</text>
  <rect x="80" y="230" width="120" height="4" fill="${accent}" rx="2"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function generateHeroImageUrl(title: string): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    try {
      const response = await fetch(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: `Minimalist fintech crypto news illustration for headline: "${title}". Dark black background, neon emerald and violet accents, abstract geometric shapes, no text, cinematic, premium editorial style.`,
            n: 1,
            size: "1024x1024",
            quality: "standard",
          }),
        },
      );

      if (response.ok) {
        const data = (await response.json()) as {
          data?: { url?: string }[];
        };
        const url = data.data?.[0]?.url;
        if (url) return url;
      }
    } catch {
      // Fall through to SVG
    }
  }

  return generateFintechHeroSvg(title);
}

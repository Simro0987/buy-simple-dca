import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.coingecko.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "coin-images.coingecko.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons/**",
      },
      {
        protocol: "https",
        hostname: "**.coindesk.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.cointelegraph.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.decrypt.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.theblock.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.blockworks.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.bloomberg.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "oaidalleapiprodscus.blob.core.windows.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
        pathname: "/**",
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
  },
};

export default nextConfig;

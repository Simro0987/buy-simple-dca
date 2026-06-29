import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["sb-67lbx3xduvit.vercel.run"],
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: false,
      },
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.coingecko\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "coingecko-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /^https:\/\/api\.alternative\.me\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "alternative-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 600 },
            },
          },
          {
            urlPattern: /^https:\/\/yields\.llama\.fi\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "defillama-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 600 },
            },
          },
        ],
      },
      manifest: {
        name: "Môj Crypto Dashboard",
        short_name: "CryptoDCA",
        description: "Crypto DCA & Portfolio Tracker pre Android",
        start_url: "/",
        display: "standalone",
        background_color: "#0d1117",
        theme_color: "#0d1117",
        orientation: "portrait",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "ui-vendor": ["@radix-ui/react-dialog", "@radix-ui/react-tooltip", "@radix-ui/react-tabs", "@radix-ui/react-popover", "@radix-ui/react-select"],
          "chart-vendor": ["recharts"],
          "supabase-vendor": ["@supabase/supabase-js"],
        },
      },
    },
  },
}));

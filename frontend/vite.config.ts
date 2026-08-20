import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Split the dependencies that never change from the app code that
         * changes on every deploy.
         *
         * Without this the whole app is one hashed file, so shipping a copy
         * tweak invalidates React, React Query, Supabase and Radix along with
         * it — a returning shopper re-downloads ~200 KB of libraries that did
         * not move. These three groups have their own release cadence and are
         * big enough to be worth a separate cache entry each.
         *
         * Route-level splitting (React.lazy in main.tsx) is the other half and
         * does the heavier lifting; this is about repeat visits rather than
         * first loads.
         */
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          data: ["@tanstack/react-query", "@supabase/supabase-js", "zustand"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/favicon-48.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-512.png",
      ],
      manifest: {
        name: "PulseShop",
        short_name: "PulseShop",
        description: "Social-commerce storefront — browse, favorite, and order in one tap.",
        theme_color: "#0D9488",
        background_color: "#FAFAF9",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["logo-full.svg"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "product-images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});

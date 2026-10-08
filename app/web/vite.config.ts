import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      manifest: {
        name: "Tugas Harian Tim Kreatif",
        short_name: "Tugas Harian",
        description: "Tugas harian, bukti kerja, dan progres tim kreatif.",
        lang: "id",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#EEF0F2",
        theme_color: "#101114",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,png,woff2}"] },
    }),
  ],
  resolve: { alias: { "@shared": fileURLToPath(new URL("../shared/src", import.meta.url)) } },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
  build: { sourcemap: false },
});

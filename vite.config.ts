import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Чистый Vite SPA. Никакого SSR (TanStack Start), Cloudflare Workers и
// lovable-config — лендинг живёт как статика на GitHub Pages.
// См. CLAUDE_PITFALLS §3.66: Lovable генерит SSR-overkill, надо упрощать.
//
// BASE_URL переопределяется в GitHub Actions:
//  - GH Pages project-page: /aura-landing/  (дефолт)
//  - custom domain или user-page: BASE_URL=/ через env
export default defineConfig({
  base: process.env.BASE_URL || "/aura-landing/",
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: false,
    minify: "esbuild",
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          lenis: ["lenis"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
});

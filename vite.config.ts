import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Чистый Vite SPA. Никакого SSR (TanStack Start), Cloudflare Workers и
// lovable-config — лендинг живёт как статика на GitHub Pages.
// См. CLAUDE_PITFALLS §3.66: Lovable генерит SSR-overkill, надо упрощать.
//
// base = '/aura-landing/' — фиксированный путь под GH Pages project-page
// (репо andd-maker/aura-landing → andd-maker.github.io/aura-landing/).
// Если когда-то переедем на custom domain или user-page (andd-maker.github.io)
// — поменять на '/' (отдельным коммитом, ENV-driven избегаем чтобы не тащить
// @types/node ради одной строки).
export default defineConfig({
  base: "/aura-landing/",
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

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite configuration for SearchFuel Framer Plugin
 * Builds optimized plugin bundle for Framer platform
 */

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      output: {
        // Ensure single file output for Framer plugin
        entryFileNames: "main.js",
        chunkFileNames: "main.js",
        assetFileNames: "main.css",
      },
    },
    // Optimize for plugin size
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

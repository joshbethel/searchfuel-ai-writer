import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Tailwind CSS Configuration
 */

export default {
  content: [
    "./index.html",
    "./main.jsx",
    "./app.jsx",
  ],
  theme: {
    extend: {
      colors: {
        accent: "#0099ff",
        primary: "#1f2937",
      },
    },
  },
  plugins: [],
};

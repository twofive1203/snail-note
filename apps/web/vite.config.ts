import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:61666",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./test/setup.ts",
  },
});

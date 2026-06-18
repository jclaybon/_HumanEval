import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "https://underscore-humaneval-worker.humaneval.workers.dev",
      "/images": "https://underscore-humaneval-worker.humaneval.workers.dev",
      "/health": "https://underscore-humaneval-worker.humaneval.workers.dev"
    }
  }
});

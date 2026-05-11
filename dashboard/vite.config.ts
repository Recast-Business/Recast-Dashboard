import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// In dev, proxy /api/* to the deployed Vercel app so the Python serverless
// functions (scout, ccv30, update_creator, etc.) work without running
// `vercel dev` locally.
const API_PROXY_TARGET =
  process.env.VITE_API_PROXY_TARGET || "https://recast-dashboard.vercel.app";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});

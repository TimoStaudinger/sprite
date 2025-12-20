import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // If you used CRA proxy via setupProxy.js, put it here (example):
    // proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } },
  },
});
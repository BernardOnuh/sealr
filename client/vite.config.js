import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development, the relay (node server.mjs) runs on 8900 and Vite forwards the API and chain calls to it.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8900", "/rest": "http://127.0.0.1:8900" } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 }, // the post-quantum libraries are large
});

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Compiled output ships at token-metering/static/ (server.py serves it
// directly, no dev server in production) - see 03-architecture.md's
// Serving side.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../static",
    emptyOutDir: true,
  },
});

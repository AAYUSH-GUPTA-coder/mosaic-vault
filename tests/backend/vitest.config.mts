import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  root,
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "stubs/server-only.ts"),
      "@": root,
    },
  },
  test: {
    environment: "node",
    include: ["tests/backend/**/*.test.ts"],
    setupFiles: [path.resolve(__dirname, "setup.ts")],
  },
});

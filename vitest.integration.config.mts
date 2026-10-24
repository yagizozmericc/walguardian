import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Live integration tests read credentials from the local env files (never printed).
for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["tests/integration/**/*.test.ts"], testTimeout: 20_000 },
});

import { defineConfig } from "vitest/config";
import path from "path";

// Unit-test config only -- these are pure-logic tests (no Next.js runtime,
// no real Supabase/Stripe/Anthropic calls). The "@/..." alias mirrors
// tsconfig.json's paths so test files can import the same way app code
// does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // scripts/**/*.test.ts: pure-logic tests of the AI benchmark helpers.
    // The benchmark itself (scripts/ai-benchmark/run.ts) is not a test and
    // is never picked up here.
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});

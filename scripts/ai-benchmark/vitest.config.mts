import fs from "fs";
import path from "path";
import { defineConfig } from "vitest/config";

// Runner config for the AI benchmark only (see run.ts). Not used by
// `npm test`.
const root = path.resolve(__dirname, "../..");

// Same source of configuration as the app: .env.local, read here because
// nothing else loads it outside of Next.js. Variables already set in the
// shell win, so a run can point at another key or model without editing
// the file. Values are never printed.
function readEnvLocal(): Record<string, string> {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    out[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

export default defineConfig({
  root,
  resolve: {
    alias: { "@": path.join(root, "src") },
  },
  test: {
    environment: "node",
    include: ["scripts/ai-benchmark/run.ts"],
    env: readEnvLocal(),
    // One long-running "test" that prints its own progress.
    testTimeout: 60 * 60 * 1000,
    disableConsoleIntercept: true,
  },
});

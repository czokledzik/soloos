import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${src}/$1` },
      // `server-only` throws outside a React Server Components build.
      { find: "server-only", replacement: fileURLToPath(new URL("./test/empty.ts", import.meta.url)) },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    // DB tests share one database, so run files one at a time.
    fileParallelism: false,
    // Same day/week boundaries as production.
    env: { TZ: "Europe/Warsaw" },
  },
});

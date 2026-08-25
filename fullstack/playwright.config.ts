import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3211",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3211",
    url: "http://localhost:3211",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";

// Reset to the exact Test A (concentrated) vs Test B (distributed) scenario from the
// spec before and after this file, so the assertions are deterministic regardless of
// what earlier manual testing left behind. Shells out to the existing seed script
// (rather than importing the generated Prisma client directly) because that client is
// ESM-only (`import.meta.url`) and Playwright's test transform runs specs as CommonJS.
function reseedDemoData() {
  // Windows can't spawn npm.cmd directly without a shell; routing through cmd.exe's
  // /c avoids that while still not using the (deprecated-for-args) shell:true option.
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run db:seed"], { stdio: "inherit" });
  } else {
    execFileSync("npm", ["run", "db:seed"], { stdio: "inherit" });
  }
}

test.beforeAll(() => {
  reseedDemoData();
});

test.afterAll(() => {
  reseedDemoData();
});

test("dashboard renders Target B's weight bar visibly larger than Target A's for equal raw totals", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("Broad, distributed support")).toBeVisible();

  const rowA = page.locator("tbody tr", { hasText: "A" }).first();
  const rowB = page.locator("tbody tr", { hasText: "B" }).first();
  await expect(rowA).toBeVisible();
  await expect(rowB).toBeVisible();

  // The story the spec asks for, in numbers: same $10,000 raised, very different weight.
  await expect(rowA).toContainText("$10K");
  await expect(rowB).toContainText("$10K");
  await expect(rowA).toContainText("1.0×");
  await expect(rowB).toContainText("100.0×");

  // The same story, visually: the bar itself, not just the label next to it.
  const barA = page.getByTestId("weight-bar-A");
  const barB = page.getByTestId("weight-bar-B");
  const [boxA, boxB] = await Promise.all([barA.boundingBox(), barB.boundingBox()]);

  expect(boxA).not.toBeNull();
  expect(boxB).not.toBeNull();
  expect(boxB!.width).toBeGreaterThan(boxA!.width * 2); // spec's minimum bar
  expect(boxB!.width).toBeGreaterThan(boxA!.width * 50); // the actual, much larger gap
});

test("submitting a new allocation through the form updates the leaderboard without a page reload", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("User ID").first().fill("e2e_user");
  await page.getByLabel("Target ID").first().fill("E2E");
  await page.getByLabel("Amount").first().fill("42");
  await page.getByRole("button", { name: "Submit allocations" }).click();

  await expect(page.getByText("Submitted  -  the leaderboard has been updated.")).toBeVisible();
  await expect(page.locator("tbody")).toContainText("E2E");
});

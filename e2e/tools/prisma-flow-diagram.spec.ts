import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// A free tool for visitors without an account.
test.use({ storageState: { cookies: [], origins: [] } });

test("type counts → diagram → SVG and PNG download → link restores it", async ({ page }) => {
  await page.goto("/tools/prisma-flow-diagram");
  await expect(
    page.getByRole("heading", { level: 1, name: "Free PRISMA 2020 Flow Diagram Generator" })
  ).toBeVisible();

  await page.getByLabel("Records from databases").fill("412");
  await page.getByLabel("Duplicate records removed").fill("87");
  await page.getByLabel("Records screened").fill("320");
  await expect(
    page.getByText("Identified 412 − removed 87 = 325, but records screened is 320.")
  ).toBeVisible();
  await page.getByLabel("Records screened").fill("325");
  await page.getByLabel("Reason 1", { exact: true }).fill("Wrong population");
  await page.getByLabel("Reason 1 count").fill("12");

  const diagram = page.getByRole("img", { name: "PRISMA 2020 flow diagram" });
  await expect(diagram).toContainText("Records screened (n = 325)");
  await expect(diagram).toContainText("Wrong population (n = 12)");

  const [svgDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download SVG" }).click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe("prisma-2020-flow-diagram.svg");
  const svg = await readFile((await svgDownload.path())!, "utf-8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("Records screened (n = 325)");

  const [pngDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PNG" }).click(),
  ]);
  expect(pngDownload.suggestedFilename()).toBe("prisma-2020-flow-diagram.png");

  await expect(page).toHaveURL(/#d=/);
  await page.reload();
  await expect(page.getByLabel("Records screened")).toHaveValue("325");
  await expect(page.getByRole("img", { name: "PRISMA 2020 flow diagram" })).toContainText(
    "Wrong population (n = 12)"
  );
});

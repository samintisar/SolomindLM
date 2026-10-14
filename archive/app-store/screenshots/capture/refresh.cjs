// Open the profile in normal browser mode so Convex Auth refreshes the JWT with the refresh token.
const { BASE, openShell } = require("./lib.cjs");
(async () => {
  const { ctx, page } = await openShell("ipadl", { shell: false });
  await page.goto(BASE + "/home");
  await page.waitForTimeout(8000);
  console.log(page.url());
  await ctx.close();
})();

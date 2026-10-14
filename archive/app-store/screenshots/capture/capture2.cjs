// node capture2.cjs <iphone|ipadl> [onlyShotName]
// 1) Render each screen as the iOS shell shows it (status-bar inset composited) -> out2/<dev>/raw
// 2) Frame it with a caption for the App Store -> out2/<dev>/framed
const { BASE, openShell } = require("./lib.cjs");
const fs = require("fs");
const { THEMES } = require("./themes.cjs");
const THEME = THEMES.pastel;
const path = require("path");

// Notebook paths come from the environment (they are private to the capturing account):
// SHOT_NB_CODING, SHOT_NB_CPSC, SHOT_NB_AZ, SHOT_NB_AGENTS = notebook ids.
const nb = (key) => {
  const id = process.env[`SHOT_NB_${key}`];
  if (!id) throw new Error(`Set SHOT_NB_${key} to a notebook id`);
  return `/notebook/${id}`;
};
const NB = {
  get coding() { return nb("CODING"); },
  get cpsc() { return nb("CPSC"); },
  get az() { return nb("AZ"); },
  get agents() { return nb("AGENTS"); },
};
const SHELL_BG = "#F5F1E6"; // apps/mobile/app/index.tsx SHELL_BACKGROUND_LIGHT
const settle = (page, ms = 2500) => page.waitForTimeout(ms);

// ---------- page helpers ----------
async function polish(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 && el.children.length === 0 && el.textContent.trim() === "Pro") {
        (el.closest("a,button") || el).style.display = "none";
      }
    }
  });
}

async function tab(page, ctx, name) {
  if (!ctx.isPhone) return;
  await page.getByRole("button", { name, exact: true }).first().click();
  await settle(page, 2000);
}

async function sourcesPanel(page, ctx, open) {
  if (ctx.isPhone) return;
  const reopen = page.getByRole("button", { name: "Open Sources", exact: true });
  const close = page.getByRole("button", { name: "Close sources panel" });
  await reopen.or(close).first().waitFor({ state: "visible", timeout: 15000 });
  const collapsed = await reopen.isVisible().catch(() => false);
  if (open && collapsed) await reopen.click({ timeout: 5000 });
  if (!open && !collapsed) await page.getByRole("button", { name: "Close sources panel" }).click({ timeout: 5000 });
  await settle(page, 1000);
}

async function studioPanel(page, ctx, open) {
  if (ctx.isPhone) return;
  const reopen = page.getByRole("button", { name: "Open Studio", exact: true });
  const collapsed = await reopen.isVisible().catch(() => false);
  if (open && collapsed) await reopen.click({ timeout: 5000 });
  if (!open && !collapsed) await page.getByRole("button", { name: "Close Studio panel" }).click({ timeout: 5000 });
  await settle(page, 1000);
}

/** Drag a panel separator so its x lands at `x` (css px). */
async function dragSeparator(page, testId, x) {
  // react-resizable-panels drops data-testid; separators render as role=separator in DOM order.
  const seps = page.locator('[role="separator"]');
  const sep = testId === "notebook-sources-separator" ? seps.first() : seps.last();
  const box = await sep.boundingBox({ timeout: 5000 }).catch(() => null);
  if (!box) return;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move((box.x + x) / 2, y, { steps: 8 });
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
  await settle(page, 800);
}

/** iPad layout: { sources: false | px, studio: false | px } (studio px = its width). */
async function layout(page, ctx, wide, narrow) {
  if (ctx.isPhone) return;
  // `wide` is tuned on the 1376 pt iPad. Narrower landscape screens (Duo) take `narrow` verbatim,
  // or else the wide layout scaled, keeping at most two panels.
  let { sources, studio } = wide;
  if (ctx.device.screen.width < 1100) {
    if (narrow) ({ sources, studio } = narrow);
    else {
      const k = ctx.device.screen.width / 1376;
      if (sources && studio) sources = false;
      if (studio) studio = Math.round(studio * k);
      if (sources) sources = Math.min(sources, 360);
    }
  }
  // Studio first: toggling it swaps the saved panel layout, which can reopen Sources.
  await studioPanel(page, ctx, studio !== false);
  await sourcesPanel(page, ctx, sources !== false);
  if (sources) await dragSeparator(page, "notebook-sources-separator", sources);
  if (studio) await dragSeparator(page, "notebook-studio-separator", ctx.device.screen.width - studio);
}

/** Scroll the nearest scroll container so the element with `text` sits `offset` px below its top. */
async function scrollToText(page, text, offset = 12) {
  await page.evaluate(
    ({ text, offset }) => {
      const els = [...document.querySelectorAll("body *")].filter(
        (e) =>
          e.children.length === 0 &&
          e.textContent.trim().toLowerCase() === text.toLowerCase() &&
          e.getBoundingClientRect().width > 0
      );
      const el = els[els.length - 1];
      if (!el) return;
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY)))
        sc = sc.parentElement;
      if (!sc) return;
      sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - offset;
    },
    { text, offset }
  );
  await settle(page, 800);
}

async function openThread(page, ctx, title) {
  await tab(page, ctx, "Chat");
  await page.getByRole("button", { name: "Thread history" }).first().click();
  await settle(page, 1200);
  await page.getByText(title, { exact: true }).first().click();
  await settle(page, 4000);
}

/** Multi-panel layouts: show a real conversation in the chat panel beside Studio. */
async function chatBeside(page, ctx, title) {
  if (ctx.isPhone) return;
  await openThread(page, ctx, title);
}

async function openStudioItem(page, ctx, title) {
  await tab(page, ctx, "Studio");
  await page.getByText(title, { exact: true }).first().click();
  await settle(page, 3500);
}

async function openCitation(page, refId, nth = 0) {
  // Keep the question in view: chat scrolled to its top, then tap a chip lower in the answer so
  // its card opens over the answer body, not over the question.
  await scrollToText(page, "Searched sources for", 0).catch(() => {});
  await page.evaluate(() => {
    const el = document.querySelector("[data-citation-chip]");
    let sc = el && el.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY)))
      sc = sc.parentElement;
    if (sc) sc.scrollTop = 0;
  });
  await settle(page, 600);
  await page.locator(`[data-citation-chip][data-ref-id="${refId}"]`).nth(nth).click();
  await settle(page, 1500);
}

// ---------- shots ----------
const SHOTS = [
  {
    name: "01-chat",
    path: NB.coding,
    title: "Chat with your notes",
    sub: "Every answer cites its source",
    run: async (page, ctx) => {
      await layout(page, ctx, { sources: 340, studio: false }, { sources: false, studio: false });
      await tab(page, ctx, "Chat");
      // iPhone: the second "3" chip sits low enough for the card to open between it and the question.
      const narrow = ctx.device.screen.width < 500;
      await openCitation(page, narrow ? 3 : 15, narrow ? 1 : 0);
    },
  },
  {
    name: "02-flashcards",
    path: NB.cpsc,
    title: "Flashcards from any lecture",
    sub: "Spaced repetition built in",
    run: async (page, ctx) => {
      await layout(page, ctx, { sources: false, studio: 700 });
      await chatBeside(page, ctx, "How Large Language Models Are Built");
      await openStudioItem(page, ctx, "NLP Fundamentals: Definitions of NLP, NER, and Dependency Parsing");
      await page.getByText("Define natural language processing (NLP).", { exact: true }).first().click();
      await settle(page, 1500);
    },
  },
  {
    name: "03-written-questions",
    path: NB.az,
    title: "Practice exam questions",
    sub: "Written answers graded with feedback",
    run: async (page, ctx) => {
      await layout(page, ctx, { sources: false, studio: 760 });
      await openStudioItem(page, ctx, "Zero Trust, Entra Connect, and Defender for Cloud Capabilities");
      await scrollToText(page, "Short answer", ctx.isPhone ? 10 : 14);
    },
  },
  {
    name: "04-literature-review",
    path: NB.agents,
    title: "Literature reviews in minutes",
    sub: "Search, screen and compare research papers",
    run: async (page, ctx) => {
      await layout(page, ctx, { sources: false, studio: false });
      await openThread(page, ctx, "AI Agent Development: Best Practices for Effective Design and Deployment");
      if (ctx.isPhone) {
        await scrollToText(page, "Screening the selected studies", 8);
      } else {
        await page.getByText("Best Practices for Building AI Agents: Evidence Table", { exact: true }).last().click();
        await settle(page, 3000);
        const W = ctx.device.screen.width;
        await dragSeparator(page, "notebook-studio-separator", W < 1100 ? W - 620 : W - 760);
        await scrollToText(page, "Found 271 papers", 10);
      }
    },
  },
  {
    name: "05-sources",
    path: NB.coding,
    title: "Bring any source",
    sub: "PDFs, slides, YouTube videos and web pages",
    run: async (page, ctx) => {
      await layout(page, ctx, { sources: 470, studio: false }, { sources: 380, studio: false });
      await tab(page, ctx, "Sources");
    },
  },
  {
    name: "06-quiz",
    path: NB.cpsc,
    title: "Quiz yourself before the exam",
    sub: "Multiple-choice quizzes with hints",
    run: async (page, ctx) => {
      await layout(page, ctx, { sources: false, studio: 700 });
      await openStudioItem(page, ctx, "Natural Language Processing for Casual Email Intent Extraction");
      // Answer the open question so the shot shows the graded state, not a blank quiz.
      // The answer persists, so later runs find it already answered (options disabled).
      await page.getByText("Computational Linguistics", { exact: true }).first().click({ timeout: 3000 }).catch(() => {});
      await settle(page, 2000);
      // Leave ~380 pt below the card start so the explanation shows on every screen height.
      await scrollToText(page, "explanation", ctx.device.screen.height - 380);
    },
  },
  {
    name: "07-studio",
    path: NB.coding,
    title: "One tap, eight study tools",
    sub: "Audio overviews, mind maps and more",
    run: async (page, ctx) => {
      await layout(page, ctx, { sources: 330, studio: 520 }, { sources: false, studio: 470 });
      await tab(page, ctx, "Studio");
    },
  },
  {
    name: "08-study-guide",
    path: NB.cpsc,
    title: "Study guides & summaries",
    sub: "Reports written from your course materials",
    run: async (page, ctx) => {
      await layout(page, ctx, { sources: false, studio: 820 });
      await chatBeside(page, ctx, "How Large Language Models Are Built");
      await openStudioItem(page, ctx, "17 - NLP");
    },
  },
];

// ---------- composition ----------
function icons() {
  return `
    <svg width="19" height="12" viewBox="0 0 19 12"><g fill="#000">
      <rect x="0" y="8" width="3.2" height="4" rx="0.8"/><rect x="5" y="5.5" width="3.2" height="6.5" rx="0.8"/>
      <rect x="10" y="3" width="3.2" height="9" rx="0.8"/><rect x="15" y="0" width="3.2" height="12" rx="0.8"/></g></svg>
    <svg width="17" height="12" viewBox="0 0 17 12"><g fill="#000">
      <path d="M8.5 2.3c2.4 0 4.6.9 6.2 2.5l1.2-1.2C13.9 1.6 11.3.6 8.5.6S3.1 1.6 1.1 3.6l1.2 1.2C3.9 3.2 6.1 2.3 8.5 2.3z"/>
      <path d="M8.5 5.6c1.5 0 2.9.6 3.9 1.6l1.2-1.2C12.3 4.6 10.5 3.9 8.5 3.9S4.7 4.6 3.4 6l1.2 1.2c1-1 2.4-1.6 3.9-1.6z"/>
      <path d="M8.5 8.9c.6 0 1.1.2 1.6.6L8.5 11.2 6.9 9.5c.5-.4 1-.6 1.6-.6z"/></g></svg>
    <svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="#000" stroke-opacity="0.4"/>
      <rect x="2" y="2" width="20" height="9" rx="2.5" fill="#000"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="#000" fill-opacity="0.4"/></svg>`;
}

function statusBarHtml(device, isPhone) {
  const font = "-apple-system,'SF Pro Text','Segoe UI',sans-serif";
  if (isPhone) {
    return `<div style="height:${device.statusBar}px;background:${SHELL_BG};display:flex;align-items:center;justify-content:space-between;padding:6px 30px 0 52px;box-sizing:border-box">
      <span style="font:600 17px ${font};letter-spacing:-0.2px">9:41</span><span style="display:flex;gap:6px;align-items:center">${icons()}</span></div>`;
  }
  return `<div style="height:${device.statusBar}px;background:${SHELL_BG};display:flex;align-items:center;justify-content:space-between;padding:0 20px;box-sizing:border-box">
    <span style="font:600 13px ${font}">9:41&nbsp;&nbsp;Tue Oct 14</span><span style="display:flex;gap:6px;align-items:center">${icons()}</span></div>`;
}

const HEAD = `<head><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Baskerville:wght@700&display=block" rel="stylesheet"></head>`;

function frameHtml(device, isPhone, screenPng, shot) {
  const W = device.screen.width;
  const H = device.screen.height;
  const img = `data:image/png;base64,${screenPng.toString("base64")}`;
  const bg = THEME.bg(SHOTS.indexOf(shot));
  if (isPhone) {
    // Proportions tuned on the 393 pt iPhone; the Duo scales them. Taller-than-wide only.
    const k = W / 393;
    const sw = Math.round(W * 0.82);
    const sh = Math.round((sw * H) / W);
    const top = Math.round(W > 500 ? 150 : 186 * k);
    return `<html>${HEAD}<body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${bg};position:relative">
      <div style="position:absolute;top:${Math.round(W > 500 ? 44 : 58 * k)}px;left:${24 * k}px;right:${24 * k}px;text-align:center">
        <div style="font:700 ${W > 500 ? 36 : 29}px/1.18 'Libre Baskerville',serif;color:${THEME.title};letter-spacing:-0.3px;text-wrap:balance">${shot.title}</div>
        <div style="margin-top:12px;font:500 ${W > 500 ? 18 : 15}px/1.35 Inter,sans-serif;color:${THEME.sub}">${shot.sub}</div>
      </div>
      <div style="position:absolute;top:${top}px;left:${(W - sw) / 2 - 7}px;width:${sw}px;height:${sh}px;padding:7px;border-radius:${W > 500 ? 40 : 52}px;background:#1c1510;box-shadow:0 24px 60px rgba(0,0,0,.3)">
        <img src="${img}" style="display:block;width:${sw}px;height:${sh}px;border-radius:${W > 500 ? 33 : 45}px">
      </div></body></html>`;
  }
  const k = W / 1376; // tuned on the iPad 13" landscape
  const sw = Math.round(1120 * k);
  const sh = Math.round((sw * H) / W);
  return `<html>${HEAD}<body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${bg};position:relative">
    <div style="position:absolute;top:${Math.round(40 * k)}px;left:40px;right:40px;text-align:center">
      <div style="font:700 ${Math.round(40 * Math.max(k, 0.8))}px/1.15 'Libre Baskerville',serif;color:${THEME.title};letter-spacing:-0.4px;text-wrap:balance">${shot.title}</div>
      <div style="margin-top:${Math.round(12 * k)}px;font:500 ${Math.round(19 * Math.max(k, 0.85))}px/1.35 Inter,sans-serif;color:${THEME.sub}">${shot.sub}</div>
    </div>
    <div style="position:absolute;top:${Math.round(168 * k)}px;left:${(W - sw) / 2 - Math.round(12 * k)}px;width:${sw}px;height:${sh}px;padding:${Math.round(12 * k)}px;border-radius:${Math.round(40 * k)}px;background:#1c1510;box-shadow:0 30px 80px rgba(0,0,0,.3)">
      <img src="${img}" style="display:block;width:${sw}px;height:${sh}px;border-radius:${Math.round(28 * k)}px">
    </div></body></html>`;
}

(async () => {
  const [deviceName, only] = process.argv.slice(2);
  const isPhone = deviceName === "iphone" || deviceName === "duo"; // tabbed layout under 768 pt
  const rawDir = path.join(__dirname, "out2", deviceName, "raw");
  const framedDir = path.join(__dirname, "out2", deviceName, "framed");
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(framedDir, { recursive: true });
  const { ctx: bctx, page, device } = await openShell(deviceName);
  const composer = await bctx.newPage();
  await composer.setViewportSize(device.screen);
  const clip = { x: 0, y: 0, width: device.screen.width, height: device.screen.height };
  const ctx = { isPhone, device };

  for (const shot of SHOTS) {
    if (only && shot.name !== only) continue;
    await page.goto(BASE + shot.path);
    await settle(page, 5000);
    await shot.run(page, ctx);
    await polish(page);
    await settle(page, 600);
    const app = await page.screenshot({ scale: "device" });

    await composer.setContent(
      `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${SHELL_BG}">${statusBarHtml(device, isPhone)}
       <img style="display:block;width:${device.screen.width}px;height:${device.screen.height - device.statusBar}px" src="data:image/png;base64,${app.toString("base64")}"></body></html>`
    );
    await composer.waitForTimeout(200);
    const screen = await composer.screenshot({ path: path.join(rawDir, `${shot.name}.png`), scale: "device", clip });

    await composer.setContent(frameHtml(device, isPhone, screen, shot), { waitUntil: "networkidle" });
    await composer.evaluate(() => document.fonts.ready);
    await composer.waitForTimeout(300);
    await composer.screenshot({ path: path.join(framedDir, `${shot.name}.png`), scale: "device", clip });
    console.log("saved", shot.name);
  }
  await bctx.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

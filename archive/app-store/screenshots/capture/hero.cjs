// node hero.cjs [outDir=../header-and-search] : App Store product-page header (3840x1646) and search-results asset (3840x2560)
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const here = __dirname;
const repo = path.resolve(__dirname, "../../../..");
const img = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
const raw = (n) => img(path.join(here, "../raw/iphone-6.3", `${n}.png`));
const LOGO = img(path.join(repo, "apps/mobile/assets/images/splash-icon.png"));

const HEAD = `<head><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600&family=Libre+Baskerville:wght@700&display=block" rel="stylesheet"></head>`;

// Phone frame at css width w (screen aspect 1179:2556).
const phone = (src, w, style = "") => {
  const h = Math.round((w * 2556) / 1179);
  const pad = Math.round(w * 0.022);
  return `<div style="position:absolute;${style};width:${w}px;height:${h}px;padding:${pad}px;border-radius:${Math.round(w * 0.16)}px;background:#1c1510;box-shadow:0 ${Math.round(w * 0.08)}px ${Math.round(w * 0.2)}px rgba(60,40,20,.28)">
    <img src="${src}" style="display:block;width:${w}px;height:${h}px;border-radius:${Math.round(w * 0.14)}px"></div>`;
};

const BG = `radial-gradient(60% 90% at 88% 30%, #E6C3BB 0%, rgba(230,195,187,0) 70%),
  radial-gradient(55% 80% at 70% 100%, #B8CBE0 0%, rgba(184,203,224,0) 70%),
  radial-gradient(50% 70% at 100% 95%, #C3E0CB 0%, rgba(195,224,203,0) 70%), #F5F1E6`;

function header() {
  // 1920 x 823 css @2x = 3840 x 1646. Keep text inside the middle ~80% (crop-safe).
  return `<html>${HEAD}<body style="margin:0;width:1920px;height:823px;overflow:hidden;position:relative;background:${BG}">
    <div style="position:absolute;left:240px;top:200px;width:820px">
      <div style="display:flex;align-items:center;gap:26px">
        <img src="${LOGO}" style="width:120px;height:120px">
        <div style="font:700 76px/1 'Libre Baskerville',serif;color:#2B211A;letter-spacing:-1px">SolomindLM</div>
      </div>
      <div style="margin-top:38px;font:700 44px/1.2 'Libre Baskerville',serif;color:#2B211A;text-wrap:balance">Your AI study &amp; research notebook</div>
      <div style="margin-top:22px;font:500 26px/1.45 Inter,sans-serif;color:#6E5547;max-width:720px">Chat with your notes, make flashcards and quizzes in one tap, and run literature reviews that cite every source.</div>
    </div>
    ${phone(raw("02-flashcards"), 280, "left:1130px;top:160px;transform:rotate(-6deg)")}
    ${phone(raw("01-chat"), 310, "left:1340px;top:96px;z-index:2")}
    ${phone(raw("04-literature-review"), 280, "left:1570px;top:160px;transform:rotate(6deg)")}
  </body></html>`;
}

function search() {
  // 1920 x 1280 css @2x = 3840 x 2560 (3:2). Big type: this shows small in search results.
  return `<html>${HEAD}<body style="margin:0;width:1920px;height:1280px;overflow:hidden;position:relative;background:${BG}">
    <div style="position:absolute;left:0;right:0;top:86px;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:22px">
        <img src="${LOGO}" style="width:96px;height:96px">
        <div style="font:700 60px/1 'Libre Baskerville',serif;color:#2B211A">SolomindLM</div>
      </div>
      <div style="margin-top:34px;font:700 78px/1.12 'Libre Baskerville',serif;color:#2B211A;letter-spacing:-1px">Study smarter from your own notes</div>
      <div style="margin-top:22px;font:600 34px/1.3 Inter,sans-serif;color:#6E5547">Cited answers · Flashcards · Quizzes · Literature reviews</div>
    </div>
    ${phone(raw("02-flashcards"), 330, "left:420px;top:560px;transform:rotate(-5deg)")}
    ${phone(raw("01-chat"), 360, "left:780px;top:500px;z-index:2")}
    ${phone(raw("04-literature-review"), 330, "left:1170px;top:560px;transform:rotate(5deg)")}
  </body></html>`;
}

(async () => {
  const outDir = process.argv[2] || path.join(here, "../header-and-search");
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  for (const [name, html, w, h] of [
    ["header-3840x1646", header(), 1920, 823],
    ["search-results-3840x2560", search(), 1920, 1280],
  ]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.setContent(html, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(outDir, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h } });
    await p.close();
    console.log("saved", name);
  }
  await b.close();
})();

/**
 * Dev screenshot + measure helper. Not shipped.
 *   node scripts/shot.mjs <url> <out.png> <width> <height> [cookieFile] [selectorsToMeasure]
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";

const [, , url, out, w = "1440", h = "900", cookieFile, measure] = process.argv;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 2 });

if (cookieFile && cookieFile !== "-") {
  const raw = readFileSync(cookieFile, "utf8").trim();
  const host = new URL(url).hostname;
  const cookies = raw.split(";").filter(Boolean).map((p) => {
    const i = p.indexOf("=");
    return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), domain: host, path: "/" };
  });
  await page.setCookie(...cookies);
}

await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));

if (measure) {
  const sels = measure.split(",");
  const rects = await page.evaluate((sels) => {
    const vw = window.innerWidth;
    return sels.map((s) => {
      const el = document.querySelector(s);
      if (!el) return { s, missing: true };
      const r = el.getBoundingClientRect();
      return { s, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), leftGap: Math.round(r.left), rightGap: Math.round(vw - r.right), vw };
    });
  }, sels);
  console.log(JSON.stringify(rects, null, 2));
}

await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("shot", out);

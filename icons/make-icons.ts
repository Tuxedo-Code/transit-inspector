// Regenerates the extension icons from the SVGs next to this file: `node icons/make-icons.ts`.
// The PNGs are committed; the build copies the ones manifest.json lists into dist/.
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer";

// [size, padding, source]. 16px drops the colon, which smears at that size. 128px keeps 16px of transparent
// padding around a 96px icon, as the Chrome Web Store asks.
const ICONS: [number, number, string][] = [
  [16, 0, "icon-16.svg"],
  [32, 1, "icon.svg"],
  [48, 2, "icon.svg"],
  [128, 16, "icon.svg"],
];

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [size, padding, source] of ICONS) {
    const svg = readFileSync(new URL(source, import.meta.url)).toString("base64");
    const inner = size - 2 * padding;
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>html, body { margin: 0; background: transparent; }</style>` +
        `<img src="data:image/svg+xml;base64,${svg}" width="${inner}" height="${inner}" ` +
        `style="position: absolute; left: ${padding}px; top: ${padding}px">`,
    );
    await page.$eval("img", (img) => img.decode());
    await page.screenshot({ path: new URL(`${size}.png`, import.meta.url).pathname, omitBackground: true });
  }
} finally {
  await browser.close();
}

import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SITE = resolve(ROOT, "site");
const WORKFLOW = resolve(ROOT, ".github/workflows/pages.yml");
const errors = [];
const fail = (message) => errors.push(message);
const required = [
  "index.html", "404.html", ".nojekyll", "robots.txt", "sitemap.xml", "site.webmanifest",
  "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
  "og-image.png", "assets/styles.css", "assets/app.js",
];
for (const file of required) {
  try { statSync(resolve(SITE, file)); }
  catch { fail(`missing deployment file: site/${file}`); }
}

const html = readFileSync(resolve(SITE, "index.html"), "utf8");
const css = readFileSync(resolve(SITE, "assets/styles.css"), "utf8");
const app = readFileSync(resolve(SITE, "assets/app.js"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(SITE, "site.webmanifest"), "utf8"));
const workflow = readFileSync(WORKFLOW, "utf8");
try { new Function(app); } catch (error) { fail(`app.js syntax: ${error.message}`); }
const actionRefs = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/g)].map((match) => match[1]);
if (actionRefs.length !== 4 || actionRefs.some((ref) => !/^[0-9a-f]{40}$/.test(ref))) fail("Pages workflow actions are not all pinned to full commit SHAs");
if (!workflow.includes("pages: write") || !workflow.includes("id-token: write") || !workflow.includes("path: site")) fail("Pages workflow permissions or artifact path are incomplete");

if (!html.startsWith("<!doctype html>")) fail("index.html has no HTML5 doctype");
if (!html.includes('<html lang="en">')) fail("index.html has no language");
if ((html.match(/<h1[ >]/g) ?? []).length !== 1) fail("index.html must contain exactly one h1");
if (/<style(?:\s|>)/i.test(html)) fail("index.html contains an inline style block");
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) fail("index.html contains inline executable JavaScript");
if (!html.includes('Content-Security-Policy')) fail("index.html has no Content Security Policy");
if (!html.includes("connect-src 'none'")) fail("CSP does not prohibit network connections");
if (!html.includes('rel="canonical" href="https://yuvis003.github.io/api-security-maze/"')) fail("canonical URL is missing or wrong");
if (!html.includes('rel="icon" href="./favicon.svg"')) fail("SVG favicon is not linked");
if (!html.includes('rel="apple-touch-icon"')) fail("Apple touch icon is not linked");
if (!html.includes('property="og:image"')) fail("Open Graph image is not configured");
if (/file:\/\//i.test(html)) fail("deployment contains a local file URL");
if (/(?:INTERACTIVE_EXPLAINER|RATE_LIMITING_ARTICLE|DATABASE_SCALING_ARTICLE)_URL/.test(html)) fail("deployment contains an unresolved URL placeholder");
if (/<script[^>]+src=["']https?:/i.test(html) || /<img[^>]+src=["']https?:/i.test(html) || /<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i.test(html)) fail("deployment loads an external script, image, or stylesheet");

for (const id of ["play", "enemies", "build", "quiz"]) if (!html.includes(`id="${id}"`)) fail(`section #${id} missing`);
if ((html.match(/<option value="/g) ?? []).length !== 19) fail("game must offer one legitimate request plus 18 attacks");
if ((html.match(/data-gate="/g) ?? []).length !== 7) fail("game must expose seven defensive gates");
if ((app.match(/\n  [a-z]+:\{n:\d+/g) ?? []).length !== 18) fail("app must define exactly 18 attacks");
if ((app.match(/\n  \["/g) ?? []).length < 15) fail("app content arrays appear incomplete");
for (const api of [/\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /new\s+WebSocket\s*\(/, /new\s+EventSource\s*\(/]) {
  if (api.test(app)) fail(`app unexpectedly contains network API: ${api}`);
}
if (!app.includes("drawCorridor(ctx,ROUTE") || app.includes("const walls=") || app.includes("setLineDash([3,11])")) fail("clean corridor-first geometry guard failed");
if (!css.includes("body{margin:0;background:#000")) fail("true-black page theme is missing");
for (const oldColor of ["#06040f", "#0d0820", "#151033", "#0e0a24"]) if (css.toLowerCase().includes(oldColor)) fail(`legacy navy surface remains: ${oldColor}`);

const localRefs = [...html.matchAll(/(?:src|href)=["'](\.\/[^"'#?]+)["']/g)].map((match) => match[1]);
for (const ref of localRefs) {
  try { statSync(resolve(SITE, ref)); }
  catch { fail(`broken local resource: ${ref}`); }
}

function pngDimensions(file) {
  const data = readFileSync(resolve(SITE, file));
  if (data.toString("ascii", 1, 4) !== "PNG") throw new Error(`${file} is not PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
for (const [file, width, height] of [
  ["favicon-32.png", 32, 32], ["apple-touch-icon.png", 180, 180],
  ["icon-192.png", 192, 192], ["icon-512.png", 512, 512], ["og-image.png", 1920, 1080],
]) {
  try {
    const [actualWidth, actualHeight] = pngDimensions(file);
    if (actualWidth !== width || actualHeight !== height) fail(`${file} is ${actualWidth}x${actualHeight}; expected ${width}x${height}`);
  } catch (error) { fail(error.message); }
}
if (!readFileSync(resolve(SITE, "favicon.svg"), "utf8").includes("<title")) fail("favicon SVG has no accessible title");
if (manifest.start_url !== "./" || manifest.theme_color !== "#000000" || manifest.icons?.length !== 2) fail("web manifest is incomplete");
if (!readFileSync(resolve(SITE, "robots.txt"), "utf8").includes("sitemap.xml")) fail("robots.txt does not identify the sitemap");
if (!readFileSync(resolve(SITE, "sitemap.xml"), "utf8").includes("https://yuvis003.github.io/api-security-maze/")) fail("sitemap URL is wrong");

function walk(directory) {
  let bytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    const stats = lstatSync(full);
    if (stats.isSymbolicLink()) fail(`deployment artifact contains symlink: ${full.replace(`${ROOT}/`, "")}`);
    else if (entry.isDirectory()) bytes += walk(full);
    else bytes += stats.size;
  }
  return bytes;
}
const bytes = walk(SITE);
if (bytes > 3_000_000) fail(`deployment is ${(bytes / 1_000_000).toFixed(2)} MB; expected under 3 MB`);

if (errors.length) {
  console.error(errors.map((error) => `FAIL  ${error}`).join("\n"));
  process.exit(1);
}
console.log("site validation passed");
console.log("  18 attacks • 7 defenses • 4 sections • no network APIs");
console.log("  strict CSP • canonical/OG metadata • favicon + install icons");
console.log(`  ${(bytes / 1024).toFixed(1)} KiB deployment • no symlinks • all local resources resolve`);

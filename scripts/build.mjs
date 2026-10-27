import {
  copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = resolve(ROOT, "src");
const SITE = resolve(ROOT, "site");
const ASSETS = resolve(SITE, "assets");
const config = JSON.parse(readFileSync(resolve(ROOT, "site.config.json"), "utf8"));
const source = readFileSync(resolve(SRC, "arcade.html"), "utf8");

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function requireHttps(value, name, { allowEmpty = false } = {}) {
  if (!value && allowEmpty) return "";
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  return parsed.href;
}

const canonicalUrl = requireHttps(config.url, "url");
const repositoryUrl = requireHttps(config.repository, "repository");
const rateUrl = requireHttps(config.rateLimitingArticleUrl, "rateLimitingArticleUrl", { allowEmpty: true });
const databaseUrl = requireHttps(config.databaseScalingArticleUrl, "databaseScalingArticleUrl", { allowEmpty: true });
const socialImageUrl = new URL("og-image.png", canonicalUrl).href;
const basePath = new URL(canonicalUrl).pathname;
const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
if (!styleMatch || !scriptMatch) throw new Error("src/arcade.html must contain exactly one inline style and script block");
if ((source.match(/<style>/g) ?? []).length !== 1 || (source.match(/<script>/g) ?? []).length !== 1) throw new Error("Unexpected additional inline style or script block");

let css = `${styleMatch[1].trim()}\n\n/* Standalone Pages additions. */\n.link-grid .link-placeholder{padding:12px;border:1px dashed var(--line);border-radius:8px;background:#080808;color:var(--dim)}\n.repo-link{margin-top:18px}\n.not-found{min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px;background:#000}.not-found h1{font-size:clamp(50px,10vw,100px);margin:0;color:var(--yellow)}.not-found p{color:var(--muted)}\n`;
const app = `"use strict";\n${scriptMatch[1].replace(/^\s*["']use strict["'];?\s*/, "").trim()}\n`;

const metadata = `<meta name="description" content="${escapeHtml(config.description)}">
<meta name="theme-color" content="#000000">
<meta name="color-scheme" content="dark">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; connect-src 'none'; img-src 'self' data:; media-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'none'; manifest-src 'self'">
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<link rel="icon" href="./favicon.svg" type="image/svg+xml">
<link rel="icon" href="./favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="./apple-touch-icon.png">
<link rel="manifest" href="./site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="API Security Maze">
<meta property="og:title" content="${escapeHtml(config.title)}">
<meta property="og:description" content="${escapeHtml(config.description)}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:image" content="${escapeHtml(socialImageUrl)}">
<meta property="og:image:width" content="1920">
<meta property="og:image:height" content="1080">
<meta property="og:image:alt" content="Black arcade maze introducing 18 Node.js API attacks and seven defensive gates">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(config.title)}">
<meta name="twitter:description" content="${escapeHtml(config.description)}">
<meta name="twitter:image" content="${escapeHtml(socialImageUrl)}">`;

let html = source
  .replace(/<meta name="description"[^>]*>/, metadata)
  .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(config.title)}</title>`)
  .replace(styleMatch[0], '<link rel="stylesheet" href="./assets/styles.css">')
  .replace(scriptMatch[0], '<script src="./assets/app.js" defer></script>')
  .replace('href="INTERACTIVE_EXPLAINER_URL"', `href="${escapeHtml(canonicalUrl)}"`);

function articleLink(slot, label, value) {
  const pattern = new RegExp(`<a href="${slot}">[^<]*<\\/a>`);
  const replacement = value
    ? `<a href="${escapeHtml(value)}">${escapeHtml(label)}</a>`
    : `<span class="link-placeholder">${escapeHtml(label)} — add URL in site.config.json</span>`;
  html = html.replace(pattern, replacement);
}
articleLink("RATE_LIMITING_ARTICLE_URL", "Rate-limiting article", rateUrl);
articleLink("DATABASE_SCALING_ARTICLE_URL", "Database-scaling article", databaseUrl);
html = html.replace(
  '<p class="fine">',
  `<p class="repo-link"><a href="${escapeHtml(repositoryUrl)}">View the source on GitHub</a></p><p class="fine">`,
);

rmSync(SITE, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });
writeFileSync(resolve(SITE, "index.html"), html);
writeFileSync(resolve(ASSETS, "styles.css"), css);
writeFileSync(resolve(ASSETS, "app.js"), app);
for (const file of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "og-image.png"]) {
  copyFileSync(resolve(SRC, file), resolve(SITE, file));
}
writeFileSync(resolve(SITE, ".nojekyll"), "");
writeFileSync(resolve(SITE, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", canonicalUrl).href}\n`);
writeFileSync(resolve(SITE, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(canonicalUrl)}</loc></url></urlset>\n`);
writeFileSync(resolve(SITE, "site.webmanifest"), `${JSON.stringify({
  name: "API Security Maze",
  short_name: "Security Maze",
  description: config.description,
  start_url: "./",
  display: "standalone",
  background_color: "#000000",
  theme_color: "#000000",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
  ],
}, null, 2)}\n`);
writeFileSync(resolve(SITE, "404.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; object-src 'none'; connect-src 'none'; script-src 'none'; style-src 'self'"><link rel="icon" href="${basePath}favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${basePath}assets/styles.css"><title>Maze not found</title></head><body><main class="not-found"><div><p class="eyebrow">Wrong corridor</p><h1>404</h1><p>This route does not lead to the API vault.</p><a class="btn primary" href="${basePath}">Return to the maze</a></div></main></body></html>\n`);

console.log(`Built ${canonicalUrl} into site/`);
console.log(rateUrl && databaseUrl ? "Companion article links enabled" : "Companion article links remain visibly disabled until configured");

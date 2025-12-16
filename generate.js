import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { COLORS } from "./const/index.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

async function githubFetch(url) {
  return fetch(url, {
    headers: {
      "User-Agent": "lang-stats",
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`
    }
  }).then(r => r.json());
}

function saveSVG(username, content) {
  const file = path.join(DATA_DIR, `${username}.svg`);
  fs.writeFileSync(file, content, "utf8");
  console.log("✔ SVG updated:", file);
}

function buildSVG({ barSegments, leftLabels, rightLabels }) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="380" height="170">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f2937"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="380" height="170" fill="url(#bgGradient)" rx="10"/>
  <text x="50%" y="25" text-anchor="middle" fill="#fff" font-size="16" font-weight="600">Top 8 Languages Used</text>

  <g transform="translate(40, 40)">${barSegments}</g>
  <g transform="translate(40, 70)">${leftLabels}</g>
  <g transform="translate(40, 70)">${rightLabels}</g>
</svg>
`;
}

async function generate(username) {
  console.log("⏳ Fetching repos for", username);

  const repos = await githubFetch(`https://api.github.com/users/${username}/repos`);
  if (!Array.isArray(repos)) return console.log("❌ Failed to fetch repos");

  let langTotals = {};

  for (const repo of repos) {
    if (!repo.languages_url) continue;

    const data = await githubFetch(repo.languages_url);
    for (const [lang, v] of Object.entries(data)) {
      langTotals[lang] = (langTotals[lang] || 0) + v;
    }
  }

  const sorted = Object.entries(langTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const total = sorted.reduce((s, x) => s + x[1], 0);

  let xOffset = 0;
  const barSegments = sorted
    .map(([lang, v]) => {
      const width = (v / total) * 300;
      const rect = `<rect x="${xOffset}" y="0" width="${width}" height="20" fill="${COLORS[lang]}" />`;
      xOffset += width;
      return rect;
    })
    .join("");

  const half = Math.ceil(sorted.length / 2);
  const left = sorted.slice(0, half);
  const right = sorted.slice(half);

  const leftLabels = left
    .map(([lang, v], i) => `<text x="0" y="${20 + i * 20}" fill="${COLORS[lang]}">● ${lang}: ${((v / total) * 100).toFixed(1)}%</text>`)
    .join("");

  const rightLabels = right
    .map(([lang, v], i) => `<text x="160" y="${20 + i * 20}" fill="${COLORS[lang]}">● ${lang}: ${((v / total) * 100).toFixed(1)}%</text>`)
    .join("");

  const svg = buildSVG({ barSegments, leftLabels, rightLabels });

  saveSVG(username, svg);
}

generate(process.env.GH_USERNAME);

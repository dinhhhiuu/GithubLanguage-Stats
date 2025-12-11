import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { COLORS } from "./const/index.js";

dotenv.config();
const app = express();

// ===============================
//  PATH cache folder
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, "cache");
const DATA_DIR = path.join(__dirname, "data");

// tạo thư mục cache nếu chưa có
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// file cache cho từng user
function cacheFile(username) {
  return path.join(CACHE_DIR, `${username}.json`);
}

function loadCache(username) {
  const file = cacheFile(username);

  if (!fs.existsSync(file)) return null;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveCache(username, data) {
  const file = cacheFile(username);

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// cache expire = 10 phút
const CACHE_TTL = 10 * 60 * 1000;

// Data
function saveSVGFile(username, svgContent) {
    const filePath = path.join(DATA_DIR, `${username}.svg`);
    fs.writeFileSync(filePath, svgContent, "utf8");
    console.log("💾 SVG saved:", filePath);
  }

  

// =========================
// GitHub fetch
// =========================
async function githubFetch(url) {
  return fetch(url, {
    headers: {
      "User-Agent": "lang-stats",
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`
    }
  }).then(r => r.json());
}

// =========================
// MAIN HANDLER
// =========================
app.get("/lang/:username", async (req, res) => {
  const username = req.params.username;

  const cache = loadCache(username);

  // dùng cache nếu còn hạn
  if (cache && (Date.now() - cache.timestamp < CACHE_TTL)) {
    console.log("⚡ File cache hit:", username);
    return sendSVG(res, cache.data, username);
  }

  console.log("🌐 Fetching GitHub API for", username);

  const repos = await githubFetch(`https://api.github.com/users/${username}/repos`);

  if (!Array.isArray(repos)) {
    return res.send(errorSVG("GitHub API error"));
  }

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
  const barSegments = sorted.map(([lang, v]) => {
    const width = (v / total) * 300;
    const rect = `<rect x="${xOffset}" y="0" width="${width}" height="20" fill="${COLORS[lang]}" />`;
    xOffset += width;
    return rect;
  }).join("");

  const half = Math.ceil(sorted.length / 2);
  const left = sorted.slice(0, half);
  const right = sorted.slice(half);

  const leftLabels = left.map(([lang, v], i) =>
    `<text x="0" y="${20 + i * 20}" fill="${COLORS[lang]}">● ${lang}: ${((v / total) * 100).toFixed(1)}%</text>`
  ).join("");

  const rightLabels = right.map(([lang, v], i) =>
    `<text x="160" y="${20 + i * 20}" fill="${COLORS[lang]}">● ${lang}: ${((v / total) * 100).toFixed(1)}%</text>`
  ).join("");

  const result = { barSegments, leftLabels, rightLabels };

  // SAVE FILE CACHE
  saveCache(username, {
    timestamp: Date.now(),
    data: result
  });

  sendSVG(res, result, username);
});

// ===================================================================
// 5) RENDER SVG
// ===================================================================
function sendSVG(res, { barSegments, leftLabels, rightLabels }, username) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="380" height="170">
      <style>
        text { font-family: Arial, sans-serif; }
      </style>

      <defs>
        <linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1f2937"/>
          <stop offset="100%" stop-color="#111827"/>
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="380" height="170" fill="url(#bgGradient)" rx="10"/>

      <text x="50%" y="25" text-anchor="middle" fill="#fff" font-size="16" font-weight="600">
        Top 8 Languages Used
      </text>

      <g transform="translate(40, 40)">
        ${barSegments}
      </g>

      <g transform="translate(40, 70)">
        ${leftLabels}
      </g>

      <g transform="translate(40, 70)">
        ${rightLabels}
      </g>
    </svg>
  `;

  saveSVGFile(username, svg);

  res.set("Content-Type", "image/svg+xml");
  res.send(svg);
}

function errorSVG(msg) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="60">
      <text x="10" y="30" fill="red" font-size="16">${msg}</text>
    </svg>
  `;
}

app.listen(3000, () => console.log("🚀 Running http://localhost:3000"));

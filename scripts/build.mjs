#!/usr/bin/env node
/**
 * 生成工具目录页。
 *
 * 扫描 apps/ 下每个含 index.html 的目录，结合 tools.json 的登记信息，
 * 生成根目录的 index.html，并额外导出一份 dist/ 用于静态托管。
 *
 * 用法：node scripts/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS_DIR = path.join(ROOT, 'apps');
const MANIFEST_FILE = path.join(ROOT, 'tools.json');
const OUTPUT_HTML = path.join(ROOT, 'index.html');
const DIST_DIR = path.join(ROOT, 'dist');

const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`⚠️  ${msg}`);
};
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

/* ------------------------------------------------------------------ 工具函数 */

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });

/** 由目录名派生一个稳定的色相，让每个工具卡片有自己的配色。 */
const hueOf = (text) => {
  let hue = 0;
  for (const ch of text) hue = (hue * 31 + ch.codePointAt(0)) % 360;
  return (hue * 47) % 360;
};

/** 目录名安全地转成 URL 中的一段路径。 */
const urlSegment = (name) => name.split('/').map(encodeURIComponent).join('/');

/* ------------------------------------------------------------------ 读取数据 */

if (!fs.existsSync(APPS_DIR)) fail(`找不到 apps 目录：${APPS_DIR}`);

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
} catch (error) {
  fail(`读取 tools.json 失败：${error.message}`);
}

const site = {
  title: 'AI 小工具集',
  subtitle: '把日常的小麻烦，做成打开就能用的页面',
  repoLabel: '',
  repoUrl: '',
  ...(manifest.site || {}),
};

/** 扫描 apps/，返回 [{ dir, htmlFile }]。 */
function scanApps() {
  const entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = entry.name;
    const htmlFile = path.join(APPS_DIR, dir, 'index.html');
    if (!fs.existsSync(htmlFile)) {
      warn(`apps/${dir}/ 里没有 index.html，已跳过`);
      continue;
    }
    found.push({ dir, htmlFile });
  }
  return found;
}

/** 从页面里兜底读取标题和描述。 */
function readPageMeta(htmlFile) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = html.match(/<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  return {
    title: title ? title[1].trim() : '',
    description: desc ? desc[1].trim() : '',
  };
}

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 4);
};

const discovered = scanApps();
const discoveredByDir = new Map(discovered.map((item) => [item.dir, item]));
const declared = Array.isArray(manifest.tools) ? manifest.tools : [];

const tools = [];
const seen = new Set();

for (const item of declared) {
  if (!item || typeof item !== 'object') {
    warn('tools.json 中存在无效的工具条目，已跳过');
    continue;
  }
  const dir = String(item.dir ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!dir) {
    warn('tools.json 中存在缺少 dir 的工具条目，已跳过');
    continue;
  }
  if (seen.has(dir)) {
    warn(`tools.json 中重复登记了 "${dir}"，只保留第一条`);
    continue;
  }
  const app = discoveredByDir.get(dir);
  if (!app) {
    warn(`tools.json 登记了 "${dir}"，但 apps/${dir}/index.html 不存在，已跳过`);
    continue;
  }
  const pageMeta = readPageMeta(app.htmlFile);
  seen.add(dir);
  tools.push({
    dir,
    name: String(item.name || pageMeta.title || dir).trim(),
    emoji: String(item.emoji || '🧩').trim(),
    description: String(item.description || pageMeta.description || '暂无简介，点击打开看看。').trim(),
    tags: normalizeTags(item.tags),
    url: `apps/${urlSegment(dir)}/index.html`,
    hue: Number.isFinite(item.hue) ? Number(item.hue) : hueOf(dir),
  });
}

// 没有登记但确实存在的工具，也一并收录，避免忘记改 tools.json 就“消失”。
for (const app of discovered) {
  if (seen.has(app.dir)) continue;
  const pageMeta = readPageMeta(app.htmlFile);
  warn(`apps/${app.dir}/ 没有在 tools.json 中登记，已按目录自动收录`);
  tools.push({
    dir: app.dir,
    name: pageMeta.title || app.dir,
    emoji: '🧩',
    description: pageMeta.description || '暂无简介，点击打开看看。',
    tags: [],
    url: `apps/${urlSegment(app.dir)}/index.html`,
    hue: hueOf(app.dir),
  });
}

if (tools.length === 0) fail('apps/ 下没有可用的工具页面，已终止。');

/* ------------------------------------------------------------------ 渲染页面 */

const renderCard = (tool) => {
  const searchText = [tool.name, tool.description, ...tool.tags, tool.dir].join(' ').toLowerCase();
  const tags = tool.tags.length
    ? `<div class="tags">${tool.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';
  return `      <a class="card" href="${escapeHtml(tool.url)}" style="--hue:${tool.hue}" data-search="${escapeHtml(searchText)}">
        <span class="icon" aria-hidden="true">${escapeHtml(tool.emoji)}</span>
        <h2>${escapeHtml(tool.name)}</h2>
        <p class="desc">${escapeHtml(tool.description)}</p>
        ${tags}
        <span class="go">打开工具 <span aria-hidden="true">↗</span></span>
      </a>`;
};

const repoLink = site.repoUrl
  ? `<a href="${escapeHtml(site.repoUrl)}" target="_blank" rel="noopener">${escapeHtml(site.repoLabel || site.repoUrl)}</a>`
  : '';

const buildDate = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html>
<!-- 本文件由 scripts/build.mjs 自动生成；请修改 tools.json 或 apps/ 后运行 npm run build -->
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(site.title)}</title>
<meta name="description" content="${escapeHtml(site.subtitle)}">
<meta name="theme-color" content="#f4f8f6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101815" media="(prefers-color-scheme: dark)">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='88'>🛠️</text></svg>">
<style>
  :root {
    color-scheme: light dark;
    --bg: #f4f8f6;
    --card: #ffffff;
    --text: #16201b;
    --muted: #61706a;
    --line: #dde7e2;
    --chip: #eef4f1;
    --accent: #2f855a;
    --shadow: 0 1px 2px rgba(16, 32, 24, .05), 0 14px 30px -20px rgba(16, 32, 24, .45);
    --glow-1: rgba(82, 183, 136, .22);
    --glow-2: rgba(64, 145, 108, .14);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #101815;
      --card: #17211d;
      --text: #e7f0ea;
      --muted: #94a79d;
      --line: #26332d;
      --chip: #1e2b25;
      --accent: #6ec99a;
      --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 16px 32px -22px rgba(0, 0, 0, .8);
      --glow-1: rgba(110, 201, 154, .13);
      --glow-2: rgba(64, 145, 108, .12);
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: clamp(22px, 5vw, 56px) clamp(16px, 4vw, 32px) 40px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(70ch 48ch at 10% -10%, var(--glow-1), transparent 70%),
      radial-gradient(60ch 40ch at 95% 0%, var(--glow-2), transparent 65%);
    pointer-events: none;
  }
  .wrap { max-width: 1040px; margin: 0 auto; }
  .hero-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .logo {
    display: inline-flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; font-size: 20px; border-radius: 12px;
    background: var(--card); border: 1px solid var(--line); box-shadow: var(--shadow);
  }
  .badge {
    font-size: 12px; color: var(--muted); background: var(--card);
    border: 1px solid var(--line); border-radius: 999px; padding: 3px 11px;
  }
  h1 {
    margin-top: 18px; font-size: clamp(28px, 4.6vw, 44px); font-weight: 800;
    letter-spacing: -.025em; line-height: 1.15;
  }
  h1 .grad {
    background: linear-gradient(100deg, var(--accent), #7ab55c 60%, #4c9e7a);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .sub { color: var(--muted); margin-top: 10px; font-size: clamp(14px, 2.6vw, 16px); }
  .search {
    display: flex; align-items: center; gap: 10px; margin-top: 28px;
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 12px 14px; box-shadow: var(--shadow);
    transition: border-color .18s, box-shadow .18s;
  }
  .search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(47, 133, 90, .16);
  }
  .search .icon-search { font-size: 15px; opacity: .55; }
  .search input {
    flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
    font: inherit; font-size: 15px; color: inherit;
  }
  .search input::-webkit-search-cancel-button { cursor: pointer; }
  .search kbd {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11px; color: var(--muted); border: 1px solid var(--line);
    border-bottom-width: 2px; border-radius: 6px; padding: 1px 6px;
  }
  .grid {
    display: grid; gap: 16px; margin-top: 22px;
    grid-template-columns: repeat(auto-fill, minmax(252px, 1fr));
  }
  .card {
    position: relative; display: flex; flex-direction: column;
    background: var(--card); border: 1px solid var(--line); border-radius: 18px;
    padding: 18px; text-decoration: none; color: inherit; overflow: hidden;
    box-shadow: var(--shadow);
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  }
  .card::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: linear-gradient(155deg, hsl(var(--hue) 70% 55% / .08), transparent 58%);
    opacity: 0; transition: opacity .2s ease;
  }
  .card[hidden] { display: none; }
  .card:hover { transform: translateY(-3px); border-color: hsl(var(--hue) 45% 60% / .5); }
  .card:hover::after { opacity: 1; }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 46px; height: 46px; border-radius: 14px; font-size: 23px;
    background: hsl(var(--hue) 72% 93%);
    box-shadow: inset 0 0 0 1px hsl(var(--hue) 45% 82% / .7);
    margin-bottom: 14px;
  }
  @media (prefers-color-scheme: dark) {
    .icon {
      background: hsl(var(--hue) 32% 22%);
      box-shadow: inset 0 0 0 1px hsl(var(--hue) 30% 34% / .8);
    }
  }
  .card h2 { font-size: 16.5px; font-weight: 700; letter-spacing: -.01em; }
  .desc { color: var(--muted); font-size: 13.5px; margin-top: 6px; flex: 1; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
  .tag {
    font-size: 11.5px; color: var(--muted); background: var(--chip);
    border-radius: 999px; padding: 3px 9px; white-space: nowrap;
  }
  .go {
    margin-top: 12px; font-size: 13px; font-weight: 600;
    color: hsl(var(--hue) 50% 34%);
  }
  @media (prefers-color-scheme: dark) {
    .go { color: hsl(var(--hue) 55% 74%); }
  }
  .card:hover .go span { display: inline-block; transform: translate(2px, -1px); }
  .empty {
    grid-column: 1 / -1; text-align: center; color: var(--muted);
    font-size: 14px; padding: 40px 0;
  }
  footer {
    margin-top: 42px; padding-top: 18px; border-top: 1px solid var(--line);
    color: var(--muted); font-size: 12.5px;
    display: flex; flex-wrap: wrap; gap: 6px 18px; justify-content: space-between;
  }
  footer a { color: inherit; text-decoration: none; border-bottom: 1px solid var(--line); }
  footer a:hover { color: var(--accent); border-color: var(--accent); }
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
    .card:hover { transform: none; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <div class="hero-top">
      <span class="logo" aria-hidden="true">🛠️</span>
      <span class="badge" id="count">共 ${tools.length} 个工具</span>
    </div>
    <h1><span class="grad">${escapeHtml(site.title)}</span></h1>
    <p class="sub">${escapeHtml(site.subtitle)}</p>
  </header>

  <div class="search">
    <span class="icon-search" aria-hidden="true">🔍</span>
    <input id="q" type="search" placeholder="搜索工具名称、用途或标签…" autocomplete="off" spellcheck="false" aria-label="搜索工具">
    <kbd>/</kbd>
  </div>

  <main class="grid" id="grid">
${tools.map(renderCard).join('\n')}
    <p class="empty" id="empty" hidden>没有找到匹配的工具，换个关键词试试。</p>
  </main>

  <footer>
    <span>收录 ${tools.length} 个工具 · 构建于 ${buildDate}</span>
    <span>${repoLink ? `源码：${repoLink}` : '纯静态页面 · 无后端依赖'}</span>
  </footer>
</div>

<script>
  (function () {
    var input = document.getElementById('q');
    var grid = document.getElementById('grid');
    var empty = document.getElementById('empty');
    var count = document.getElementById('count');
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
    var total = cards.length;

    function applyFilter() {
      var keyword = input.value.trim().toLowerCase();
      var visible = 0;
      cards.forEach(function (card) {
        var hit = !keyword || (card.getAttribute('data-search') || '').indexOf(keyword) !== -1;
        card.hidden = !hit;
        if (hit) visible += 1;
      });
      empty.hidden = visible !== 0;
      count.textContent = keyword ? visible + ' / ' + total + ' 个工具' : '共 ' + total + ' 个工具';
    }

    input.addEventListener('input', applyFilter);
    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && document.activeElement !== input) {
        event.preventDefault();
        input.focus();
        input.select();
      }
      if (event.key === 'Escape' && document.activeElement === input) {
        input.value = '';
        applyFilter();
        input.blur();
      }
    });
  })();
</script>
</body>
</html>
`;

/* ------------------------------------------------------------------ 写文件 */

fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
console.log(`✔ 已生成 ${path.relative(ROOT, OUTPUT_HTML)}（${tools.length} 个工具）`);

// dist/ 供静态托管使用（已 gitignore，部署平台构建时生成）
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.copyFileSync(OUTPUT_HTML, path.join(DIST_DIR, 'index.html'));
fs.cpSync(APPS_DIR, path.join(DIST_DIR, 'apps'), { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');
console.log(`✔ 已导出 dist/（可直接上传或托管的静态站点）`);

for (const tool of tools) console.log(`   · ${tool.emoji} ${tool.name}  →  ${tool.url}`);
if (warnings.length) console.log(`\n共 ${warnings.length} 条提醒，见上方 ⚠️ 信息。`);

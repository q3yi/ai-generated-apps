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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS_DIR = path.join(ROOT, 'apps');
const MANIFEST_FILE = path.join(ROOT, 'tools.json');
const OUTPUT_HTML = path.join(ROOT, 'index.html');
const OUTPUT_SW = path.join(ROOT, 'sw.js');
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

/* -------------------------------------------------------------- 更新时间解析 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);

/** CI 里的浅克隆只有一条提交，git 日期会退化成“部署日”，必须先判断。 */
const isShallowRepo = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() === 'true';
  } catch {
    return true;
  }
})();

function gitDateOf(relPath) {
  if (isShallowRepo) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', relPath], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return DATE_RE.test(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * 更新时间的来源，按可信度排序：
 * tools.json 里手写的 updatedAt → git 最后一次改动这个文件的日期 → 本地文件修改时间。
 * CI 环境里文件修改时间等于克隆时间，没有参考价值，所以跳过。
 */
function resolveUpdatedAt(app, declaredDate, source) {
  if (DATE_RE.test(String(declaredDate ?? ''))) return { date: String(declaredDate), source: 'tools.json' };
  const fromGit = gitDateOf(path.relative(ROOT, app.htmlFile).split(path.sep).join('/'));
  if (fromGit) return { date: fromGit, source: 'git' };
  if (!process.env.CI) {
    return { date: fs.statSync(app.htmlFile).mtime.toISOString().slice(0, 10), source: 'mtime' };
  }
  return { date: null, source };
}

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
  const updated = resolveUpdatedAt(app, item.updatedAt, 'none');
  seen.add(dir);
  tools.push({
    dir,
    name: String(item.name || pageMeta.title || dir).trim(),
    emoji: String(item.emoji || '🧩').trim(),
    description: String(item.description || pageMeta.description || '暂无简介，点击打开看看。').trim(),
    tags: normalizeTags(item.tags),
    url: `apps/${urlSegment(dir)}/index.html`,
    hue: Number.isFinite(item.hue) ? Number(item.hue) : hueOf(dir),
    updatedAt: updated.date,
    updatedFrom: updated.source,
  });
}

// 没有登记但确实存在的工具，也一并收录，避免忘记改 tools.json 就“消失”。
for (const app of discovered) {
  if (seen.has(app.dir)) continue;
  const pageMeta = readPageMeta(app.htmlFile);
  const updated = resolveUpdatedAt(app, undefined, 'none');
  warn(`apps/${app.dir}/ 没有在 tools.json 中登记，已按目录自动收录`);
  tools.push({
    dir: app.dir,
    name: pageMeta.title || app.dir,
    emoji: '🧩',
    description: pageMeta.description || '暂无简介，点击打开看看。',
    tags: [],
    url: `apps/${urlSegment(app.dir)}/index.html`,
    hue: hueOf(app.dir),
    updatedAt: updated.date,
    updatedFrom: updated.source,
  });
}

if (tools.length === 0) fail('apps/ 下没有可用的工具页面，已终止。');

/* ------------------------------------------------------------------ 渲染页面 */

const renderCard = (tool) => {
  const searchText = [tool.name, tool.description, ...tool.tags, tool.dir].join(' ').toLowerCase();
  const tags = tool.tags.length
    ? `<div class="tags">${tool.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';
  const date = tool.updatedAt ? `<span class="date">更新于 ${tool.updatedAt}</span>` : '';
  return `      <a class="card" href="${escapeHtml(tool.url)}" style="--hue:${tool.hue}" data-search="${escapeHtml(searchText)}">
        <span class="icon" aria-hidden="true">${escapeHtml(tool.emoji)}</span>
        <h2>${escapeHtml(tool.name)}</h2>
        <p class="desc">${escapeHtml(tool.description)}</p>
        ${tags}
        <div class="meta">
          <span class="go">打开工具 <span aria-hidden="true">↗</span></span>
          ${date}
        </div>
      </a>`;
};

const repoLink = site.repoUrl
  ? `<a href="${escapeHtml(site.repoUrl)}" target="_blank" rel="noopener">${escapeHtml(site.repoLabel || site.repoUrl)}</a>`
  : '';

const buildDate = new Date().toISOString().slice(0, 10);
const latestDate = tools.map((tool) => tool.updatedAt).filter(Boolean).sort().pop() || '';

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
<link rel="apple-touch-icon" href="icon.svg">
<link rel="manifest" href="manifest.json">
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
    font-size: 13px; font-weight: 600;
    color: hsl(var(--hue) 50% 34%);
  }
  @media (prefers-color-scheme: dark) {
    .go { color: hsl(var(--hue) 55% 74%); }
  }
  .meta {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin-top: 12px;
  }
  .date {
    font-size: 11.5px; color: var(--muted); white-space: nowrap;
    font-variant-numeric: tabular-nums;
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
    <span>收录 ${tools.length} 个工具${latestDate ? ` · 最近更新 ${latestDate}` : ''} · 构建于 ${buildDate}</span>
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

    // 离线：注册 Service Worker（file:// 下浏览器不允许，所以跳过）
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
      });
    }
  })();
</script>
</body>
</html>
`;

/* ------------------------------------------------------------------ 离线缓存 */

/** 递归列出目录下的文件（相对 ROOT 的斜杠路径），跳过隐藏文件和超大文件。 */
function listFilesUnder(dir, maxBytes) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (maxBytes && fs.statSync(full).size > maxBytes) {
        warn(`${path.relative(ROOT, full)} 超过 ${Math.round(maxBytes / 1024 / 1024)}MB，未加入离线缓存`);
        continue;
      }
      files.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return files;
}

const staticAssets = ['manifest.json', 'icon.svg'].filter((rel) => fs.existsSync(path.join(ROOT, rel)));
if (staticAssets.length < 2) warn('缺少 manifest.json 或 icon.svg，PWA 安装体验会受影响');

const precache = ['index.html', ...staticAssets, ...listFilesUnder(APPS_DIR, 4 * 1024 * 1024)].sort();

const versionHash = createHash('sha1');
for (const rel of precache) {
  versionHash.update(rel);
  versionHash.update(fs.readFileSync(path.join(ROOT, rel)));
}
const cacheVersion = versionHash.digest('hex').slice(0, 10);

const swSource = `/* 本文件由 scripts/build.mjs 自动生成，请勿手改 */
const CACHE = 'tools-${cacheVersion}';
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 同一个页面可能有 /、/index.html、/apps/x/、/apps/x/index.html 几种地址，都兜住
function matchCached(request) {
  return caches.match(request, { ignoreSearch: true }).then((hit) => {
    if (hit) return hit;
    const url = new URL(request.url);
    if (url.pathname.endsWith('/')) return caches.match(url.pathname + 'index.html');
    if (!/\\.[a-z0-9]+$/i.test(url.pathname)) return caches.match(url.pathname + '/index.html');
    return undefined;
  });
}

// 先给缓存（离线可用），同时后台拉最新版本更新缓存
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    matchCached(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => undefined);
      if (cached) return cached;
      return network.then((response) => response || new Response('离线中，这个页面还没有缓存过。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }));
    })
  );
});
`;

/* ------------------------------------------------------------------ 写文件 */

fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
fs.writeFileSync(OUTPUT_SW, swSource, 'utf8');
console.log(`✔ 已生成 ${path.relative(ROOT, OUTPUT_HTML)}（${tools.length} 个工具）`);
console.log(`✔ 已生成 ${path.relative(ROOT, OUTPUT_SW)}（缓存 ${precache.length} 个文件，版本 ${cacheVersion}）`);

// dist/ 供静态托管使用（已 gitignore，部署平台构建时生成）
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.copyFileSync(OUTPUT_HTML, path.join(DIST_DIR, 'index.html'));
fs.copyFileSync(OUTPUT_SW, path.join(DIST_DIR, 'sw.js'));
for (const rel of staticAssets) fs.copyFileSync(path.join(ROOT, rel), path.join(DIST_DIR, rel));
fs.cpSync(APPS_DIR, path.join(DIST_DIR, 'apps'), { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');
console.log(`✔ 已导出 dist/（可直接上传或托管的静态站点）`);

for (const tool of tools) {
  const when = tool.updatedAt ? `更新于 ${tool.updatedAt}（${tool.updatedFrom}）` : '无更新时间';
  console.log(`   · ${tool.emoji} ${tool.name}  →  ${tool.url}  ${when}`);
}
if (isShallowRepo) {
  console.log('\n提示：当前是浅克隆，git 历史不完整，更新时间取自 tools.json 的 updatedAt。');
}
if (warnings.length) console.log(`\n共 ${warnings.length} 条提醒，见上方 ⚠️ 信息。`);

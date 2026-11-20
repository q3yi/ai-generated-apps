# AI 小工具集

一个纯静态的「小工具目录站」：根目录的 `index.html` 是目录页，每个小工具放在 `apps/<工具名>/index.html`，点卡片直接跳到对应工具。

- 无需后端、无第三方依赖，双击 `index.html` 也能打开
- 目录页由 `tools.json` + `apps/` 自动生成，新增工具只要两步
- 自带搜索、深色模式、手机适配
- 代码放 GitHub（Gitee 可作国内镜像），Cloudflare（Pages / Workers）自动构建发布

## 目录结构

```
ai-generated-tools/
├─ index.html            # 工具目录页（由 npm run build 生成，不要手改）
├─ tools.json            # 工具清单：名称、图标、简介、标签
├─ apps/                 # 每个小工具一个目录，入口固定为 index.html
│  └─ cat-insulin-app/
│     └─ index.html
├─ scripts/
│  ├─ build.mjs          # 生成目录页 + 导出 dist/
│  └─ serve.mjs          # 零依赖本地预览服务器
├─ .nvmrc                # Node 20，给 Cloudflare Pages 构建环境用
├─ package.json
└─ README.md
```

## 本地预览

需要 Node.js 18+。

```bash
npm run build     # 重新生成目录页和 dist/
npm run preview   # 打开 http://localhost:5173/
```

`dist/` 是可直接上传的静态站点产物（已 gitignore），包含目录页和所有工具。

## 新增一个小工具

1. 新建 `apps/我的工具/index.html`，单文件即可（样式、脚本都写在里面，引用资源用相对路径）。
2. 在 `tools.json` 的 `tools` 里加一条：

```json
{
  "dir": "我的工具",
  "name": "工具名称",
  "emoji": "🧮",
  "description": "一句话说清楚它能干什么。",
  "tags": ["分类", "场景"]
}
```

3. 运行 `npm run build`，目录页就更新了。
4. `git add -A && git commit -m "feat: 新增 xxx" && git push`，线上会自动重建（用 Cloudflare Pages 的 Git 集成时）。

> 忘记改 `tools.json` 也没关系：`apps/` 下任何含 `index.html` 的目录都会被自动收录，只是标题取自页面的 `<title>`，图标默认 🧩。

## 部署到公网

### 为什么不直接用 Gitee Pages

Gitee Pages 已于 **2024 年 5 月下线**，官方在 Gitee Feedback 里回复「由于不可抗原因，Pages 服务已经下线，暂无具体计划再次上线」（见 [issue I9LOM3](https://gitee.com/oschina/git-osc/issues/I9LOM3)、[issue IAJJZV](https://gitee.com/oschina/git-osc/issues/IAJJZV)）。同一时期 EdgeOne Pages 的默认域名也只剩 3 小时预览链接、必须绑自己的域名。所以在「免费 + 不用自己的域名 + 免备案」的前提下，目前可行的就是 **GitHub + Cloudflare Pages**。

### 推荐方案：GitHub + Cloudflare Pages

免费、免备案、不需要自己的域名，push 后自动构建。

**在线地址：<https://ai-generated-apps-2ft.pages.dev/>**（项目名 `ai-generated-apps`，`-2ft` 是 Cloudflare 分配的默认子域后缀）

**1. 代码在 GitHub**

仓库：<https://github.com/q3yi/ai-generated-apps>（Cloudflare 从这里构建）

```bash
git remote -v
# origin  https://github.com/q3yi/ai-generated-apps.git   （主仓库）
# gitee   https://gitee.com/q3yi/ai-generated.git         （国内镜像，可选）
```

推送到主仓库，想同步 Gitee 时再推一次：

```bash
git push origin main
git push gitee main     # 可选：同步国内镜像
```

**2. 在 Cloudflare 建 Pages 项目**

入口：**Workers & Pages** → **Create** → 选 **Pages** 标签 → **Connect to Git**，选中仓库 `ai-generated-apps` 和 `main`，只填两项：

| 项 | 值 |
| --- | --- |
| 构建命令 | `node scripts/build.mjs` |
| 输出目录 | `dist` |

**别走 "Workers" 流程**：它给的地址是 `*.workers.dev`，而这个域名在国内是被墙的（实测被解析到 `31.13.70.9` 这类假 IP，连接 20 秒超时）；`*.pages.dev` 则正常（实测 301，0.6s）。

如果控制台里找不到 Pages 入口，用命令行直接建项目，绕开表单：

```bash
npm run build
npx wrangler login
npm run deploy:pages     # 创建/更新 Pages 项目 ai-generated-apps
```

建好之后再去 Pages 项目的 **Settings → Builds & deployments → Connect Git** 接上 GitHub 自动部署。

**3. 部署完成**

线上地址 <https://ai-generated-apps-2ft.pages.dev/>。Pages 项目名是 `ai-generated-apps`，`ai-generated-apps.pages.dev` 这个子域已被别人占用，Cloudflare 就自动加了 `-2ft` 后缀——功能没差别，想换短地址只能在 Pages 项目里改项目名或绑自定义域名。

之后每次 `git push` 到 `main`，Cloudflare 自动重新构建发布（已接上 GitHub）。

> 仓库里的 `wrangler.jsonc` 是给 Workers 路线留的（Workers 需要自己的域名才能在国内访问），Pages 路线用不到，留着不影响。

### 其它方案（都在收紧，列出来方便对比）

| 方案 | 要自己的域名 | 要备案 | 国内速度 | 说明 |
| --- | --- | --- | --- | --- |
| **Cloudflare Pages** | 不要 | 不要 | 中（可直连，偶有波动） | 本仓库采用的方案 |
| GitHub Pages | 不要 | 不要 | 差 | `*.github.io` 在国内经常被墙，只适合自己用 |
| 腾讯云 CloudBase 静态托管 | 不要 | 不要 | 好 | 2025-10-09 后新建环境，访客先看到「访问提示中间页」，点「确定访问」才进站（[官方说明](https://docs.cloudbase.net/service/alias)），官方定位测试用途 |
| EdgeOne Pages / COS / OSS | **要** | 大陆加速要 | 好 | EdgeOne 默认域名仅 3 小时预览，必须绑自定义域名（[文档](https://edgeone.ai/document/175201428435140608)） |

## 远端仓库

```bash
git remote -v
# origin  https://github.com/q3yi/ai-generated-apps.git   （主仓库，Cloudflare 从这里构建）
# gitee   https://gitee.com/q3yi/ai-generated.git         （国内镜像，可选）
```

首次推送需要认证：GitHub 用 Personal Access Token、SSH 或 Git Credential Manager；Gitee 用账号密码 / [私人令牌](https://gitee.com/profile/personal_access_tokens)。SSH 方式：

```bash
git remote set-url origin git@github.com:q3yi/ai-generated-apps.git
ssh -T git@github.com    # 看到 Hi q3yi! 说明公钥已配置
```

## 常见问题

- **点开工具 404**：确认链接指向 `apps/<目录>/index.html`，且目录名大小写与磁盘一致（GitHub 和 Linux 构建环境都区分大小写）。
- **改了工具页面但线上没变**：先 `npm run build`；接了 Git 集成的话推送后等自动构建，手动上传的再执行一次 `npm run deploy`。
- **Cloudflare 构建失败**：确认构建命令是 `node scripts/build.mjs`、输出目录是 `dist`，Node 版本 ≥ 18。
- **工具里的数据会丢吗**：不会上传，但存在浏览器 `localStorage`，换浏览器、清缓存或换域名都会重置。
- **能不能放密钥/API Key**：不能。这是纯前端页面，任何写进 HTML/JS 的内容都能被访问者看到。
- **中文显示乱码**：文件保存为 UTF-8（无 BOM），页面已声明 `<meta charset="UTF-8">`。

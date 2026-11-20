# AI 小工具集

一个纯静态的「小工具目录站」：根目录的 `index.html` 是目录页，每个小工具放在 `apps/<工具名>/index.html`，点卡片直接跳到对应工具。

- 无需后端、无第三方依赖，双击 `index.html` 也能打开
- 目录页由 `tools.json` + `apps/` 自动生成，新增工具只要两步
- 自带搜索、深色模式、手机适配
- 代码放 GitHub（Gitee 可作国内镜像），Cloudflare Pages 自动构建发布

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

免费、免备案、不需要自己的域名，push 后自动构建，地址是 `https://<项目名>.pages.dev`。

**1. 把代码放到 GitHub**

在 GitHub 新建一个**空仓库**（不要勾选 README / .gitignore），然后：

```bash
git remote add github https://github.com/<你的用户名>/ai-generated-tools.git
git push -u github main
```

`origin` 仍然指向 Gitee，两边都保留：

```bash
git push origin main && git push github main     # 一次推两个远端
```

**2. 在 Cloudflare 里接上仓库**

1. 注册 / 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)（邮箱即可，不需要信用卡）。
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 授权 GitHub，选中刚建的仓库和 `main` 分支。
4. 构建配置：
   - 框架预设：`None`
   - 构建命令：`node scripts/build.mjs`
   - 输出目录：`dist`
   - 环境变量（可选）：`NODE_VERSION=20`（仓库里也有 `.nvmrc`）
5. **Save and Deploy**，几十秒后得到 `https://ai-generated-tools.pages.dev/`。
6. 之后每次 `git push` 到 `main`，Cloudflare 自动重新构建发布。

**3. 不想接 GitHub 也可以手动上传**

```bash
npm run build
npx wrangler login    # 浏览器授权一次
npm run deploy        # 上传 dist 到 Pages 项目 ai-generated-tools
```

也可以直接在控制台 **Upload assets** 里把 `dist/` 的内容拖进去。

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
# origin  https://gitee.com/q3yi/ai-generated.git   （国内镜像 / 备份）
# github  https://github.com/<你的用户名>/ai-generated-tools.git
```

首次推送需要认证：Gitee 用账号密码 / [私人令牌](https://gitee.com/profile/personal_access_tokens)，GitHub 用 Personal Access Token 或 SSH。SSH 方式：

```bash
git remote set-url github git@github.com:<你的用户名>/ai-generated-tools.git
ssh -T git@github.com    # 看到 Hi <用户名>! 说明公钥已配置
```

## 常见问题

- **点开工具 404**：确认链接指向 `apps/<目录>/index.html`，且目录名大小写与磁盘一致（GitHub 和 Linux 构建环境都区分大小写）。
- **改了工具页面但线上没变**：先 `npm run build`；接了 Git 集成的话推送后等自动构建，手动上传的再执行一次 `npm run deploy`。
- **Cloudflare 构建失败**：确认构建命令是 `node scripts/build.mjs`、输出目录是 `dist`，Node 版本 ≥ 18。
- **工具里的数据会丢吗**：不会上传，但存在浏览器 `localStorage`，换浏览器、清缓存或换域名都会重置。
- **能不能放密钥/API Key**：不能。这是纯前端页面，任何写进 HTML/JS 的内容都能被访问者看到。
- **中文显示乱码**：文件保存为 UTF-8（无 BOM），页面已声明 `<meta charset="UTF-8">`。

# AI 小工具集

一个纯静态的「小工具目录站」：根目录的 `index.html` 是目录页，每个小工具放在 `apps/<工具名>/index.html`，点卡片直接跳到对应工具。

- 无需后端、无第三方依赖，双击 `index.html` 也能打开
- 目录页由 `tools.json` + `apps/` 自动生成，新增工具只要两步
- 自带搜索、深色模式、手机适配

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
4. `git add -A && git commit -m "feat: 新增 xxx" && git push`；然后按部署方式更新线上（手动上传的需要再执行一次 `npm run deploy`）。

> 忘记改 `tools.json` 也没关系：`apps/` 下任何含 `index.html` 的目录都会被自动收录，只是标题取自页面的 `<title>`，图标默认 🧩。

## 部署到公网

### 为什么不用 Gitee Pages

Gitee Pages 已于 **2024 年 5 月下线**，官方在 Gitee Feedback 里回复「由于不可抗原因，Pages 服务已经下线，暂无具体计划再次上线」（见 [issue I9LOM3](https://gitee.com/oschina/git-osc/issues/I9LOM3)、[issue IAJJZV](https://gitee.com/oschina/git-osc/issues/IAJJZV)）。所以「Gitee 版 gh-pages」这条路目前不存在，但**代码照样放 Gitee**，公网发布换一个静态托管平台即可。

### 方案 A（推荐，不需要自己的域名）：Cloudflare Pages

免费、免备案、**不用绑域名**，部署完直接得到 `https://<项目名>.pages.dev` 地址。

**方式一：网页上传（最省事）**

1. 注册 / 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)（邮箱即可，不需要信用卡）。
2. 左侧 **Workers & Pages** → **Create** → **Pages** → **Upload assets**。
3. 项目名填 `ai-generated-tools`，把本地 `dist/` 目录里的**内容**拖进去（`npm run build` 生成）。
4. 点 **Deploy site**，几秒后得到 `https://ai-generated-tools.pages.dev/`。
5. 以后更新：`npm run build` 后再上传一次。

**方式二：命令行（一条命令更新）**

先在方式一里把项目建出来（拿到 `ai-generated-tools` 这个项目名），之后更新就只要一条命令：

```bash
npx wrangler login   # 浏览器授权一次，凭据保存在本机
npm run build
npm run deploy       # = wrangler pages deploy dist --project-name=ai-generated-tools
```

**方式三：接 Git 自动构建（可选）**：把仓库镜像到 GitHub，在 Cloudflare Pages 里连 GitHub 仓库，构建命令 `node scripts/build.mjs`、输出目录 `dist`，之后 push 自动部署。

> 实测：`*.pages.dev` 在国内可直连（本机测到 1.4s 左右，偶有 5s 波动），小工具这种轻量页面够用。

### 方案 B：GitHub Pages（免费、不用域名，但国内不稳定）

把仓库推到 GitHub，Settings → Pages 发布 `dist/`（已带 `.nojekyll`），得到 `https://<用户名>.github.io/<仓库>/`。缺点：`*.github.io` 在国内经常被墙或极慢，只适合自己偶尔访问。

### 方案 C：腾讯云 CloudBase 静态托管（国内最快，但有中间页）

国内 CDN、有免费额度、默认域名 `*.tcloudbaseapp.com` 免备案。但 **2025-10-09 之后新建的环境**，浏览器直接访问默认域名会先出现「访问提示中间页」，访客点「确定访问」后才进站（[官方说明](https://docs.cloudbase.net/service/alias)），且平台定位为测试用途。

### 方案 D：EdgeOne / 对象存储（需要自己的域名）

EdgeOne Pages 的默认域名只是 **3 小时有效期的预览链接**，过期返回 401，官方要求绑定自定义域名（[文档](https://edgeone.ai/document/175201428435140608)）。腾讯云 COS、阿里云 OSS 的默认域名访问 HTML 也会强制下载。这几条路都要：买域名（约 20~30 元/年）+ 走中国大陆加速时做 ICP 备案。

### 怎么选

| 方案 | 要自己的域名 | 要备案 | 国内速度 | push 自动部署 |
| --- | --- | --- | --- | --- |
| Cloudflare Pages | 不要 | 不要 | 中（可达，有小波动） | 可选 |
| GitHub Pages | 不要 | 不要 | 差（常被墙） | 可以 |
| CloudBase 静态托管 | 不要 | 不要 | 好，但有中间页 | 用 CLI |
| EdgeOne / COS / OSS | **要** | 大陆加速要 | 好 | 可以 |

## 推送到 Gitee

```bash
git remote add origin https://gitee.com/q3yi/ai-generated.git
git push -u origin main
```

首次推送会要求登录：可以用账号密码 / [私人令牌](https://gitee.com/profile/personal_access_tokens)，也可以改用 SSH：

```bash
git remote set-url origin git@gitee.com:q3yi/ai-generated.git
ssh -T git@gitee.com   # 看到 Hi q3yi! 说明公钥配置成功
```

（SSH 公钥在 [设置 → SSH 公钥](https://gitee.com/profile/sshkeys) 里添加。）

## 常见问题

- **点开工具 404**：确认链接指向 `apps/<目录>/index.html`，且目录名大小写与磁盘一致（Git 和 Linux 服务器都区分大小写）。
- **改了工具页面但线上没变**：先 `npm run build`；手动上传的再执行一次 `npm run deploy`，云端会保留旧版本，可以回滚。
- **工具里的数据会丢吗**：不会上传，但存在浏览器 `localStorage`，换浏览器、清缓存或换域名都会重置。
- **能不能放密钥/API Key**：不能。这是纯前端页面，任何写进 HTML/JS 的内容都能被访问者看到。
- **中文显示乱码**：文件保存为 UTF-8（无 BOM），页面已声明 `<meta charset="UTF-8">`。

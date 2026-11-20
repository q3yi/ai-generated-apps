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
4. `git add -A && git commit -m "feat: 新增 xxx" && git push`，部署平台会自动重新构建。

> 忘记改 `tools.json` 也没关系：`apps/` 下任何含 `index.html` 的目录都会被自动收录，只是标题取自页面的 `<title>`，图标默认 🧩。

## 部署到公网

### 为什么不用 Gitee Pages

Gitee Pages 已于 **2024 年 5 月下线**，官方在 Gitee Feedback 里回复「由于不可抗原因，Pages 服务已经下线，暂无具体计划再次上线」（见 [issue I9LOM3](https://gitee.com/oschina/git-osc/issues/I9LOM3)、[issue IAJJZV](https://gitee.com/oschina/git-osc/issues/IAJJZV)）。所以「Gitee 版 gh-pages」这条路目前不存在，但**代码照样放 Gitee**，公网发布换一个静态托管平台即可。

### 方案 A（推荐）：EdgeOne Pages

腾讯云 EdgeOne Pages，免费版长期可用，**原生支持直接导入 Gitee 仓库**，效果和 gh-pages 一样：推代码 → 自动构建 → 公网可访问。

1. 打开 [EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages)（产品介绍见 [pages.edgeone.ai](https://pages.edgeone.ai/)），登录腾讯云账号。
2. 创建项目 → 选择 **导入 Git 仓库** → 授权 **Gitee** → 选中 `q3yi/ai-generated` 和 `main` 分支。
3. 构建配置：
   - 构建命令：`node scripts/build.mjs`
   - 输出目录：`dist`
   - Node 版本：18 或以上（一般默认即可）
4. **加速区域**选择「全球可用区（不含中国大陆）」：会自动分配一个 `*.edgeone.app` 二级域名，**不需要备案**，立刻能访问。选了「中国大陆」或「含中国大陆」的可用区，绑定自定义域名时才需要 ICP 备案。
5. 点击部署，完成后控制台会给出公网地址，形如 `https://ai-generated-xxx.edgeone.app/`。
6. 之后每次 `git push` 到 `main`，都会自动重新部署。

> 想换更短的地址/自己的域名：在项目的「域名管理」里绑定自定义域名即可（不含中国大陆的加速区域无需备案）。

### 方案 B：其他静态托管

产物都是纯静态文件，任意平台都能放：

| 平台 | 做法 |
| --- | --- |
| Cloudflare Pages | 选「直接上传」，把 `dist/` 拖进去，得到 `*.pages.dev` 地址 |
| Vercel / Netlify | 构建命令 `node scripts/build.mjs`，输出目录 `dist` |
| 对象存储（腾讯云 COS / 阿里云 OSS） | 把 `dist/` 内文件上传，开启静态网站托管 |
| GitHub Pages | 把仓库镜像到 GitHub，用 Actions 发布 `dist/`（仓库里已带 `.nojekyll`） |

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
- **改了工具页面但线上没变**：先 `npm run build`，再 push；部署平台有缓存，可在部署记录里手动「重新部署」。
- **工具里的数据会丢吗**：不会上传，但存在浏览器 `localStorage`，换浏览器、清缓存或换域名都会重置。
- **能不能放密钥/API Key**：不能。这是纯前端页面，任何写进 HTML/JS 的内容都能被访问者看到。
- **中文显示乱码**：文件保存为 UTF-8（无 BOM），页面已声明 `<meta charset="UTF-8">`。

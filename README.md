# 网页文本转链接

> 把网页里「看起来像网址、但点不动」的纯文本变成真正的链接。自动扫描，也可以双击 / 中键 / 右键手动转换。

[功能](#功能) · [安装](#安装) · [使用](#使用) · [识别规则](#识别规则) · [设置](#设置) · [原理](#原理) · [开发](#开发) · [许可证](#许可证)

## 功能

- **自动转换**：页面加载后自动扫描文本，把 `https://example.com`、`example.com` 这类纯文本变成可点击链接
- **裸域名识别**：`baidu.com`、`www.baidu.com`、`baidu.com/a?b=1` 会自动补全 `https://`，不需要写协议
- **动态内容**：监听 DOM 变化，评论区、聊天框、无限滚动加载出来的新内容也会自动处理
- **手动触发**：可设置为双击 / 鼠标中键 / 单击，只转换你点中的那处文本
- **右键菜单**：选中或指向可识别文本时，右键出现「转换为链接」；在已转换的链接上可「在新标签页打开」「复制链接」
- **打开方式**：新标签页 / 当前页，自动转换与手动转换统一生效
- **站点黑名单**：某些站点不想被改动，可整站排除
- **无悬浮按钮**：不往页面里塞常驻 UI，所有配置都在 ScriptCat 菜单里，点开设置面板修改
- **自动更新**：内置 GitHub `@updateURL` / `@downloadURL`，版本变化后 ScriptCat 自动检查更新

## 安装

1. 安装用户脚本管理器：[ScriptCat](https://scriptcat.org/)（推荐）或 Tampermonkey
2. 打开安装地址：

   <https://raw.githubusercontent.com/illlustionary/text-to-link/master/dist/script.user.js>

3. 在管理器中确认安装

脚本头已内置 `@updateURL` / `@downloadURL`，版本号变化后管理器会自动检查更新（ScriptCat 需开启「自动更新」）。

> 从 `master` 分支的 `dist/script.user.js` 安装即可，这是 CI 构建出的最终产物，不需要自己构建。

## 使用

### 自动转换

安装后默认开启。打开任意网页，脚本会扫描正文中的 URL 和裸域名，原地替换为链接：

- 显示的文字保持原样，只有鼠标悬停时能看到补全后的真实地址
- 代码块、输入框、可编辑区域、已有链接内部不会被改动
- 如果某个站点不想自动转换，在设置里加入黑名单，或直接在菜单里关掉「自动转换」

### 手动转换

默认触发方式是**双击**。在设置里可以改成鼠标中键、单击，或关闭。

- 双击一段文本：把光标处的 URL / 域名转成链接
- 双击已选中的文本：只转换选区内的部分
- 鼠标中键：转换光标处的文本，并阻止浏览器默认的自动滚动
- 单击模式：需要短暂延迟来和双击区分，日常浏览建议保持双击

### 右键菜单

在可识别的文本上右键，菜单里会多出：

- **转换选中文本为链接**（有选区时）
- **转换此处文本为链接**（光标处有可识别文本时）
- **在新标签页打开** / **复制链接**（右键点在脚本生成的链接上时）

没有可识别文本时不会拦截，页面原生右键菜单保持不变。

### 菜单与设置

点击 ScriptCat 的脚本菜单，可以直接：

- 打开设置面板
- 开关自动转换
- 循环切换手动触发方式
- 切换打开方式
- 立即扫描当前页
- 恢复默认设置

## 识别规则

| 文本 | 结果 |
| --- | --- |
| `https://example.com/a?b=1` | ✅ 转链接 |
| `http://example.com` | ✅ 转链接 |
| `example.com` | ✅ 补全为 `https://example.com` |
| `www.example.com` | ✅ 补全为 `https://www.example.com` |
| `example.com/path?q=1#top` | ✅ 保留路径与参数 |
| `192.168.1.1:8080` | ✅ 补全为 `http://192.168.1.1:8080` |
| `user@example.com` | ❌ 不处理（本脚本不做邮箱） |
| `index.js`、`file.png`、`archive.zip` | ❌ 按文件名处理 |
| `1.2.3`、`3.14` | ❌ 版本号 / 小数 |
| `foo.bar` | ❌ 安全模式下不识别；开启宽松模式后识别 |
| `ftp://example.com`、`magnet:?xt=...` | ❌ 不做其它协议 |

### 安全模式与宽松模式

- **安全模式（默认）**：只有后缀在常见顶级域名表里才识别，例如 `com`、`cn`、`net`、`org`、`io`、`dev`、`app`、`xyz`、`top`、`cc`、`tv`、`me`、`co`、`uk`、`jp` 等。`baidu.com` 能识别，`index.js` 不会。
- **宽松模式（默认关闭）**：任意 2-24 位字母后缀都当作域名，能识别 `foo.bar` 这类冷门后缀，但更容易误伤普通单词和缩写。
- **额外后缀**：内网或公司域名可以手动加入，例如 `local`、`corp`、`lan`，安全模式下也会识别 `nas.local`。

### 末尾标点与括号

链接末尾的句号、逗号、中文标点会自动剥离；成对括号会保持平衡：

- `访问 https://example.com。` → 链接是 `https://example.com`
- `https://en.wikipedia.org/wiki/Foo_(bar)` → 右括号保留
- `（https://example.com）` → 中文括号不进入链接

## 设置

菜单 →「⚙ 设置…」打开面板，包含：

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| 自动转换 | 开 | 是否自动扫描整页 |
| 识别 http/https 链接 | 开 | 带协议的 URL |
| 识别裸域名 | 开 | 如 `baidu.com`，自动补 `https://` |
| 宽松识别任意后缀 | 关 | 激进模式，可能误伤普通单词 |
| 额外认可的域名后缀 | 空 | 逗号或空格分隔，如 `local, corp` |
| 打开方式 | 新标签页 | 新标签页 / 当前页 |
| 手动触发方式 | 双击 | 双击 / 鼠标中键 / 单击 / 关闭 |
| 页面右键菜单 | 开 | 是否启用自定义右键菜单 |
| 本站黑名单 | 空 | 每行一个域名，支持 `*.example.com` |

设置保存在 ScriptCat 的脚本存储里（`GM_setValue`），换页面、重启浏览器都不会丢。

## 原理

```text
┌──────────────┐   TreeWalker 收集文本节点   ┌──────────────────┐
│  detector.js │ ◄────────────────────────── │  converter.js     │
│  正则识别     │                             │  拆分文本 + 插入  │
└──────┬───────┘                             │  <a> 节点         │
       │ Match[]                             └────────┬─────────┘
       ▼                                              │
┌──────────────┐   MutationObserver + 防抖分片         ▼
│   auto.js    │ ───────────────────────────► 页面中的可点击链接
└──────────────┘
```

1. 用 `TreeWalker` 遍历文本节点，跳过 `a`、`code`、`pre`、输入框、可编辑区域和脚本自己的 UI
2. 用正则识别 URL / 裸域名，处理末尾标点、括号平衡、邮箱内部域名等边界情况
3. 用 `DocumentFragment` 拆分原文本节点，只把匹配片段替换成 `<a>`，其余文字原样保留
4. `MutationObserver` 监听新增节点和文本变化，防抖后分片处理，避免大页面卡顿
5. 手动触发通过 `caretRangeFromPoint` 找到光标下的文本节点，复用同一套转换逻辑

## 已知限制

- **只处理文本节点**：文字被拆在多个 `<span>` 里（例如每个字符一个标签）时可能识别不到
- **不处理 iframe**：脚本带 `@noframes`，只作用于顶层页面
- **不处理 canvas / 图片里的文字**：没有 OCR
- **不做邮箱和其它协议**：按设计只识别 http/https 与裸域名
- **歧义后缀保守处理**：`.zip`、`.app`、`.mov` 等既是文件后缀又是顶级域名，默认按文件名处理
- **超大页面首轮有上限**：默认最多扫描 6000 个文本节点，避免阻塞页面；之后动态加载的内容仍会继续处理
- 页面前端结构千奇百怪，个别站点可能需要加入黑名单；欢迎提 Issue

## 常见问题

**链接没有自动出现？**

确认脚本已启用、当前站点不在黑名单、菜单里「自动转换」是开着的。部分内容在 iframe 或 canvas 里，脚本无法处理。

**`foo.bar` 没有被识别？**

`bar` 不在常见顶级域名表里。打开「宽松识别任意后缀」，或在「额外认可的域名后缀」里加入 `bar`。

**为什么 `index.js` 没被转成链接？**

`js` 是文件后缀，不是常见域名后缀；脚本会优先按文件名处理，避免把代码里的文件名全变成链接。

**双击没反应？**

确认菜单里「手动触发」不是「关闭」，并且点的是普通文本，不是输入框、按钮或已有链接。

**自动更新没反应？**

脚本版本号由 CI 自动递增（`主版本.次版本.修订号.构建号`）。确认管理器开启了自动更新，并且能访问 GitHub raw 地址。

## 开发

环境要求：Node.js ≥ 22.22（推荐 24 LTS，`jsdom` 31 需要）

```bash
npm install
npm run build   # 构建一次，产物 dist/script.user.js
npm run dev     # 监听源码变化并自动构建
npm test        # 运行识别、转换、自动扫描的单元测试
npm run serve   # 启动本地测试页 http://localhost:4173/tests/fixture.html
```

本地构建的版本号就是 `src/usermeta.js` 里写的版本；CI 构建时会把构建号追加为第四段（如 `1.0.0.42`），保证每次产物都能触发更新。

### 目录结构

```text
src/
  index.js       入口：初始化、设置同步、自动/手动模式装配
  config.js      设置默认值、标签、站点排除匹配
  detector.js    文本识别：URL、裸域名、TLD 校验、边界处理
  converter.js   DOM 转换：文本节点拆分、插入链接、选区/光标处理
  auto.js        自动扫描：MutationObserver、防抖、分片
  manual.js      手动触发：单击/双击/中键、自定义右键菜单
  settings.js    设置读写与设置面板（Shadow DOM）
  menu.js        ScriptCat 菜单注册与动态刷新
  ui.js          toast 与样式注入
  style.css      toast 样式
  usermeta.js    用户脚本元数据
scripts/
  build.mjs      esbuild 打包脚本
  serve.mjs      本地测试用静态服务器
tests/
  detector.test.mjs    识别规则单元测试
  converter.test.mjs   DOM 转换单元测试
  integration.test.mjs 自动扫描集成测试
  fixture.html         自动转换手动测试页
  gm-fixture.html      GM 菜单 / 设置面板手动测试页
.github/workflows/
  build-userscript.yml   GitHub Actions 流水线
dist/
  script.user.js         构建产物（由 CI 自动回推）
```

### 自动构建

推送到 `master` 后，GitHub Actions 会：

1. 安装 Node 24 并缓存 npm 依赖
2. `npm ci && npm test`
3. `npm run build`，用 `github.run_number` 生成 `@version`
4. 产物有变化时自动提交回 `master`（提交信息带 `[skip ci]`，不会循环触发）

流水线使用仓库自带的 `GITHUB_TOKEN`，只需在 workflow 里声明 `permissions: contents: write`，不需要额外配置令牌。

## 贡献

欢迎 Issue 和 PR。提交前请先跑一遍 `npm test && npm run build` 确认能正常构建。

## 许可证

[AGPL-3.0](./LICENSE)

本项目为非官方第三方脚本，与任何网站无关联，仅供学习与个人使用。

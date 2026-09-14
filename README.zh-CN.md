# dsh-switch

[English](README.md)

DSH 插件 — 在 DSH Web GUI 聊天输入框左侧添加可自定义的快捷按钮。点击按钮把斜杠命令插入输入框，补充参数后手动发送。

## 功能

按钮只有一种行为（`mode: "insert"`，单次插入）：每次点击把 `/命令 ` 插入到输入框已有内容**之前**（内容为空时就是开头），再点再插。不执行任何宿主命令、没有常驻状态，视觉上是纯蓝色文字标签（无图标）。

- **设置面板**：Settings → "Switch Buttons"，可添加、编辑、删除、启用/禁用按钮；底部动态展示当前会话可用的斜杠命令参考（中英双语）
- **配置持久化**：保存在 Host 端 settings.yaml 的 `dsh-switch` 命名空间，清浏览器缓存不丢；localStorage 仅作首屏缓存
- **旧配置自动迁移**：早期版本的 `toggle`（开关命令）、`persistent`（持久插入）类型已移除，存量按钮读取时自动降级为单次插入（保留 `command`，丢弃 `commandOff`/`projection`），不会消失

## 安装

> ⚠️ **profile 里已有 git 依赖（如 `aegis`）时不要跑 `dsh plugin add`**：该 CLI 转调 pnpm，pnpm 解析 git 依赖时可能静默永久挂起。请用下面的路径 ②——不依赖 pnpm、无需联网。

### ① 桌面市场（发布到 npm 后可用）

`dsh-switch` 上 npm registry 后，直接在 DSH Desktop 插件市场安装/更新——走宿主 generation 机制，自动更新可用。

### ② 一键安装脚本（免 pnpm、可离线）

```bash
git clone https://github.com/weimingyu9312/DSHSwitch.git
cd DSHSwitch
node install.mjs                 # 自动探测 DSH_HOME 与 web profile
node install.mjs --profile web --home <DSH_HOME> --dry-run   # 只预览不落盘
```

脚本定位 `DSH_HOME`（环境变量优先；否则按 `%APPDATA%\dsh-desktop\harness` / `~/Library/Application Support/dsh-desktop/harness` / `~/.config/dsh-desktop/harness` / `~/.dsh` 顺序探测），把包体（含 vendored 依赖）复制进 `<profile>/node_modules/dsh-switch/`，并在 profile manifest 的**两处**登记（`dependencies["dsh-switch"]` 与 `dsh.profile.bundles`），写回一律 UTF-8 **无 BOM**。脚本幂等，且绝不触碰 `dsh.desktop.generationProjection`（那是市场 staging 私有层）。装完**重启 DSH Desktop** 让 host 半加载。

### ③ 手工合并（附录）

把仓库（连同 `node_modules/` vendor 树）复制到 `<DSH_HOME>/profiles/web/node_modules/dsh-switch/`，再编辑 `<DSH_HOME>/profiles/web/package.json`：在 `dependencies` 加 `"dsh-switch": "file:./node_modules/dsh-switch"`，并在 `dsh.profile.bundles` 数组追加 `"dsh-switch"`。保存为无 BOM UTF-8（PowerShell `Set-Content -Encoding UTF8` 会带 BOM 打断宿主 JSON 解析——用 `[IO.File]::WriteAllText` 或无 BOM 编辑器）。两处登记缺一不可，缺了宿主 reconcile 会跳过该 bundle。之后重启 DSH Desktop。

Host 运行依赖 `@deepseek-ai/schemastery`（连同传递依赖 `@deepseek-ai/cosmokit` 与纯类型的 `@standard-schema/spec`）已**随本仓库入库**，vendored 在 `node_modules/` 下——clone 即用，无需任何额外处理。**vendored 版本必须与目标宿主发行版一致**（当前 schemastery 3.18.2 / cosmokit 1.8.3 = DSH Desktop 0.8.2），升级时三个包要同步刷新。**不要 `npm install`**：插件经 junction 装入 profile，Node 解析不到 profile 自己的 node_modules，改用符号链接会产生 reparse 链导致启动失败（完整论证见 `lib/index.js` 头注释）。

## 兼容性

| 契约 | 已验证宿主 |
|------|-----------|
| 插槽 `conversation.input.left` + `settings.section`；composer face `inputActions.setDraft` | DSH Desktop 0.8.2（web profile） |
| 降级形态：插槽未下发 `inputActions`（`faces: []`） | 退回 `execCommand('insertText')` DOM 兜底通道——可靠性下降但仍可用 |

最低支持：提供 `inputActions` face 的 dsh-web-app 构建（0.8.x 系）。更早、没有这两个插槽的宿主构建不渲染任何按钮（静默、无害）。

## 使用

### 配置按钮

1. 打开 DSH Web GUI → Settings → Switch Buttons
2. 点击 "+ 添加按钮"
3. 每张卡片两个字段：
   - **名称**：按钮显示文本（如 "Plan Off"）
   - **斜杠命令**：要插入的命令（如 `/plan off`）
4. 拨动开关启用/禁用；点击 × 删除

### 默认配置

```json
{
  "buttons": [
    { "id": "plan", "label": "Plan", "command": "/plan", "mode": "insert", "enabled": true },
    { "id": "plan-off", "label": "Plan Off", "command": "/plan off", "mode": "insert", "enabled": true }
  ]
}
```

默认值只在 Host 配置里还没有 `buttons` 键时生效；用户改过一次后以存储为准。想恢复默认，删掉 settings.yaml 中 `dsh-switch:` 段并清除浏览器 localStorage 后重启。

### 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 按钮唯一标识 |
| `label` | string | 按钮显示文本 |
| `command` | string | 要插入的斜杠命令 |
| `mode` | string | 固定 `insert`；旧值（`toggle`/`persistent`/无）读取时自动迁移 |
| `enabled` | boolean | 是否启用 |

### 验证

1. 输入框左侧出现 switch 按钮
2. 点击 Plan 按钮：输入框为空 → `/plan ` 出现在开头；已有内容（如 `research pricing`）→ 变成 `/plan research pricing`；按 Enter 正常发送
3. 设置面板底部显示斜杠命令参考列表

### 命令没插进输入框时怎么查

浏览器控制台（F12）直接问插件它自己看到了什么：

```js
__dshSwitch.state()                // scopeBound / buttons / faces / draft / editorFound / editorPhase
__dshSwitch.log()                  // 最近 40 次插入:kind(setDraft|dom|no-editor|skip:stale-snapshot|…)/text/before/after
__dshSwitch.insert("/plan")        // 手动跑一次插入,看草稿有没有出现命令
```

常见现象：`faces: []` = 宿主插槽没下发 `inputActions`（老宿主版本），插入退回 DOM 兜底通道、可靠性下降；`editorFound: false` = 输入框 DOM 变了，两条通道都写不进；明细日志用 `localStorage.setItem("dsh-switch-debug","1")` 打开。

## 架构速览

| 文件 | 职责 |
|------|------|
| `lib/index.js` | Host 半：注册 `dsh-switch` settings 命名空间（仅 `buttons` 一个键） |
| `lib/client.js` | Client 半：按钮栏（注入 `conversation.input.left` 槽）、设置面板（注入 `settings.section` 槽）、配置读写与迁移 |

插入的唯一行为是**草稿写入**（不执行命令）：首选走宿主 composer face 的 `inputActions.setDraft(命令 + 原草稿)` —— 经编辑器自身 state 提交，不会被 Lexical 调和抹掉；草稿含引用 chip、提交机锁定、或该会话无 face 时退回 `execCommand('insertText')` 兜底。配置改动乐观渲染 + 写 localStorage 镜像 + `scope.set("buttons")` 落 Host。

## 开发

本仓库以 junction 链接装进 profile，改工作区文件即生效。插件分宿主/客户端两半，**热更新不对称**——判断"改了没生效"前先确认动了哪一半：

| 改动文件 | 需要的动作 |
|----------|-----------|
| `lib/client.js`（按钮栏、设置面板、插入逻辑） | 刷新浏览器页面即可 |
| `lib/index.js`、`package.json`、`cordis.patch.yml`（host 半） | 完全重启宿主进程（`dsh web` Ctrl+C 重跑 / 彻底退出 DSH Desktop） |
| 按钮配置（设置面板里改） | 无需任何动作——落 Host settings.yaml 后即时生效 |

```bash
node test/client.test.cjs   # 或 npm test — 32 项 jsdom 行为测试（迁移规则、face 路由、chip/相位闸、退役符号回归）
node test/preview.cjs       # 离线渲染设置面板到 .preview/preview-{dark,light}.html 核对布局
node install.mjs --dry-run  # 发版前用假 DSH_HOME 验证安装脚本
```

发布历史见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT

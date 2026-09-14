# dsh-switch

DSH 插件 — 在 DSH Web GUI 聊天输入框左侧添加可自定义的 switch 快捷按钮。

## 功能

按钮只有 **2 种类型**(`mode` 字段,设置面板用下拉框选择):

| # | mode | 名称 | 行为 |
|---|------|------|------|
| 1 | `toggle` | 开关命令(Plan 式) | 有**开启命令**、**关闭命令**(可留空),可填 **host 状态键**(projection)。填了关闭命令时点击在开/关命令间切换;留空则退化为**单命令按钮** —— 每次点击都执行同一条 `command`,开/关显示靠本地翻转(投影可用时以投影为准)。配置了状态键且宿主给出投影后,按钮实时反映宿主状态(任何来源的变化都同步) |
| 2 | `insert` | 单次插入 | 只有**一条斜杠命令**。每次点击把 `/命令 ` 插入到输入框已有内容**之前**(内容为空时就是开头),用户补充参数后手动发送;再点再插 |

> **v1.4.0 移除了第 3 类「持久插入」(`persistent`)**:激活后给每条新消息自动加前缀的那套机制。它的整套武装注册表(Host `armed` 键、localStorage 镜像、跨页签同步、按键/粘贴/输入法兜底监听)全部删除。老配置里存着 `mode: "persistent"` 的按钮**不会消失**,读取时自动降级为「单次插入」(命令、名称、启用状态原样保留),行为变成"点一次插一次"。

- **实时状态同步**:类型 1 通过 host projection(如 `plan`)获取按钮状态,执行中显示半透明等待态
- **状态视觉反馈**:激活态高亮(绿色)、执行中等待态、错误态红色标记、单次插入按钮虚线边框(⌨ 图标)
- **错误自动回退**:命令执行失败时,本地状态按钮自动回退到执行前的状态
- **旧配置自动迁移**:读取时归一 —— `mode: "persistent"` → `insert`;没有 `mode` 字段的旧配置按 `insert: true` → 类型 2、其余 → 类型 1;保存后落盘新格式
- **设置面板**: Settings → "Switch Buttons" 中可添加、编辑(类型下拉框只有两个选项)、删除、启用/禁用按钮
- **斜杠命令参考**: 设置面板底部动态展示当前会话可用的斜杠命令列表(支持中英双语)
- **配置持久化**: 按钮配置保存在 Host 端 settings.yaml 的 `dsh-switch` 命名空间(`buttons` 一个键),跨设备/清缓存不丢;浏览器 localStorage 仅作首屏缓存与 Host 不可用时的回退

## 安装

```bash
# 本地开发安装
dsh plugin --profile web add link:D:\DSHPlugin\DSHSwitch

# 或从 git 安装
dsh plugin --profile web add "github:user/dsh-switch#main"
```

### 宿主依赖（vendored，不要 `npm install`）

Host 侧只需要 `@deepseek-ai/schemastery`（DSH 自带的 schemastery 分支），它以**真实目录**的形式放在本仓库 `node_modules/` 下：

```
node_modules/@deepseek-ai/schemastery   ← schema DSL（settings.register 需要活的 schemastery 实例）
node_modules/@deepseek-ai/cosmokit      ← schemastery 的唯一运行时依赖
node_modules/@standard-schema/spec      ← 仅类型引用
```

必须保持 vendored 的原因：插件在 profile 里是以 **junction** 指向本目录安装的（`profiles/web/node_modules/dsh-switch → D:\DSHPlugin\DSHSwitch`），Node 的 ESM 解析从 `D:\DSHPlugin\DSHSwitch` 逐级上溯，**永远看不到 profile 自己的 node_modules**。若改用「往 profile 里再挂一个 junction」的做法，会形成 workspace → profile → `.dsh-module-fallback` → generation → `.pnpm` 的 4 层 reparse 链：

- profile 维护/generation 换代的瞬间，链会短暂悬空 → 启动报 `Cannot find package 'schemastery' imported from ...\lib\index.js`，整个插件树加载失败；
- 桌面端的 plugin-recovery 检测到失败后会尝试把插件从 profile 中摘掉，而它在 `stat .../dsh-switch/node_modules/schemastery` 时撞上 `ELOOP: too many symbolic links encountered`，在 `recovery/plugin-removals.json` 里留下 `backup-pending` 记录，此后每次启动都会打印「profile package maintenance deferred」。

schemastery 用 `Symbol.for("schemastery")` 标记 schema，所以「另一份拷贝」构造的 schema 一样能被宿主识别并 `toJSON()` / 校验，vendored 不会造成互不兼容。`package.json` 里把它声明为 `peerDependencies`（与 `dsh-perm-guard` 的写法一致），因此安装器不会再为它生成任何链接。

> 分发注意：`node_modules` 不会被 npm pack / git 安装带上。若要对外发布，需把这三个包挪到 `vendor/` 目录并在 `prepare` 时复制进 `node_modules`，或在安装后执行一次 `npm install @deepseek-ai/schemastery`。本机以 `link:D:/DSHPlugin/DSHSwitch` 安装，不受影响。

## 使用

### 配置按钮

1. 打开 DSH Web GUI
2. 进入 Settings → Switch Buttons
3. 点击 "+ 添加按钮" 添加新按钮
4. 每行先选**类型下拉框**(开关命令 / 单次插入),再按类型填字段:
   - **名称**: 按钮显示文本(如 "Plan")
   - **类型**: 两种之一(见上表);选"开关命令"时才会显示 关闭命令/状态键 两个输入框
   - **命令**: 类型 1 为开启命令(如 `/plan`);类型 2 为要插入的斜杠命令(如 `/agent-teams`)
   - **关闭命令**: 仅类型 1,如 `/plan off`
   - **状态键**: 仅类型 1,host projection 名称(如 `plan`),填写后按钮实时反映宿主状态
   - **启用开关**: 启用/禁用按钮
5. 点击 × 删除按钮

### 按钮类型示例

| 类型 | 字段 | 行为 |
|------|------|------|
| **开关命令** | command=`/plan` commandOff=`/plan off` projection=`plan` | 点击切换 `/plan` ↔ `/plan off`,按钮状态由 host 实时投影驱动 |
| **单次插入** | command=`/agent-teams` | 点击把 `/agent-teams ` 插到输入框已有内容**之前**,补充参数后手动发送;再点再插 |

### 默认配置

```json
{
  "buttons": [
    { "id": "plan", "label": "Plan", "command": "/plan", "commandOff": "/plan off", "projection": "plan", "mode": "toggle", "enabled": true },
    { "id": "agent-teams", "label": "Teams", "command": "/agent-teams", "mode": "insert", "enabled": true }
  ]
}
```

配置以 Host 端 settings.yaml 的 `dsh-switch` 命名空间为准(**只有 `buttons` 一个键**);浏览器 `localStorage`(`dsh-switch-config` + `dsh-switch-config-initialized`)只承担首屏缓存与「用户已初始化」标记。

> 升级前留下的 `dsh-switch.armed` 键会被客户端**完全忽略**(不再解码、不再写回),插件不会替你删它。想清理 settings.yaml 的话,手工删掉 `armed:` 那两到三行即可 —— 那是你的持久配置,插件不再对它做任何写操作。

### 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 按钮唯一标识 |
| `label` | string | 按钮显示文本 |
| `mode` | string | 按钮类型:`toggle`(开关命令)/ `insert`(单次插入)。读取时自动迁移:`persistent` 与 `insert: true` → `insert`,其余 → `toggle` |
| `command` | string | 类型 1:开启命令;类型 2:要插入的斜杠命令 |
| `commandOff` | string? | 仅类型 1:关闭命令 |
| `projection` | string? | 仅类型 1:host 投影名称,实时状态 |
| `enabled` | boolean | 是否启用 |

## 实时状态说明(类型 1)

当按钮配置了 `projection` 字段时，插件通过 `useProjection(key)` 读取 host 计算的状态投影：

- ✅ 点击按钮切换状态 → 按钮立即更新
- ✅ 手动输入 `/plan off` → 按钮自动变为 off 状态
- ✅ 手动输入 `/plan` → 按钮自动变为 on 状态
- ✅ 其他入口（如官方 Plan 卡片）改变状态 → 按钮同步更新
- ✅ 投影带 `pending` 字段时，按钮显示半透明等待态并禁用点击；`pending` 期间显示的状态是当前投影值的**反相**（即提前点亮"即将进入"的那一态），宿主落定后自动校正
- ✅ 投影缺失（宿主未注册该 key、或按钮不是类型 1）时退回本地状态：填了 `commandOff` 就在两条命令间切换，没填就反复执行同一条命令

目前已知可用的 projection:
- `plan`: Plan 模式的 `{ active, pending }` 状态

### 与官方 Plan 芯片共存

宿主自带 `dsh-client-ui-plan` 的 "Plan ×" 芯片（注册在专属槽位 `conversation.input.plan`，仅当 plan 模式生效时挂载）。为避免同一功能出现两个按钮，本插件约定：

- **隐藏条件（三者同时满足）**：按钮是类型 1、状态键为 `plan`、投影显示已激活（且不在 `pending`），并且 DOM 中检测到官方芯片（类名探针 `.REN-qG_chip`）。
- 任一条件不成立（plan 未开启、切换提交中、官方组件被禁用/移除）→ 插件 Plan 按钮照常显示，不会出现"没有退出入口"的空窗。
- 其他按钮不受影响；用户自建的 `projection:"plan"` 按钮同样适用此规则。
- ⚠️ 探针依赖官方包 CSS module 的稳定哈希类名 `REN-qG_chip`；若未来宿主升级导致改名，探针返回 false，行为自动退回"始终显示"（不会误伤，只是回到重复按钮的旧状）。

## 斜杠命令参考

设置面板底部自动展示当前会话可用的斜杠命令列表：

- **动态获取**: 通过 `ctx.remote.commands.list(sessionId)` 读取已安装插件注册的命令
- **中英双语**: 根据浏览器语言自动切换（`navigator.language` 以 `zh` 开头时使用中文）
- **内置命令**: 预置 `/plan`、`/goal`、`/compact`、`/feedback`、`/permission`、`/export`、`/model` 的说明
- **动态扩展**: 自动合并其他插件注册的命令（如 `agent-teams`、`free-search-engine`、`aegis` 等）

## 架构

| 半部 | 文件 | 职责 |
|------|------|------|
| Host | `lib/index.js` | 注册 `dsh-switch` settings 命名空间(仅 `buttons` 按钮配置,持久化在宿主 settings.yaml),依赖 vendored `@deepseek-ai/schemastery` |
| Client | `lib/client.js` | Switch 按钮 UI、Settings 面板、配置经 `ctx.settingsScope` 读写 Host settings(localStorage 仅首屏缓存/回退)、斜杠命令参考 |
| Patch | `cordis.patch.yml` | Cordis 服务注册 |

### 依赖注入

依赖注入分两层声明,别混淆:

**打包期**(`package.json` → `dsh.client.inject`,`platform: web`)—— 声明 bundle 需要链接的三个宿主客户端模块:
- `@deepseek-ai/dsh-api-remotes` — 远程命令通道(`ctx.remote.commands.execute` / `.list`)
- `@deepseek-ai/dsh-client-ui-conversation` — 会话输入框一侧的 UI 能力(含 `conversation.input.left` 插槽与组件拿到的 `useProjection`、`inputActions`)
- `@deepseek-ai/dsh-client-ui-settings` — Settings 一侧的 UI 能力(`settings.section` 插槽所在)

**运行期**(`lib/client.js` 尾部的 `exports.inject`)—— 插件 apply() 前要拿到的服务键:`slots`、`remote`、`remote.commands`、`sessions`、`settingsScope`
- `sessions` — 读取当前会话 id(斜杠命令参考列表用)
- `settingsScope` — **必须写进 `exports.inject` 数组**:配置的权威源走它。漏声明时 `apply()` 可能在服务就绪前就跑完,`ctx.get("settingsScope")` 拿到 undefined,插件静默降级到 localStorage —— 而 localStorage 按源隔离,DSH Desktop 每次启动换端口就等于清空,表现即「配置像被抹掉了」。宿主所有官方插件(dsh-client-ui-theme / chat / conversation / …)都显式声明了它。取用方式对 `ctx.get("settingsScope")` 与属性直取两种写法都兼容,拿不到或 `bind` 不是函数时 `scope` 置 null 并整体退回缓存路径;绑定成功后由 `scope.subscribe` 推快照(revision fencing、折回、恢复读都由作用域自己负责)

### Slot 注入点

| Slot | 组件 | 说明 |
|------|------|------|
| `conversation.input.left` | `SwitchBar` | 聊天输入框左侧的按钮栏;宿主按会话(session 作用域)下发 `sessionId`、`useProjection`、`inputActions`、`input` |
| `settings.section` | `SettingsPanel` | Settings 页面的 "Switch Buttons" 配置区 |

### 通信

- **命令执行**: 仅类型 1 走这条链路 —— Client 通过 `ctx.remote.commands.execute(sessionId, command, [])` 执行命令;若宿主因空参数数组回抛 "business argument" / "expected … argument" / "got N" 一类的参数个数错误,自动降级为不带参数再调一次 `execute(sessionId, command)`。返回 `result.ok=false` 或抛异常时在按钮上显示错误并把本地状态回退到执行前(投影驱动的状态不回退)。类型 2 完全不碰 `commands.execute`,只改草稿
- **命令列表**: 通过 `ctx.remote.commands.list(sessionId)` 动态获取可用斜杠命令
- **状态读取**: 通过 `props.useProjection(key)` 读取 host 投影（类型 1 配置了 projection 时）
- **草稿写入(类型 2)**: 插入发生在**草稿层**而非传输层 —— 宿主的 `session.prompt` 接收路径不解析斜杠命令(只有 composer 客户端的 `matchEnter` 按草稿文本裁决,命中才走 `commands.execute`),所以插件只负责把 `/命令 ` 放进草稿,发送路径与手输完全一致。统一入口 `insertAtDraftStart(sessionId, text)`,两条通道:
  1. **宿主 composer face(首选)**: `conversation.input.left` 的插槽 props 里有 `inputActions`(= 宿主 `SessionInputShell.actions`,含 `setDraft`/`submit`)与 `input`(= `InputState{draft, draftRev, phase, occurrences, imageIds}`)。`SwitchBar` 每次渲染把这些记进 `composerFaces[sessionId]`(卸载时 `unbindComposerFace` 清掉,绝不留过期 store),点击时读 `input.draft` 算出新值再 `inputActions.setDraft(text + draft)` —— 走编辑器**自身的 state 提交**,DOM 由 Lexical 自己渲染,因此不会被它的下一次调和抹掉,也不会和宿主的"上次草稿回填"(`ConversationSession` 挂载时 `setDraft(storedDraft)`)互相覆盖
  2. **DOM 兜底(仅在 face 不能用时)**: `insertIntoComposerInput()` 用 `execCommand('insertText')` 直改 contenteditable。触发条件只有两个:该会话没有 face(宿主没下发 `inputActions`,或按钮栏尚未挂上),以及草稿里有引用 chip(`occurrences` 非空或含 U+FFFC —— `setDraft` 会把 chip 摊平成纯文本)。这条路径只改 DOM 不写编辑器状态,**不是可靠的落位证据**,日志里它记作 `kind: "dom"`
  - 写入前三道闸: `draftLocked(input)` —— `phase` 为 `adjudicating`/`submitting` 时(宿主正在读草稿)不走 setDraft;`draftHasChips(input)` —— 见上;以及**快照一致性** —— `input.draft` 与当前 DOM 文本不一致说明我们的渲染快照落后于编辑器(用户刚打的字还没回到本组件),此时绝不把过期快照回吐给 `setDraft`(那会抹掉用户输入),改走 DOM 通道
  - 三者任一命中都退到 DOM 通道
- **配置同步**: Settings 面板改配置 → 乐观本地渲染 + `writeButtons()`:写 `localStorage` 镜像(`dsh-switch-config` / `-initialized`)、派发 `CustomEvent("dsh-switch-config-updated")` 通知按钮栏刷新,最后 `scope.set("buttons", …)` 写回 Host settings(权威源;失败不重试,靠宿主镜像把真值回灌给所有订阅者)。`subscribeConfig()` 先用 Host 快照(状态 `ready` 时)同步回调一次,快照未就绪或没有 scope 时退回缓存,并同时挂 `storage` + 自定义事件监听。命名空间里那个已退役的 `armed` 键**既不被解码也不被写回**

### 状态机

按钮视觉状态:

| 状态 | CSS class | 触发条件 |
|------|-----------|----------|
| 默认 | `dsh-sw-btn` | 未激活 |
| 激活 | `dsh-sw-btn is-active` | 类型 1 投影/本地状态为 active |
| 插入态 | `dsh-sw-btn is-insert` | 仅类型 2(虚线蓝色边框 + ⌨ 图标) |
| 前缀标签 | `dsh-sw-prefix`(`▶ /命令`) | 旧式单命令 toggle(无 `commandOff`)激活时显示 |
| 等待 | `dsh-sw-btn is-pending` | 投影 `pending=true`，按钮禁用 |
| 错误 | `dsh-sw-btn is-error` | 命令执行返回 `result.ok=false` 或抛异常 |

类型 2 没有常驻状态:点击即写草稿,写完即结束,插件不再持有任何跨会话/跨重启的应用级状态(旧的 `armedButtons` 应用级武装注册表已随 v1.4.0 删除)。

### 设置面板布局

每个按钮一张卡片,卡片内两行共用**同一套 12 列网格**,列宽 `minmax(0,1fr)` —— 字段只会随面板变窄而收缩,不会像 flex-wrap 那样各行错位换行:

| 行 | 列跨度 | 内容 |
|----|--------|------|
| 表头 | 5 / 4 / 3 | 名称 · 类型下拉 · 启用开关 + 删除(右对齐;开关上方留同高占位标签,保证纵向对齐) |
| 类型 1 | 5 / 4 / 3 | 开启命令 · 关闭命令 · 状态键 |
| 类型 2 | 12 | 斜杠命令(整行) |

- 斜杠命令参考改为可折叠小节,条目按 `auto-fill minmax(230px,1fr)` 分列,长描述在列内换行不再溢出。
- 无按钮时显示虚线空态提示;「添加按钮」为整行虚线按钮。
- **令牌纪律**:只能用 `@deepseek-ai/dsh-client-ui-theme` 里真实定义的 `--dsw-*` 变量。`--dsw-surface-*`、`--dsw-stroke-*`、`--dsw-alias-state-info-*`、`--dsw-alias-state-error-tertiary` 都**不存在**,写了只会退回硬编码浅色值(暗色主题下变成白底黑字)。可用对应关系:描边 `--dsw-alias-border-l1/l2/l3`;面 `--dsw-alias-bg-layer-1/2/3`、`--dsw-alias-interactive-bg-hover/active/hover-danger`;输入框底 `--dsw-specific-input-major`;文字 `--dsw-alias-label-primary/secondary/tertiary/caption`;蓝色强调 `--dsw-alias-state-business-primary/tertiary`。
- 离线核对布局:`node test/preview.cjs` → 用浏览器打开 `.preview/preview-dark.html` / `preview-light.html`(真实组件 + 真实 CSS + 从宿主主题包提取的真实令牌值,明暗两套)。

## 验证

打开 Web UI 后:
1. 聊天输入框左侧应出现 switch 按钮
2. Plan 按钮(类型 1,projection="plan")应实时反映状态:
   - 点击按钮 → 状态更新;手动输入 `/plan off` / `/plan` → 按钮自动跟随
   - plan 模式**开启**且官方 "Plan ×" 芯片在场时,插件 Plan 按钮自动隐藏(见「与官方 Plan 芯片共存」);关闭 plan 后恢复显示
3. Teams 按钮(类型 2,虚线边框)点击后:
   - 输入框为空 → `/agent-teams ` 出现在开头
   - 输入框已有内容(如 `research pricing`)→ `/agent-teams ` 插到**内容之前**,变成 `/agent-teams research pricing`
   - 按 Enter 正常发送
4. 旧「持久插入」按钮的迁移:升级后原按钮仍在,设置面板里类型显示为"单次插入",点击一次插一次(不再常驻加前缀)
5. 旧配置迁移:升级后原有按钮(含 `insert: true` 或无 commandOff 的单命令按钮)应正常显示与工作
6. 设置面板底部应显示斜杠命令参考列表

### 命令没插进输入框时怎么查(类型 2)

浏览器控制台(F12)直接问插件它自己看到了什么:

```js
__dshSwitch.state()   // { scopeBound, buttons, faces:[{sessionId,setDraft,draft,phase,chips}], draft, editorFound, editorPhase }
__dshSwitch.log()     // 最近 40 次插入:kind(setDraft|dom|no-editor|skip:stale-snapshot|setDraft-failed:…)/text/before/after
__dshSwitch.insert("/agent-teams")   // 手动跑一次插入,立刻看草稿有没有出现命令
```

| 现象 | 含义 |
|------|------|
| `scopeBound: false` | 没拿到 Host `settingsScope`,配置只能走 localStorage —— 而 localStorage 按源(origin)隔离,DSH Desktop 每次启动换端口就等于空的。检查 `inject` 里是否声明了 `settingsScope` |
| `faces: []` | 按钮栏没拿到宿主插槽 props(宿主版本没有 `inputActions`,或该视图的插槽没带 session 作用域)。此时插入走 DOM 兜底,可靠性下降 |
| `faces[].setDraft: false` | props 里没有可用的 `setDraft`,同上 |
| `editorFound: false` / `editorPhase: "inert"` | 选择器 `[data-composer-input][contenteditable="true"]` 没命中 —— 宿主输入框 DOM 变了或编辑器为 null,两条通道都写不进去 |
| `log().insert` 里 `kind: "skip:stale-snapshot"` 紧跟一条 `dom` | 我们的渲染快照落后于编辑器(防止回吐过期草稿把用户已输入的内容抹掉),改走 DOM 通道 |
| `log().insert` 里 `kind: "dom"` 而草稿没变 | DOM 兜底被 Lexical 调和掉了 —— 说明本该用 face 通道,查 `faces` 为什么不可用 |

明细日志默认不进控制台(免刷屏):`localStorage.setItem("dsh-switch-debug","1")` 后刷新,或运行期 `window.__dshSwitchVerbose = true`。

## 开发

本仓库以 **junction 链接**方式安装进 DSH profile(`profiles/web/node_modules/dsh-switch → D:\DSHPlugin\DSHSwitch`),改工作区文件即生效,生效方式按改动的"半部"区分:

- **Client 半(`lib/client.js`)**:刷新浏览器页面即可(每次加载重新读取 bundle 文件,**无需重启任何服务**)
- **Host 半(`lib/index.js`、`package.json`、`cordis.patch.yml`)**:需重启宿主进程 —— 终端跑 `dsh web` 就 Ctrl+C 后重跑;DSH Desktop 则完全重启应用

```bash
# 非链接安装(从 git / 包安装)时,改代码后需重装:
dsh plugin --profile web add link:D:\DSHPlugin\DSHSwitch
```

### 自动化测试

```bash
node test/client.test.cjs    # 或 npm test
```

30 项 jsdom 行为测试,经 `lib/client.js` 尾部的 `__test` 测试缝(纯测试用途,生产无消费方)直接驱动草稿层逻辑,不挂载 React:按钮模型(`MODE_ORDER` 只剩两类)、配置迁移(`normalizeButton`/`normalizeConfig`:persistent→insert、legacy `insert:true`、无 `mode` 记录、未变更时保持对象同一性)、设置面板类型下拉只渲染两个 option、**按钮组件回归**(`SwitchButton` 拿到残留的 `mode:"persistent"` 记录时按 insert 渲染,点击**绝不**调用 `commands.execute`,只写草稿 —— 退役的行为确认死透)、Host settings 管道(fake `settingsScope` 验证 decode 忽略并剥离 `armed`、`writeButtons` 只写 `buttons` 一个键、无 scope 时退回缓存不抛错)、composer face(face 绑定时 `setDraft(text + draft)` 且**完全不碰 DOM**、chip 草稿/`adjudicating` 相位/无 draft 可读/`setDraft` 抛错四种情况退回 DOM、会话 id 字符串化、unbind 后不再被写、**快照与 DOM 不一致时不回吐过期快照**)、`draftHasChips`/`draftLocked` 两道闸、DOM 兜底与 `no-editor` 分支、以及一条"退役符号回归检查"(`__test` 上不再暴露任何 armed/prepend API,`dsh-switch-armed` 不再被写)。测试依赖 DSH profile 里的 jsdom(只读引用,非本仓库依赖)。

### 变更记录(近期契约)

- **v1.4.0** —— 移除类型 3「持久插入」及其全部武装机制:`armedButtons` 注册表、Host `armed` 键(不再读也不写)、localStorage `dsh-switch-armed` 镜像、跨页签 `storage` 同步、document 捕获监听(keydown/beforeinput/compositionend)、IME 挂起闩、`computePrefix`/`prependArmedNow`/`clearComposerText`。类型 2 的写入改走宿主 `inputActions.setDraft`(编辑器自身 state),`execCommand` 降级为兜底。诊断面从 `armed/commands/force` 换成 `faces/insert/log().insert`
- v1.3.x —— 武装态恢复与"激活即落位"的修补尝试(已由 v1.4.0 的通道改造取代)

## License

MIT

/**
 * dsh-switch — visual preview harness (dev only, not part of `npm test`).
 *
 * Renders the REAL Settings-panel components to static HTML with the plugin's
 * own stylesheet and the real DSW design tokens (light + dark), so the layout
 * can be screenshotted without booting DSH.
 *
 * Usage:  node test/preview.cjs [outDir]     →  writes preview-dark.html / preview-light.html
 */
var fs = require("fs");
var path = require("path");

var PROFILE_MODULES = path.join(
  process.env.APPDATA || "",
  "dsh-desktop", "harness", "profiles", "web", "node_modules"
);
var JSDOM = require(path.join(PROFILE_MODULES, "jsdom")).JSDOM;

var dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
var win = dom.window;
global.window = win;
global.document = win.document;
global.navigator = win.navigator;
global.localStorage = win.localStorage;

/* React stub: createElement returns a plain vnode; hooks are inert. */
var reactStub = {
  createElement: function (t, p) {
    return { type: t, props: p || {}, children: [].slice.call(arguments, 2) };
  },
  useState: function (init) { return [typeof init === "function" ? init() : init, function () {}]; },
  useEffect: function () {},
  useCallback: function (fn) { return fn; },
  useRef: function (v) { return { current: v }; },
};

var loaded = null;
win.__ModuleLoader__ = {
  load: function (def) {
    loaded = def.factory(function (id) {
      if (id === "react") return reactStub;
      throw new Error("unexpected require: " + id);
    });
  },
};
(0, eval)(fs.readFileSync(path.join(__dirname, "..", "lib", "client.js"), "utf8"));

var T = loaded.__test;
var css = document.getElementById("dsh-switch-style").textContent;

/* ------------------------------------------------------------------ */
/*  vnode → HTML                                                       */
/* ------------------------------------------------------------------ */
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function attrName(k) {
  if (k === "className") return "class";
  if (k === "htmlFor") return "for";
  if (/^(aria-|data-|role|title|value|placeholder|type|checked|disabled|spellcheck|autocomplete|width|height|start|id|href|target|colspan|rowspan)/.test(k)) return k;
  return null;
}
function toHtml(node) {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (Array.isArray(node)) return node.map(toHtml).join("");
  if (typeof node === "string" || typeof node === "number") return esc(node);
  if (typeof node.type === "function") {
    return toHtml(node.type(Object.assign({}, node.props, {}, { children: node.children })));
  }
  var attrs = Object.keys(node.props).map(function (k) {
    var v = node.props[k];
    var name = attrName(k);
    if (!name || v === null || v === undefined || v === false || typeof v === "function") return "";
    return name + '="' + esc(v === true ? "" : v) + '"';
  }).filter(Boolean).join(" ");
  var kids = node.children.map(toHtml).join("");
  if ({ input: 1, br: 1, img: 1, hr: 1 }[node.type]) return "<" + node.type + (attrs ? " " + attrs : "") + ">";
  return "<" + node.type + (attrs ? " " + attrs : "") + ">" + kids + "</" + node.type + ">";
}

/* ------------------------------------------------------------------ */
/*  Fixture: the shipped defaults + every surviving mode              */
/*  (the third row keeps a retired `mode: "persistent"` record on     */
/*  purpose: the panel must render it as 单次插入 / insert)           */
/* ------------------------------------------------------------------ */
var BUTTONS = [
  { id: "plan", label: "Plan", command: "/plan", commandOff: "/plan off", projection: "plan", mode: "toggle", enabled: true },
  { id: "teams", label: "团队", command: "/agent-teams", mode: "persistent", enabled: true },
  { id: "goal", label: "Goal", command: "/goal", mode: "insert", enabled: false },
];
var REF = [
  { name: "/plan", desc: "进入或退出计划模式。使用 /plan off 退出。" },
  { name: "/goal", desc: "设置或查看长期任务目标。支持: <目标>, clear, edit <目标>, pause, resume。" },
  { name: "/compact", desc: "压缩旧对话历史以释放上下文空间。" },
  { name: "/feedback", desc: "记录当前会话的反馈。" },
  { name: "/permission", desc: "切换权限预设(sandbox 模式 + 审批策略)。" },
  { name: "/export", desc: "将会话日志下载为 ZIP 压缩包。" },
  { name: "/model", desc: "打开模型选择弹窗, 切换当前使用的 LLM。" },
  { name: "/agent-teams", desc: "管理多智能体团队，创建、监控和协调多个 AI 协作完成任务" },
];

function panelHtml() {
  var html = toHtml([].concat(
    BUTTONS.map(function (btn) {
      return T.ButtonRow({ btn: btn, onChange: function () {}, onDelete: function () {} });
    }),
    /* .dsh-sw-empty only renders when there are no buttons; skipped here. */
    { type: "button", props: { type: "button", className: "dsh-sw-add" }, children: ["+ 添加按钮"] },
    refVnode()
  ));
  /* Static HTML has no React value binding: mark the matching <option> selected
   * so the preview shows the same mode text the live panel would. */
  return html.replace(/<select[^>]*value="([a-z]+)"[^>]*>([\s\S]*?)<\/select>/g, function (all, val, body) {
    return all.replace('<option value="' + val + '"', '<option selected value="' + val + '"');
  });
}

function refVnode() {
  return {
    type: "div", props: { className: "dsh-sw-cmd-ref" }, children: [
      { type: "button", props: { type: "button", className: "dsh-sw-cmd-ref-head", "aria-expanded": "true" }, children: [
        { type: "span", props: { className: "dsh-sw-cmd-ref-chev is-open" }, children: ["▸"] },
        { type: "span", props: {}, children: ["斜杠命令参考"] },
        { type: "span", props: { className: "dsh-sw-cmd-ref-count" }, children: ["(" + REF.length + ")"] },
      ] },
      { type: "div", props: { className: "dsh-sw-cmd-ref-list" }, children: REF.map(function (cmd) {
        return { type: "div", props: { className: "dsh-sw-cmd-ref-item" }, children: [
          { type: "span", props: { className: "dsh-sw-cmd-ref-name" }, children: [cmd.name] },
          { type: "span", props: { className: "dsh-sw-cmd-ref-desc" }, children: [cmd.desc] },
        ] };
      }) },
    ],
  };
}

/* Real DSW token values, extracted from @deepseek-ai/dsh-client-ui-theme. */
var TOKENS = {
  light: [
    "--dsw-alias-bg-base:#fff", "--dsw-alias-bg-layer-1:#fff", "--dsw-alias-bg-layer-2:#fff",
    "--dsw-alias-border-l1:#0000000a", "--dsw-alias-border-l2:#0000001a", "--dsw-alias-border-l3:#0000001f",
    "--dsw-alias-label-primary:#0f1115", "--dsw-alias-label-secondary:#61666b",
    "--dsw-alias-label-tertiary:#adb2b8", "--dsw-alias-label-caption:#adb2b8",
    "--dsw-alias-interactive-bg-hover:#2631480f", "--dsw-alias-interactive-bg-active:#2631481a",
    "--dsw-alias-interactive-bg-hover-danger:#ec131314",
    "--dsw-alias-state-business-primary:#4176e6", "--dsw-alias-state-business-tertiary:#e4edfd",
    "--dsw-alias-state-success-primary:#22c55e", "--dsw-alias-state-success-secondary:#4ed17e",
    "--dsw-alias-state-success-tertiary:#e6faed", "--dsw-alias-state-error-primary:#ec1313",
    "--dsw-specific-input-major:#fff", "--dsw-font-markdown-code-font-family:ui-monospace,Menlo,Consolas,monospace",
  ].join(";"),
  dark: [
    "--dsw-alias-bg-base:#151517", "--dsw-alias-bg-layer-1:#232324", "--dsw-alias-bg-layer-2:#2c2c2e",
    "--dsw-alias-border-l1:#ffffff0f", "--dsw-alias-border-l2:#ffffff1f", "--dsw-alias-border-l3:#ffffff29",
    "--dsw-alias-label-primary:#f9fafb", "--dsw-alias-label-secondary:#cfd3d6",
    "--dsw-alias-label-tertiary:#adb2b8", "--dsw-alias-label-caption:#81858c",
    "--dsw-alias-interactive-bg-hover:#ffffff14", "--dsw-alias-interactive-bg-active:#ffffff24",
    "--dsw-alias-interactive-bg-hover-danger:#f25a5a24",
    "--dsw-alias-state-business-primary:#679efe", "--dsw-alias-state-business-tertiary:#34415b",
    "--dsw-alias-state-success-primary:#22c55e", "--dsw-alias-state-success-secondary:#4ed17e",
    "--dsw-alias-state-success-tertiary:#233c2c", "--dsw-alias-state-error-primary:#f25a5a",
    "--dsw-specific-input-major:#2c2c2e", "--dsw-font-markdown-code-font-family:ui-monospace,Menlo,Consolas,monospace",
  ].join(";"),
};

var SHELL = function (theme) {
  return "<!doctype html><html><head><meta charset=\"utf-8\"><style>" +
    "body{margin:0;padding:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);" +
    "font:14px/1.5 -apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}" +
    "html{ " + TOKENS[theme] + " }" + css +
    ".dialog{width:809px;min-height:793px;display:flex;box-sizing:border-box}" +
    ".nav{width:172px;flex:none;padding:16px 8px;box-sizing:border-box;font-size:13px}" +
    ".nav div{padding:7px 10px;border-radius:8px;color:var(--dsw-alias-label-secondary)}" +
    ".nav .sel{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}" +
    ".body{flex:1;padding:18px 20px;box-sizing:border-box;min-width:0}" +
    ".h1{font-size:15px;font-weight:600;margin-bottom:14px}" +
    "</style></head><body><div class=\"dialog\">" +
    "<div class=\"nav\"><div>通用设置</div><div class=\"sel\">Switch Buttons</div><div>Theme / 外观</div><div>模型</div><div>插件</div></div>" +
    "<div class=\"body\"><div class=\"h1\">设置</div>" + panelHtml() + "</div></div></body></html>";
};

var outDir = process.argv[2] || path.join(__dirname, "..", ".preview");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "preview-dark.html"), SHELL("dark"), "utf8");
fs.writeFileSync(path.join(outDir, "preview-light.html"), SHELL("light"), "utf8");
fs.writeFileSync(path.join(outDir, "panel.css"), css, "utf8");
console.log("wrote " + outDir + "\\preview-dark.html, preview-light.html");

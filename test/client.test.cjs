/**
 * dsh-switch client behaviour tests (draft-level logic, no React mounting).
 *
 * Usage:  node test/client.test.cjs
 * Needs the jsdom installed in the DSH web profile (read-only dependency).
 *
 * Covers: the two surviving button types (开关命令 / 单次插入), the migration of
 * a stored `mode: "persistent"` to "insert", the Host settings plumbing (the
 * retired "armed" key is neither decoded nor written back), and the type-2
 * insert path: host composer face first, legacy DOM insertion only where the
 * face cannot serve (no face / chip-bearing draft / locked submit phase).
 */
var path = require("path");

/* jsdom lives in the DSH web profile's pnpm store. Its exact seat has moved
 * before (top level → profiles\node_modules, and it can also sit nested under
 * another package), so probe every known location before giving up. */
var PROFILE_MODULES = path.join(
  process.env.APPDATA || "",
  "dsh-desktop", "harness", "profiles", "web", "node_modules"
);
var JSDOM;
(function () {
  var harness = path.join(process.env.APPDATA || "", "dsh-desktop", "harness");
  var candidates = [
    path.join(PROFILE_MODULES, "jsdom"),
    path.join(harness, "profiles", "node_modules", "jsdom"),
    path.join(harness, "profiles", "web", ".dsh-module-fallback", "node_modules", "jsdom"),
    path.join(harness, "node_modules", "jsdom"),
  ];
  try {
    require("fs").readdirSync(PROFILE_MODULES).forEach(function (pkg) {
      if (pkg[0] === ".") return;
      if (pkg.indexOf("@") === 0) {
        try {
          require("fs").readdirSync(path.join(PROFILE_MODULES, pkg)).forEach(function (sub) {
            candidates.push(path.join(PROFILE_MODULES, pkg, sub, "node_modules", "jsdom"));
          });
        } catch (_) { /* scope without dirs */ }
        return;
      }
      candidates.push(path.join(PROFILE_MODULES, pkg, "node_modules", "jsdom"));
    });
  } catch (_) { /* unreadable store: only the fixed paths are tried */ }
  for (var i = 0; i < candidates.length; i++) {
    try { JSDOM = require(candidates[i]).JSDOM; return; } catch (_) { /* next */ }
  }
  console.error("Cannot load jsdom from " + PROFILE_MODULES + " (or its known fallbacks) — aborting.");
  process.exit(2);
})();

var dom = new JSDOM(
  '<!doctype html><html><body><div data-composer-input contenteditable="true"></div></body></html>',
  { url: "http://localhost/" }
);
var win = dom.window;
global.window = win;
global.document = win.document;
global.navigator = win.navigator;
global.localStorage = win.localStorage;
global.Event = win.Event;
global.CustomEvent = win.CustomEvent;

/* Minimal React stub — components are never mounted; module top-level just
 * needs require("react") to resolve. */
var reactStub = {
  createElement: function (t, p) {
    return { type: t, props: p, children: [].slice.call(arguments, 2) };
  },
  useState: function (init) {
    return [typeof init === "function" ? init() : init, function () {}];
  },
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

/* lib/client.js is a classic script (window.__ModuleLoader__ bundle); run it
 * through indirect eval so bare require/React stubs apply. */
var fs = require("fs");
var code = fs.readFileSync(path.join(__dirname, "..", "lib", "client.js"), "utf8");
(0, eval)(code);

if (!loaded || !loaded.__test) {
  console.error("client.js did not export __test — aborting.");
  process.exit(2);
}
var T = loaded.__test;

/* ------------------------------------------------------------------ */
/* Harness                                                            */
/* ------------------------------------------------------------------ */
var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (err) { fail++; console.error("FAIL  " + name + "\n      " + (err && err.message || err)); }
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || "eq") + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); }
function throwsNothing(fn) { fn(); }

function composer() { return document.querySelector('[data-composer-input]'); }
function draftText() { return composer().textContent; }
function resetDraft(text) { composer().textContent = text || ""; }
function clearLog() { T.insertLog.length = 0; }
function lastLog() { return T.insertLog[T.insertLog.length - 1]; }

var TOGGLE = { id: "plan", label: "Plan", command: "/plan", commandOff: "/plan off", mode: "toggle", enabled: true };
var INSERT = { id: "teams", label: "Teams", command: "/agent-teams", mode: "insert", enabled: true };

/** A host composer face: records every setDraft call instead of writing state. */
function makeFace(initial) {
  var face = {
    calls: [],
    actions: {
      setDraft: function (text) {
        face.calls.push(text);
        if (face.throwOnSet) throw new Error("editor disposed");
        face.input = Object.assign({}, face.input, { draft: text });
      },
      submit: function () {},
    },
    input: Object.assign({ draft: "", draftRev: 1, phase: "plain", occurrences: [], imageIds: [] }, initial || {}),
  };
  return face;
}

/**
 * Bind a face AND mirror its draft into the DOM: in the real shell the
 * contenteditable renders exactly what the editor state holds, and the insert
 * path refuses to trust a snapshot that disagrees with the DOM.
 */
function bindFace(sessionId, face) {
  T.bindComposerFace(sessionId, face.actions, face.input);
  if (face.input && !T.draftHasChips(face.input)) resetDraft(face.input.draft);
}
function unbindAllFaces() {
  Object.keys(T.composerFaces).forEach(function (id) { T.unbindComposerFace(id); });
}

/* ------------------------------------------------------------------ */
console.log("\n— button model: two types, persistent retired —");
test("MODE_ORDER lists exactly toggle + insert", function () {
  eq(T.MODE_ORDER.join("|"), "toggle|insert");
});
test("normalizeButton: stored persistent → insert (same command, one insertion per click)", function () {
  var p = { id: "teams", label: "团队", command: "/agent-teams", mode: "persistent", enabled: true };
  var n = T.normalizeButton(p);
  eq(n.mode, "insert");
  eq(n.label, "团队");
  eq(n.command, "/agent-teams");
  ok(n !== p, "migration returns a new record (so the change is detected)");
});
test("normalizeButton: legacy insert:true → mode insert (flag removed)", function () {
  var n = T.normalizeButton({ id: "x", insert: true, command: "/x" });
  eq(n.mode, "insert");
  ok(!("insert" in n), "legacy insert flag should be dropped");
});
test("normalizeButton: legacy single command → toggle", function () {
  eq(T.normalizeButton({ id: "x", command: "/x" }).mode, "toggle");
});
test("normalizeButton: surviving modes pass through unchanged (identity)", function () {
  ["toggle", "insert"].forEach(function (m) {
    var b = { id: "x", mode: m };
    ok(T.normalizeButton(b) === b, m + " must keep object identity");
  });
});
test("normalizeConfig: unchanged list keeps the same object", function () {
  var c = { buttons: [{ id: "a", mode: "toggle" }] };
  ok(T.normalizeConfig(c) === c);
});
test("normalizeConfig: mixed legacy + persistent list is migrated", function () {
  var c = { buttons: [
    { id: "a", insert: true, command: "/a" },
    { id: "b", command: "/b" },
    { id: "c", command: "/c", mode: "persistent" },
  ] };
  var n = T.normalizeConfig(c);
  eq(n.buttons.map(function (b) { return b.mode; }).join("|"), "insert|toggle|insert");
});
test("ButtonRow type select offers only the two surviving options", function () {
  var row = T.ButtonRow({ btn: { id: "c", label: "C", command: "/c", mode: "persistent", enabled: true }, onChange: function () {} });
  var select = findType(row);
  ok(select, "a type <select> was rendered");
  var optionNodes = [].concat.apply([], (select.children || []).filter(Boolean));
  var values = optionNodes.map(function (o) { return o.props.value; });
  eq(values.join("|"), "toggle|insert");
  eq(select.props.value, "insert", "the stored persistent button edits as insert");
});

/** Depth-first search for the composer-type <select> in a stub element tree. */
function findType(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "select") return node;
  var kids = (node.children || []).concat(node.props && node.props.children ? [node.props.children] : []);
  for (var i = 0; i < kids.length; i++) {
    var list = Array.isArray(kids[i]) ? kids[i] : [kids[i]];
    for (var j = 0; j < list.length; j++) {
      var found = findType(list[j]);
      if (found) return found;
    }
  }
  return null;
}

console.log("\n— Host settings plumbing: the retired \"armed\" key is dead —");
/** Install a fake settings scope; returns { api, decode, unbind } or null when refused. */
function withScope(rawDoc, body) {
  var captured = null;
  var writes = [];
  var binder = {
    bind: function (opts) {
      captured = opts;
      return {
        getSnapshot: function () {
          return { status: "ready", value: opts.decode(rawDoc) };
        },
        subscribe: function () { return function () {}; },
        set: function (key, value) { writes.push([key, value]); return Promise.resolve(); },
      };
    },
  };
  T.bindScope({ get: function (name) { return name === "settingsScope" ? binder : null; } });
  try {
    return body(captured, writes);
  } finally {
    T.bindScope({});           /* restore: no scope → cache path */
  }
}
test("decode accepts a document that still carries a stale armed key and ignores it", function () {
  withScope({ buttons: [TOGGLE, INSERT], armed: ["teams"] }, function (captured) {
    var decoded = captured.decode({ buttons: [TOGGLE, { id: "t", command: "/x", mode: "persistent", enabled: true }], armed: ["t"] });
    eq("armed" in decoded, false, "the client must never see an armed list");
    eq(decoded.buttons[1].mode, "insert", "persistent migrated on the read path");
    eq(captured.decode({ buttons: [TOGGLE], armed: [] }).buttons[0].mode, "toggle");
    eq(captured.decode({ armed: ["x"] }), undefined, "no buttons key → undefined (defaults stay in charge)");
  });
});
test("subscribeConfig emits the migrated Host value and never arms anything", function () {
  withScope({ buttons: [TOGGLE, INSERT], armed: ["teams"] }, function () {
    resetDraft("");
    var seen = null;
    var off = T.subscribeConfig(function (cfg) { seen = cfg; });
    try {
      ok(seen, "listener got a synchronous first value");
      ok(!("armed" in seen), "emitted config carries no armed key");
      eq(seen.buttons.map(function (b) { return b.mode; }).join("|"), "toggle|insert");
      eq(draftText(), "", "adopting a Host snapshot must not touch the draft any more");
    } finally { off(); }
  });
});
test("writeButtons writes ONLY the buttons key", function () {
  withScope({ buttons: [TOGGLE], armed: ["old"] }, function (captured, writes) {
    T.writeButtons([TOGGLE, { id: "t", label: "T", command: "/x", mode: "insert", enabled: true }]);
    eq(writes.map(function (w) { return w[0]; }).join("|"), "buttons");
    eq(writes[0][1].length, 2);
  });
});
test("cache round-trip: a persisted persistent button loads back as insert", function () {
  localStorage.setItem("dsh-switch-config", JSON.stringify({
    buttons: [{ id: "t", label: "T", command: "/x", mode: "persistent", enabled: true }],
    armed: ["t"],
  }));
  var cfg = T.loadCachedConfig();
  eq(cfg.buttons[0].mode, "insert");
  ok(!("armed" in cfg), "the cache reader drops the retired key too");
  localStorage.removeItem("dsh-switch-config");
  localStorage.removeItem("dsh-switch-config-initialized");
});
test("without a Host scope the client falls back to the cache (no throw)", function () {
  T.bindScope({});
  var seen = null;
  var off = T.subscribeConfig(function (cfg) { seen = cfg; });
  try { ok(seen && Array.isArray(seen.buttons), "cache path still yields a config"); }
  finally { off(); }
});

console.log("\n— type-2 insert: host composer face first —");
test("empty draft + bound face → setDraft gets the command, DOM left alone", function () {
  unbindAllFaces(); resetDraft(""); clearLog();
  var face = makeFace({ draft: "" });
  bindFace("s1", face);
  ok(T.insertAtDraftStart("s1", "/agent-teams "), "insert attempted");
  eq(face.calls.join("|"), "/agent-teams ");
  eq(draftText(), "", "no direct DOM mutation when the editor state is writable");
  eq(lastLog().kind, "setDraft");
  unbindAllFaces();
});
test("existing text stays AFTER the command (insert-before-content contract)", function () {
  unbindAllFaces(); clearLog();
  var face = makeFace({ draft: "研究一下定价" });
  bindFace("s1", face);
  T.insertAtDraftStart("s1", "/agent-teams ");
  eq(face.calls.join("|"), "/agent-teams 研究一下定价");
  unbindAllFaces();
});
test("a number-ish session id still resolves its face", function () {
  unbindAllFaces(); clearLog();
  var face = makeFace({ draft: "" });
  bindFace(42, face);
  T.insertAtDraftStart("42", "/compact ");
  eq(face.calls.join("|"), "/compact ");
  unbindAllFaces();
});
test("reference chips in the draft → legacy DOM path (setDraft would flatten them)", function () {
  unbindAllFaces(); resetDraft("keep this"); clearLog();
  var face = makeFace({ draft: "keep this", occurrences: [{ occurrenceId: 1, invalid: false }] });
  bindFace("s1", face);
  T.insertAtDraftStart("s1", "/plan ");
  eq(face.calls.length, 0, "setDraft must not run on a chip-bearing draft");
  eq(draftText(), "/plan keep this");
  eq(lastLog().kind, "dom");
  unbindAllFaces(); resetDraft("");
});
test("submit phase locked (adjudicating) → no editor-state write", function () {
  unbindAllFaces(); resetDraft("queued"); clearLog();
  var face = makeFace({ draft: "queued", phase: "adjudicating" });
  bindFace("s1", face);
  T.insertAtDraftStart("s1", "/plan ");
  eq(face.calls.length, 0);
  eq(lastLog().kind, "dom");
  unbindAllFaces(); resetDraft("");
});
test("face without a readable draft → DOM fallback, never a blind write", function () {
  unbindAllFaces(); resetDraft("typed"); clearLog();
  var face = makeFace({ draft: "typed" });
  T.bindComposerFace("s1", face.actions, null);
  T.insertAtDraftStart("s1", "/plan ");
  eq(face.calls.length, 0);
  eq(draftText(), "/plan typed");
  unbindAllFaces(); resetDraft("");
});
test("a throwing setDraft degrades to the DOM path and says so in the log", function () {
  unbindAllFaces(); clearLog();
  var face = makeFace({ draft: "" });
  face.throwOnSet = true;
  bindFace("s1", face);
  T.insertAtDraftStart("s1", "/plan ");
  eq(T.insertLog.length, 2, "one failure record + one DOM record");
  ok(/^setDraft-failed/.test(T.insertLog[0].kind), T.insertLog[0].kind);
  eq(lastLog().kind, "dom");
  eq(draftText(), "/plan ");
  unbindAllFaces(); resetDraft("");
});
test("a snapshot that disagrees with the DOM is never echoed back (no lost typing)", function () {
  unbindAllFaces(); clearLog();
  var face = makeFace({ draft: "" });
  T.bindComposerFace("s1", face.actions, face.input);
  resetDraft("正在输入的文本");            // the user typed after our last render
  T.insertAtDraftStart("s1", "/plan ");
  eq(face.calls.length, 0, "setDraft with a stale draft would erase the input");
  eq(T.insertLog[0].kind, "skip:stale-snapshot");
  eq(lastLog().kind, "dom");
  eq(draftText(), "/plan 正在输入的文本");
  unbindAllFaces(); resetDraft("");
});
test("no face for this session → DOM path is still used (host without the slot props)", function () {
  unbindAllFaces(); resetDraft(""); clearLog();
  ok(T.insertAtDraftStart("ghost", "/plan "), "falls back");
  eq(lastLog().kind, "dom");
  eq(draftText(), "/plan ");
});
test("unbindComposerFace forgets the session, so a stale store is never written", function () {
  unbindAllFaces();
  var face = makeFace({ draft: "" });
  bindFace("s9", face);
  ok(T.composerFaces.s9, "bound");
  T.unbindComposerFace("s9");
  ok(!T.composerFaces.s9, "unbound");
  clearLog(); resetDraft("live");
  T.insertAtDraftStart("s9", "/plan ");
  eq(face.calls.length, 0, "the unbound face must not receive writes");
  resetDraft("");
});
test("no contenteditable composer in the document → no-editor, no throw", function () {
  unbindAllFaces(); clearLog();
  var el = composer();
  el.setAttribute("contenteditable", "false");
  try {
    var attempted = T.insertAtDraftStart("s1", "/plan ");
    eq(attempted, false);
    eq(lastLog().kind, "no-editor");
  } finally {
    el.setAttribute("contenteditable", "true");
  }
});

console.log("\n— guards —");
test("draftHasChips: occurrences or a raw U+FFFC placeholder both count", function () {
  eq(T.draftHasChips({ draft: "", occurrences: [] }), false);
  eq(T.draftHasChips({ draft: "", occurrences: [{}] }), true);
  eq(T.draftHasChips({ draft: "\uFFFC x", occurrences: [] }), true);
  eq(T.draftHasChips(null), false);
});
test("draftLocked: only the reading/submitting phases block a write", function () {
  eq(T.draftLocked({ phase: "plain" }), false);
  eq(T.draftLocked({ phase: "claimed" }), false);
  eq(T.draftLocked({}), false, "an older host without a phase field stays writable");
  eq(T.draftLocked({ phase: "adjudicating" }), true);
  eq(T.draftLocked({ phase: "submitting" }), true);
  eq(T.draftLocked(undefined), false);
});

console.log("\n— legacy DOM helpers —");
test("insertIntoComposerInput lands BEFORE existing content", function () {
  resetDraft("research pricing");
  T.insertIntoComposerInput("/agent-teams ");
  eq(draftText(), "/agent-teams research pricing");
});
test("getComposerText reflects the draft", function () {
  resetDraft("hello");
  eq(T.getComposerText(), "hello");
});
test("no retired symbol is reachable from the shipped surface", function () {
  ["setArmed", "adoptArmed", "applyHostArmed", "armedCommandsFor", "armedIds", "prependArmedNow",
   "computePrefix", "installDraftWatcher", "loadArmedCache", "pruneArmedTo", "clearComposerText",
   "subscribeArmed", "maybePrependArmedOnEmptyDraft",
  ].forEach(function (name) {
    eq(T[name], undefined, "__test." + name + " must be gone");
  });
  eq(localStorage.getItem("dsh-switch-armed"), null, "the armed mirror must no longer exist");
});
test("a stored persistent button can never fall through to the execute path", function () {
  unbindAllFaces(); resetDraft("keep me"); clearLog();
  var executed = [];
  var node = T.SwitchButton({
    btn: { id: "t", label: "团队", command: "/agent-teams", mode: "persistent", enabled: true },
    ctx: { remote: { commands: { execute: function (sid, cmd) { executed.push(cmd); return Promise.resolve({ ok: true }); } } } },
    sessionId: undefined,
    useProjection: null,
    localState: false,
    onLocalStateChange: function () {},
    busy: false, setBusy: function () {}, error: null, setError: function () {},
    onPrefixChange: function () {},
  });
  ok(node.props.className.indexOf("is-insert") >= 0, "renders as insert: " + node.props.className);
  node.props.onClick();
  eq(executed.length, 0, "commands.execute must not run for a type-2 record");
  eq(draftText(), "/agent-teams keep me");
  resetDraft("");
});

console.log("\n— official Plan chip coexistence —");
var PLAN_BTN = { id: "plan", label: "Plan", command: "/plan", commandOff: "/plan off", projection: "plan", mode: "toggle", enabled: true };
function renderPlanBtn(projectionValue) {
  return T.SwitchButton({
    btn: PLAN_BTN,
    ctx: { remote: { commands: { execute: function () { return Promise.resolve({ ok: true }); } } } },
    sessionId: undefined,
    useProjection: function () { return projectionValue; },
    localState: false,
    onLocalStateChange: function () {},
    busy: false, setBusy: function () {}, error: null, setError: function () {},
    onPrefixChange: function () {},
  });
}
test("probe reports the official chip by its stable class", function () {
  eq(T.officialPlanChipPresent(), false, "no chip in this document");
  var chip = document.createElement("button");
  chip.className = "REN-qG_wrap";
  var inner = document.createElement("button");
  inner.className = "REN-qG_chip";
  chip.appendChild(inner);
  document.body.appendChild(chip);
  try {
    eq(T.officialPlanChipPresent(), true);
  } finally {
    document.body.removeChild(chip);
  }
});
test("the plan button hides while the chip is mounted and plan is active", function () {
  var chip = document.createElement("button");
  chip.className = "REN-qG_chip";
  document.body.appendChild(chip);
  try {
    eq(renderPlanBtn({ active: true, pending: false }), null, "active + chip → suppressed");
    var off = renderPlanBtn({ active: false, pending: false });
    ok(off && off.type === "button", "inactive + chip → still shown");
    var pend = renderPlanBtn({ active: false, pending: true });
    ok(pend && pend.type === "button", "pending switch → still shown (exit affordance)");
  } finally {
    document.body.removeChild(chip);
  }
});
test("without the chip the plan button behaves exactly as before", function () {
  var node = renderPlanBtn({ active: true, pending: false });
  ok(node && node.props.className.indexOf("is-active") >= 0, "active renders highlighted: " + (node && node.props.className));
});

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail ? 1 : 0);

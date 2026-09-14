/**
 * dsh-switch — Client half (DSH ModuleLoader bundle).
 *
 * Renders customisable switch-buttons in the chat input bar and a
 * configuration panel inside Settings → "Switch Buttons".
 *
 * Exactly two button types (`mode` field):
 *
 * 1. "toggle" — Plan-style command switch. Has an on-command and an
 *    off-command plus an optional host projection key for real-time
 *    state. Clicking executes the appropriate command on the host.
 * 2. "insert" — only a slash command. Each click inserts
 *    "<command> " into the composer draft, BEFORE any existing
 *    content (one insertion per click).
 *
 * The type-3 "persistent" (auto-prefix-every-send) mode was retired in
 * v1.4.0 together with its whole arm registry: it wrote the draft
 * through DOM mutations that the shell's Lexical editor reconciled away
 * (and the composer's own draft-restore could overwrite). A stored
 * `mode: "persistent"` is migrated to "insert" on read, so the button
 * keeps working; the Host "armed" key is no longer read or written.
 *
 * Insert writes go through the host composer face (`inputActions`,
 * provided by the `conversation.input.left` slot) whenever it is bound,
 * i.e. through the editor's own state. The legacy
 * `document.execCommand('insertText')` path remains ONLY where a face
 * cannot serve: another session's draft, or a draft carrying reference
 * chips (setDraft would flatten them into plain text).
 *
 * Configuration persisted in the Host settings document (namespace
 * "dsh-switch", registered by the host half); localStorage is only a
 * first-paint cache / non-loopback fallback. Legacy configs without
 * `mode` are normalised on read (insert→"insert", else "toggle").
 */
window.__ModuleLoader__.load({
  id: "dsh-switch",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var h = react.createElement;

    /* ---------------------------------------------------------- */
    /*  CSS — official DSW style tokens, follows light/dark theme   */
    /* ---------------------------------------------------------- */
    if (typeof document !== "undefined" && !document.getElementById("dsh-switch-style")) {
      var style = document.createElement("style");
      style.id = "dsh-switch-style";
      style.textContent = [
        ".dsh-sw-bar{display:inline-flex;flex-wrap:wrap;gap:2px;align-items:center}",
        /* Composer tool-row spacing: the host row puts a 16px gap between the
         * "+" / mode cluster / our slot, and 12px inside the mode cluster.
         * Tighten both to 8px so text buttons sit closer to their neighbours;
         * !important guards against skins re-ordering these rules. */
        "[data-slot=\"conversation.input.left\"]{margin-left:0!important}",
        ".VphDDa_tools,.VphDDa_modes{gap:8px!important}",
        /* Text-only buttons: no border, no fixed height — size comes from
         * the symmetrical padding so the label sits optically centered. */
        ".dsh-sw-btn{display:inline-flex;align-items:center;justify-content:center;padding:4px 8px;flex:none;border:none;background:transparent;border-radius:6px;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;font-size:12px;font-weight:500;gap:4px;transition:background .15s,color .15s,transform .1s;white-space:nowrap}",
        ".dsh-sw-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.06));color:var(--dsw-alias-label-primary,#333)}",
        ".dsh-sw-btn:active:not(:disabled){transform:scale(.96)}",
        ".dsh-sw-btn:disabled{opacity:.5;cursor:default}",
        ".dsh-sw-btn.is-active{background:transparent;color:var(--dsw-alias-state-success-primary,#16a34a);font-weight:600}",
        ".dsh-sw-btn.is-active:hover:not(:disabled){background:var(--dsw-alias-state-success-tertiary,#f0fdf4)}",
        ".dsh-sw-btn.is-pending{opacity:.7;cursor:wait}",
        ".dsh-sw-btn.is-error{color:var(--dsw-alias-state-error-primary,#d03050)}",
        /* Insert-mode (type 2) button style */
        ".dsh-sw-btn.is-insert{color:var(--dsw-alias-state-business-primary,#3b82f6)}",
        ".dsh-sw-btn.is-insert:hover:not(:disabled){background:var(--dsw-alias-state-business-tertiary,#eff6ff)}",
        ".dsh-sw-btn-icon{font-size:11px;opacity:.7}",
        /* Prefix tag shown next to active buttons */
        ".dsh-sw-prefix{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:4px;background:var(--dsw-alias-state-business-tertiary,#eff6ff);color:var(--dsw-alias-state-business-primary,#2563eb);font-size:11px;font-weight:500;gap:4px}",
        ".dsh-sw-prefix-icon{font-size:10px}",
        /* Settings panel — one card per button + a fixed 12-column field grid.
         * Tracks are minmax(0,1fr), so fields shrink instead of wrapping:
         * every card keeps the same shape whatever the mode or panel width. */
        ".dsh-sw-panel{padding:4px 0;display:flex;flex-direction:column;gap:10px}",
        ".dsh-sw-card{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#e6e6e6);border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}",
        ".dsh-sw-card-head{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));align-items:start;gap:8px}",
        ".dsh-sw-tools{height:28px;display:flex;align-items:center;justify-content:flex-end;gap:8px}",
        ".dsh-sw-fields{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px}",
        ".dsh-sw-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
        ".dsh-sw-field--s3{grid-column:span 3}",
        ".dsh-sw-field--s4{grid-column:span 4}",
        ".dsh-sw-field--s5{grid-column:span 5}",
        ".dsh-sw-field--full{grid-column:1/-1}",
        ".dsh-sw-field-label{font-size:11px;line-height:1.2;color:var(--dsw-alias-label-tertiary,#999);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".dsh-sw-field-label--ghost{visibility:hidden}",
        ".dsh-sw-input{width:100%;box-sizing:border-box;min-width:0;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:6px;font-size:13px;background:var(--dsw-specific-input-major,#fff);color:var(--dsw-alias-label-primary,#333);outline:none;font-family:inherit}",
        ".dsh-sw-input::placeholder{color:var(--dsw-alias-label-caption,#b3b3b3)}",
        ".dsh-sw-select{width:100%;box-sizing:border-box;min-width:0;height:28px;padding:0 6px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:6px;font-size:12px;background:var(--dsw-specific-input-major,#fff);color:var(--dsw-alias-label-primary,#333);outline:none;cursor:pointer;font-family:inherit}",
        ".dsh-sw-input:hover,.dsh-sw-select:hover{border-color:var(--dsw-alias-border-l3,#b5b5b5)}",
        ".dsh-sw-input:focus,.dsh-sw-select:focus{border-color:var(--dsw-alias-state-business-primary,#3b82f6);box-shadow:0 0 0 2px var(--dsw-alias-state-business-tertiary,rgba(59,130,246,.14))}",
        ".dsh-sw-empty{display:flex;align-items:center;justify-content:center;padding:20px 12px;border:1px dashed var(--dsw-alias-border-l3,#d0d0d0);border-radius:10px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}",
        ".dsh-sw-add{width:100%;height:32px;display:flex;align-items:center;justify-content:center;gap:4px;border:1px dashed var(--dsw-alias-border-l3,#c4c4c4);border-radius:10px;cursor:pointer;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:12px;font-weight:500;font-family:inherit;transition:background .15s,color .15s,border-color .15s}",
        ".dsh-sw-add:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));border-color:var(--dsw-alias-state-business-primary,#3b82f6);color:var(--dsw-alias-label-primary,#333)}",
        ".dsh-sw-del{width:28px;height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:none;cursor:pointer;color:var(--dsw-alias-label-tertiary,#999);font-size:16px;line-height:1;padding:0;transition:background .15s,color .15s}",
        ".dsh-sw-del:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(208,48,80,.12));color:var(--dsw-alias-state-error-primary,#d03050)}",
        ".dsh-sw-toggle{width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;position:relative;transition:background .2s;background:var(--dsw-alias-interactive-bg-active,#c9c9c9);flex:none;padding:0}",
        ".dsh-sw-toggle--on{background:var(--dsw-alias-state-success-primary,#16a34a)}",
        ".dsh-sw-toggle::after{content:'';position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;top:2px;left:2px;transition:left .2s;box-shadow:0 1px 2px rgba(0,0,0,.2)}",
        ".dsh-sw-toggle--on::after{left:18px}",
        /* Slash commands reference (collapsible, responsive columns) */
        ".dsh-sw-cmd-ref{margin-top:2px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1,#ececec);display:flex;flex-direction:column;gap:8px}",
        ".dsh-sw-cmd-ref-head{display:flex;align-items:center;gap:6px;width:100%;padding:2px 0;border:none;background:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#666);text-align:left}",
        ".dsh-sw-cmd-ref-head:hover{color:var(--dsw-alias-label-primary,#333)}",
        ".dsh-sw-cmd-ref-chev{display:inline-block;font-size:10px;line-height:1;transition:transform .15s}",
        ".dsh-sw-cmd-ref-chev.is-open{transform:rotate(90deg)}",
        ".dsh-sw-cmd-ref-count{font-weight:400;color:var(--dsw-alias-label-caption,#aaa)}",
        ".dsh-sw-cmd-ref-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px}",
        ".dsh-sw-cmd-ref-item{display:flex;align-items:baseline;gap:8px;min-width:0;padding:5px 8px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));font-size:12px;line-height:1.45}",
        ".dsh-sw-cmd-ref-name{flex:none;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;font-weight:600;color:var(--dsw-alias-state-business-primary,#2563eb)}",
        ".dsh-sw-cmd-ref-desc{flex:1;min-width:0;color:var(--dsw-alias-label-secondary,#666);word-break:break-word}",
      ].join("\n");
      document.head.appendChild(style);
    }

    /* ---------------------------------------------------------- */
    /*  i18n (zh / en by navigator.language)                        */
    /* ---------------------------------------------------------- */
    function getSystemLanguage() {
      var lang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
      if (lang.startsWith("zh")) return "zh";
      return "en";
    }

    var UI_I18N = {
      en: {
        add: "+ Add Button",
        loading: "Loading\u2026",
        labelPlaceholder: "Label",
        modeToggle: "Toggle",
        modeInsert: "Insert",
        modeTitleToggle: "Type 1 \u2014 has an on-command, an off-command and an optional host projection key (e.g. Plan)",
        modeTitleInsert: "Type 2 \u2014 each click inserts the slash command into the composer, before existing content",
        cmdTogglePlaceholder: "On command, e.g. /plan",
        cmdPlainPlaceholder: "Slash command, e.g. /agent-teams",
        offPlaceholder: "Off command, e.g. /plan off",
        projPlaceholder: "plan",
        projTitle: "Host projection key for real-time state (e.g. 'plan')",
        fieldOn: "On command",
        fieldOff: "Off command",
        fieldProjection: "State key",
        fieldCommand: "Slash command",
        fieldName: "Name",
        fieldMode: "Type",
        empty: "No buttons yet \u2014 add one below.",
        refToggle: "Available slash commands",
        remove: "Remove",
        enabledOn: "Enabled",
        enabledOff: "Disabled",
        tipInsert: "Click to insert \u201c{cmd} \u201d before the input content",
      },
      zh: {
        add: "+ 添加按钮",
        loading: "加载中…",
        labelPlaceholder: "名称",
        modeToggle: "开关命令",
        modeInsert: "单次插入",
        modeTitleToggle: "第 1 类 — 有开启命令、关闭命令，可填 host 状态键（如 Plan）",
        modeTitleInsert: "第 2 类 — 每次点击把斜杠命令插入输入框已有内容之前",
        cmdTogglePlaceholder: "如 /plan",
        cmdPlainPlaceholder: "如 /agent-teams",
        offPlaceholder: "如 /plan off",
        projPlaceholder: "如 plan",
        projTitle: "host 投影名称，实时同步状态（如 plan）",
        fieldOn: "开启命令",
        fieldOff: "关闭命令",
        fieldProjection: "状态键",
        fieldCommand: "斜杠命令",
        fieldName: "名称",
        fieldMode: "类型",
        empty: "还没有按钮，在下方添加一个。",
        refToggle: "可用斜杠命令",
        remove: "删除",
        enabledOn: "已启用",
        enabledOff: "已停用",
        tipInsert: "点击把“{cmd} ”插入到输入内容之前",
      },
    };

    function getUiStrings() {
      return UI_I18N[getSystemLanguage()] || UI_I18N.en;
    }

    /* ---------------------------------------------------------- */
    /*  Config — Host settings document (persistent) + cache        */
    /*                                                            */
    /*  Source of truth: the Host settings namespace "dsh-switch"   */
    /*  (registered by the host half, stored in settings.yaml).     */
    /*  localStorage is only a first-paint cache and the fallback    */
    /*  when the settings service is unavailable (non-loopback).     */
    /* ---------------------------------------------------------- */
    var SETTINGS_NS = "dsh-switch";
    var STORAGE_KEY = "dsh-switch-config";
    var STORAGE_KEY_INITIALIZED = "dsh-switch-config-initialized";

    var DEFAULT_BUTTONS = [
      { id: "plan", label: "Plan", command: "/plan", commandOff: "/plan off", projection: "plan", mode: "toggle", enabled: true },
      { id: "agent-teams", label: "Teams", command: "/agent-teams", mode: "insert", enabled: true },
    ];

    /**
     * Migrate a stored button record to the 2-type model. A retired
     * `mode: "persistent"` becomes "insert" (same command, one click per
     * insertion, so nothing disappears from the bar). Legacy records with no
     * `mode`: `insert: true` → "insert"; anything else → "toggle" (the old
     * single-command buttons keep working: commandOff/projection optional).
     */
    function normalizeButton(b) {
      if (!b || typeof b !== "object") return b;
      if (b.mode === "toggle" || b.mode === "insert") return b;
      var out = Object.assign({}, b);
      delete out.insert;
      out.mode = b.mode === "persistent" || b.insert ? "insert" : "toggle";
      return out;
    }

    function normalizeConfig(cfg) {
      if (!cfg || !Array.isArray(cfg.buttons)) return cfg;
      var changed = false;
      var buttons = cfg.buttons.map(function (b) {
        var n = normalizeButton(b);
        if (n !== b) changed = true;
        return n;
      });
      return changed ? { buttons: buttons } : cfg;
    }

    function defaultConfig() {
      return { buttons: DEFAULT_BUTTONS.map(function (b) { return Object.assign({}, b); }) };
    }

    /** Read the localStorage cache (first paint / fallback when Host is absent). */
    function loadCachedConfig() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.buttons)) return normalizeConfig(parsed);
        }
        // Cache empty but the user customized before: stay empty, do not
        // resurrect deleted buttons.
        if (localStorage.getItem(STORAGE_KEY_INITIALIZED)) {
          return { buttons: [] };
        }
      } catch (_) { /* ignore */ }
      return defaultConfig();
    }

    /** Mirror of the last known config into localStorage. */
    function saveCache(config) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        localStorage.setItem(STORAGE_KEY_INITIALIZED, "true");
      } catch (_) { /* ignore */ }
    }

    /** The bound settings scope (set by bindScope during apply); null until then. */
    var scope = null;

    /** Bind ctx.settingsScope for the "dsh-switch" namespace, if available. */
    function bindScope(ctx) {
      var binder = null;
      try {
        binder = (typeof ctx.get === "function" ? ctx.get("settingsScope") : null) || ctx.settingsScope || null;
      } catch (_) { binder = null; }
      if (!binder || typeof binder.bind !== "function") { scope = null; return; }
      try {
        scope = binder.bind({
          namespace: SETTINGS_NS,
          decode: function (v) {
            if (!v || !Array.isArray(v.buttons)) return undefined;
            /* The retired "armed" key is deliberately not decoded: an
             * obsolete Host-side value must never resurrect arming. */
            return normalizeConfig({ buttons: v.buttons });
          },
        });
      } catch (_) { scope = null; }
    }

    /** Drop undefined-valued keys so the value is clean JSON for the wire. */
    function stripUndefined(buttons) {
      return buttons.map(function (b) {
        var out = {};
        Object.keys(b).forEach(function (k) {
          if (b[k] !== undefined) out[k] = b[k];
        });
        return out;
      });
    }

    /** Persist the button list: Host settings document (authoritative) + cache. */
    function writeButtons(buttons) {
      var clean = stripUndefined(buttons);
      var next = { buttons: clean };
      saveCache(next);
      window.dispatchEvent(new CustomEvent("dsh-switch-config-updated"));
      if (scope) {
        // Revision fencing, fold-back and recovery-read are the scope's job;
        // on failure the mirror re-syncs the Host truth into every subscriber.
        Promise.resolve(scope.set("buttons", clean)).catch(function () { /* recovery via mirror */ });
      }
    }

    /**
     * Subscribe to config updates (Host scope when available, cache events
     * otherwise). Calls the listener synchronously with the best current
     * value, then on every change. Returns the unsubscribe function.
     */
    function subscribeConfig(listener) {
      var offScope = null;
      function emit(cfg) {
        latestConfig = cfg;
        listener(cfg);
      }
      function fromCache() { emit(loadCachedConfig()); }
      if (scope) {
        var snap = scope.getSnapshot();
        if (snap && snap.status === "ready" && snap.value) {
          saveCache(snap.value);
          emit(snap.value);
        } else {
          fromCache();
        }
        offScope = scope.subscribe(function (s) {
          if (s && s.status === "ready" && s.value) {
            saveCache(s.value);
            emit(s.value);
          }
        });
      } else {
        fromCache();
      }
      function onStorage(e) { if (e.key === STORAGE_KEY) fromCache(); }
      window.addEventListener("storage", onStorage);
      window.addEventListener("dsh-switch-config-updated", fromCache);
      return function () {
        if (offScope) offScope();
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("dsh-switch-config-updated", fromCache);
      };
    }

    /* ---------------------------------------------------------- */
    /*  Diagnostics + last-known config                             */
    /* ---------------------------------------------------------- */
    var latestConfig = null;
    /** Bounded ring of insert decisions, readable through window.__dshSwitch.log(). */
    var insertLog = [];

    function pushLog(ring, entry) {
      ring.push(entry);
      if (ring.length > 40) ring.shift();
      /* Console chatter is opt-in (localStorage dsh-switch-debug = "1", or
       * window.__dshSwitchVerbose = true); the rings always fill up. */
      if (!debugOn()) return;
      try { console.debug("[dsh-switch]", entry); } catch (_) { /* console absent */ }
    }

    function debugOn() {
      try {
        if (window.__dshSwitchVerbose === true) return true;
        return localStorage.getItem("dsh-switch-debug") === "1";
      } catch (_) { return false; }
    }


    /* ---------------------------------------------------------- */
    /*  Helper: Insert text into the composer input (Lexical editor) */
    /* ---------------------------------------------------------- */

    /**
     * LEGACY / FALLBACK write: insert text at the START of the composer's
     * contenteditable through `document.execCommand('insertText')`.
     *
     * This mutates the DOM only. The shell's Lexical editor keeps its own
     * state and rewrites the DOM from it on its next update (focus change,
     * keystroke, or its persisted-draft restore), so an insertion made here
     * can vanish without a trace — which is exactly why the type-2 click path
     * prefers {@link insertAtDraftStart}. Kept for the two cases the face
     * cannot serve: no face bound for this session (bar mounted by an older
     * shell, or no session yet) and a chip-bearing draft, where setDraft would
     * flatten the reference nodes into plain text.
     * @param {string} text - The text to insert (e.g. "/agent-teams ")
     * @returns {boolean} Whether an editor element was found to write into
     */
    function insertIntoComposerInput(text) {
      var el = document.querySelector('[data-composer-input][contenteditable="true"]');
      if (!el) return false;

      // Focus the editor
      try { el.focus(); } catch (_) { /* ignore */ }

      // Collapse the selection to the very beginning so the command lands
      // before existing content
      var sel = null;
      try { sel = window.getSelection ? window.getSelection() : null; } catch (_) { sel = null; }
      if (sel && typeof sel.removeAllRanges === "function") {
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(true); // collapse to start
        sel.removeAllRanges();
        sel.addRange(range);
      }

      // Use execCommand to insert text — this triggers beforeinput events
      // that Lexical's editor processes through its own reconciliation.
      // A throwing execCommand must never break the user's keypress.
      var inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch (_) { inserted = false; }
      if (!inserted) {
        // Fallback: prepend into the text content directly.
        // This is less ideal but works if execCommand is unavailable.
        var cur = el.textContent || "";
        try {
          el.textContent = text + cur;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) { /* give up quietly */ }
      }
      return true;
    }

    /** Current plain text of the composer editor ("" when absent). */
    function getComposerText() {
      var el = document.querySelector('[data-composer-input][contenteditable="true"]');
      return el ? (el.textContent || "") : "";
    }

    /* ---------------------------------------------------------- */
    /*  Composer faces (host-owned draft write path)                */
    /*                                                            */
    /*  The conversation shell hands every `conversation.input.left` */
    /*  registrant two props: `inputActions` (setDraft/submit/…) and */
    /*  the point-in-time `input` InputState { draft, draftRev,     */
    /*  phase, occurrences, imageIds }. Recording them per session   */
    /*  on every render gives the insert path an authoritative write */
    /*  that goes through the editor's own state — the only write    */
    /*  that survives Lexical reconciliation and the shell's          */
    /*  persisted-draft restore.                                     */
    /* ---------------------------------------------------------- */
    var composerFaces = {};

    /** The registry key for a session id (host ids are strings; stay tolerant). */
    function faceKey(sessionId) {
      return sessionId === null || sessionId === void 0 || sessionId === "" ? null : String(sessionId);
    }

    /** Record (or refresh) one session's composer face; called from SwitchBar. */
    function bindComposerFace(sessionId, actions, input) {
      var key = faceKey(sessionId);
      if (!key) return;
      if (!composerFaces[key]) composerFaces[key] = {};
      var face = composerFaces[key];
      if (actions && typeof actions.setDraft === "function") face.actions = actions;
      if (input && typeof input.draft === "string") face.input = input;
    }

    /** Forget a face whose bar unmounted, so a stale store is never written to. */
    function unbindComposerFace(sessionId) {
      var key = faceKey(sessionId);
      if (key) delete composerFaces[key];
    }

    /** True when the draft holds reference chips — setDraft would flatten them. */
    function draftHasChips(input) {
      if (!input) return false;
      if (Array.isArray(input.occurrences) && input.occurrences.length > 0) return true;
      return String(input.draft || "").indexOf("\uFFFC") >= 0;
    }

    /** True while the submit machine may be reading the draft — never write then. */
    function draftLocked(input) {
      var phase = input && input.phase;
      return phase === "adjudicating" || phase === "submitting";
    }

    /**
     * The type-2 write: put `text` at the very START of one session's draft.
     * Prefers the host face; falls back to the legacy DOM insertion when no
     * face is bound for that session, the draft carries chips, the submit
     * machine is reading, or the recorded snapshot disagrees with the DOM
     * (a stale snapshot must never be echoed back through setDraft — it would
     * erase whatever the user typed since).
     * @returns {boolean} whether an insertion was attempted at all.
     */
    function insertAtDraftStart(sessionId, text) {
      var face = composerFaces[faceKey(sessionId)];
      var actions = face && face.actions;
      var input = face && face.input;
      var domText = getComposerText();
      if (actions && input && !draftHasChips(input) && !draftLocked(input)) {
        var stateBefore = input.draft;
        if (stateBefore === domText) {
          /* The recorded snapshot agrees with the live editor — write through
           * the face so the change lands in the editor's own state. */
          try {
            actions.setDraft(text + stateBefore);
            var el = document.querySelector('[data-composer-input][contenteditable="true"]');
            if (el) { try { el.focus(); } catch (_) { /* ignore */ } }
            logInsert("setDraft", text, stateBefore, text + stateBefore);
            return true;
          } catch (err) {
            logInsert("setDraft-failed:" + (err && err.message || err), text, stateBefore, getComposerText());
          }
        } else {
          /* Our render-time snapshot lags the editor. Echoing it back through
           * setDraft would erase whatever the user typed since, and the DOM
           * path is the only one that reads the draft live. */
          logInsert("skip:stale-snapshot", text, stateBefore, domText);
        }
      }
      var domBefore = getComposerText();
      var attempted = insertIntoComposerInput(text);
      logInsert(attempted ? "dom" : "no-editor", text, domBefore, getComposerText());
      return attempted;
    }

    function logInsert(kind, text, before, after) {
      pushLog(insertLog, { t: Date.now(), kind: kind, text: text, before: before, after: after });
    }

    /* ---------------------------------------------------------- */
    /*  Slash commands reference data (i18n)                        */
    /* ---------------------------------------------------------- */
    var SLASH_COMMANDS_I18N = {
      en: {
        title: "Slash Commands Reference",
        commands: [
          { name: "/plan", desc: "Enter or leave plan mode. Use /plan off to exit." },
          { name: "/goal", desc: "Set or view the goal for a long-running task. Supports: <objective>, clear, edit <objective>, pause, resume." },
          { name: "/compact", desc: "Compact older conversation history to free up context space." },
          { name: "/feedback", desc: "Record feedback about this session." },
          { name: "/permission", desc: "Switch the permission preset (sandbox mode + approval policy)." },
          { name: "/export", desc: "Download this session log as a ZIP archive." },
          { name: "/model", desc: "Open model selection popup to switch the active LLM." },
        ]
      },
      zh: {
        title: "斜杠命令参考",
        commands: [
          { name: "/plan", desc: "进入或退出计划模式。使用 /plan off 退出。" },
          { name: "/goal", desc: "设置或查看长期任务目标。支持: <目标>, clear, edit <目标>, pause, resume。" },
          { name: "/compact", desc: "压缩旧对话历史以释放上下文空间。" },
          { name: "/feedback", desc: "记录当前会话的反馈。" },
          { name: "/permission", desc: "切换权限预设(sandbox 模式 + 审批策略)。" },
          { name: "/export", desc: "将会话日志下载为 ZIP 压缩包。" },
          { name: "/model", desc: "打开模型选择弹窗,切换当前使用的 LLM。" },
        ]
      }
    };

    function getSlashCommands() {
      var lang = getSystemLanguage();
      return SLASH_COMMANDS_I18N[lang] || SLASH_COMMANDS_I18N.en;
    }

    // Translation map for dynamic commands (DSH built-in commands with English descriptions)
    var DYNAMIC_COMMANDS_I18N = {
      en: {},
      zh: {
        "agent-teams": "管理多智能体团队，创建、监控和协调多个 AI 协作完成任务",
        "free-search-engine": "切换网页搜索引擎（Bing、DuckDuckGo、SearXNG 等）",
        "aegis": "Aegis 工作流管理（计划、执行、审查等开发流程）",
        "model": "切换当前使用的 AI 模型",
        "permission": "切换权限预设（沙箱模式 + 审批策略）",
        "export": "导出当前会话日志",
        "compact": "压缩对话历史以释放上下文空间",
        "feedback": "记录当前会话的反馈",
        "goal": "设置或查看长期任务目标",
        "plan": "进入或退出计划模式"
      }
    };

    function getTranslatedDescription(commandName, englishDesc) {
      var lang = getSystemLanguage();
      var translations = DYNAMIC_COMMANDS_I18N[lang] || DYNAMIC_COMMANDS_I18N.en;
      // Remove leading slash for lookup
      var name = commandName.startsWith("/") ? commandName.slice(1) : commandName;
      return translations[name] || englishDesc;
    }

    /* ---------------------------------------------------------- */
    /*  Helper: Compute active state from projection value          */
    /* ---------------------------------------------------------- */

    function computeProjectionState(projection) {
      if (projection === undefined || projection === null) return null;
      return {
        isActive: projection.pending ? !projection.active : projection.active,
        isPending: projection.pending === true
      };
    }

    /**
     * Whether the official plan chip (dsh-client-ui-plan's PlanChip) is on the
     * page. Its CSS-module class hash `REN-qG_chip` is stable across builds, and
     * the component only mounts while plan mode is actually in effect
     * (`pending ? !active : active`), so DOM presence means BOTH "the official
     * component exists" AND "plan mode is on right now". Read at render time —
     * no state to keep in sync. If a future host renames or removes the chip,
     * this returns false forever and our own button simply never hides.
     */
    function officialPlanChipPresent() {
      try {
        return !!document.querySelector(".REN-qG_chip");
      } catch (_) {
        return false;
      }
    }

    /* ---------------------------------------------------------- */
    /*  SwitchButton — individual button with its own projection hook */
    /* ---------------------------------------------------------- */

    function SwitchButton(props) {
      /* Normalize here too: an optimistic panel state or a cache written by an
       * older client can still hand us `mode: "persistent"`, and letting it
       * fall through to the type-1 branch would EXECUTE the command. */
      var btn = normalizeButton(props.btn);
      var ctx = props.ctx;
      var sessionId = props.sessionId;
      var useProjection = props.useProjection;
      var localState = props.localState;
      var onLocalStateChange = props.onLocalStateChange;
      var busy = props.busy;
      var setBusy = props.setBusy;
      var error = props.error;
      var setError = props.setError;
      var onPrefixChange = props.onPrefixChange;

      var mode = btn.mode || "toggle";
      var strings = getUiStrings();
      var commandText = (btn.command || "").trim();

      // Always call useProjection hook at component top level (React rules of hooks)
      // Use a stable dummy key when no projection is configured
      var projectionKey = (mode === "toggle" && btn.projection) ? btn.projection : "__dsh_switch_no_projection__";
      var projectionValue = typeof useProjection === "function"
        ? useProjection(projectionKey)
        : null;

      // Projection only drives type-1 (toggle) buttons; type 2 is a write.
      var hasProjectionConfig = mode === "toggle" && !!btn.projection;
      var projState = (hasProjectionConfig && typeof useProjection === "function")
        ? computeProjectionState(projectionValue)
        : null;
      var hasProjectionState = projState !== null;
      var isActive = hasProjectionState ? projState.isActive : (localState || false);
      var isPending = hasProjectionState ? projState.isPending : false;
      var hasCommandOff = mode === "toggle" && !!btn.commandOff;

      // Show a prefix tag while a single-command toggle button is active.
      react.useEffect(function () {
        if (mode === "toggle" && !hasCommandOff && isActive) {
          onPrefixChange(btn.id, commandText);
        } else {
          onPrefixChange(btn.id, null);
        }
      }, [btn.id, commandText, mode, hasCommandOff, isActive, onPrefixChange]);

      var handleClick = react.useCallback(function () {
        // Type 2: one insertion per click, before existing draft content.
        // The write goes through the session's composer face when bound, so it
        // lands in the editor's own state instead of being reconciled away.
        if (mode === "insert") {
          if (commandText) insertAtDraftStart(sessionId, commandText + " ");
          return;
        }

        // Type 1: execute the on/off command on the host.
        if (busy || !sessionId) return;

        var currentState = isActive;
        var commandToExecute;
        var newState;

        if (hasCommandOff) {
          // Toggle mode: flip state and execute appropriate command
          newState = !currentState;
          commandToExecute = newState ? btn.command : btn.commandOff;
          if (!hasProjectionState) {
            onLocalStateChange(btn.id, newState);
          }
        } else {
          // Single command (no off-command): execute the command, track locally
          newState = !currentState;
          commandToExecute = btn.command;
          if (!hasProjectionState) {
            onLocalStateChange(btn.id, newState);
          }
        }

        setBusy(true);
        setError(null);

        ctx.remote.commands.execute(sessionId, commandToExecute, [])
          .catch(function (error) {
            var msg = error instanceof Error ? error.message : String(error);
            if (/business argument|expected .*argument|got \d+/i.test(msg)) {
              return ctx.remote.commands.execute(sessionId, commandToExecute);
            }
            throw error;
          })
          .then(function (result) {
            if (!result || !result.ok) {
              var message = result && result.error
                ? (result.error.message || result.error.code || "Command failed")
                : "Command failed";
              setError(message);
              // Revert local state on error (only for local state buttons)
              if (!hasProjectionState) {
                onLocalStateChange(btn.id, currentState);
              }
            }
          })
          .catch(function (error) {
            setError(error instanceof Error ? error.message : String(error));
            if (!hasProjectionState) {
              onLocalStateChange(btn.id, currentState);
            }
          })
          .finally(function () { setBusy(false); });
      }, [btn, busy, sessionId, isActive, hasCommandOff, hasProjectionState, mode, commandText, ctx, setBusy, setError, onLocalStateChange]);

      var className = "dsh-sw-btn";
      if (mode === "insert") {
        className += " is-insert";
      } else {
        if (isActive) className += " is-active";
        if (isPending) className += " is-pending";
        if (error && mode === "toggle") className += " is-error";
      }

      /* Coexistence with the official Plan chip: while plan mode is on, the host's
       * own chip already offers "Plan ×" to leave it, so a second button doing the
       * same thing is clutter. Hide ours ONLY when all three hold — this is a
       * plan-projection toggle, its projection says active, and the official chip
       * is actually mounted. `pending` (a switch not yet committed) keeps our
       * button visible so there is never a moment without an exit affordance.
       * Hooks are all above this line, so returning null here is legal. */
      if (hasProjectionConfig && projectionKey === "plan" && isActive && !isPending && officialPlanChipPresent()) {
        return null;
      }

      var titleText;
      if (mode === "insert") {
        titleText = strings.tipInsert.replace("{cmd}", commandText);
      } else {
        titleText = error || (hasCommandOff && isActive ? (btn.commandOff || "").trim() : commandText);
      }

      return h("button", {
        type: "button",
        className: className,
        onClick: handleClick,
        disabled: busy || (mode === "toggle" ? isPending : false),
        title: titleText,
        "aria-label": btn.label || btn.command,
      },
        mode === "insert" && h("span", { className: "dsh-sw-btn-icon" }, "\u2328"),
        btn.label || btn.command
      );
    }

    /* ---------------------------------------------------------- */
    /*  SwitchBar — rendered in conversation.input.left              */
    /* ---------------------------------------------------------- */

    function SwitchBar(props) {
      var ctx = props.ctx;
      var sessionId = props.sessionId;
      var useProjection = props.useProjection;

      /* Keep this session's composer face current: the effect re-binds after
       * every render (so the latest `input` snapshot is what the insert path
       * reads) and drops the record on unmount, never leaving a stale store
       * behind for a session whose bar is gone. */
      react.useEffect(function () {
        bindComposerFace(sessionId, props.inputActions, props.input);
        return function () { unbindComposerFace(sessionId); };
      });

      var _config = react.useState(null);
      var config = _config[0];
      var setConfig = _config[1];

      // Local button state for toggle buttons without projection.
      var _states = react.useState({});
      var localStates = _states[0];
      var setLocalStates = _states[1];

      // Active prefixes for buttons that ride a command along: { [buttonId]: command }
      var _prefixes = react.useState({});
      var activePrefixes = _prefixes[0];
      var setActivePrefixes = _prefixes[1];

      var _busy = react.useState(false);
      var busy = _busy[0];
      var setBusy = _busy[1];
      var _err = react.useState(null);
      var err = _err[0];
      var setErr = _err[1];

      // Config comes from the Host settings scope (cache-fallback built in)
      react.useEffect(function () {
        return subscribeConfig(setConfig);
      }, []);

      // NOTE: nothing to watch here any more — a type-2 click writes the draft
      // immediately through the composer face recorded above.

      var handleLocalStateChange = react.useCallback(function (btnId, newState) {
        setLocalStates(function (prev) { return Object.assign({}, prev, { [btnId]: newState }); });
      }, []);

      var handlePrefixChange = react.useCallback(function (btnId, command) {
        setActivePrefixes(function (prev) {
          var next = Object.assign({}, prev);
          if (command === null) {
            delete next[btnId];
          } else {
            next[btnId] = command;
          }
          return next;
        });
      }, []);

      // Always render if we have config
      if (!config || !config.buttons || config.buttons.length === 0) {
        return null;
      }

      var enabled = config.buttons.filter(function (b) { return b.enabled; });
      if (enabled.length === 0) {
        return null;
      }

      // Collect active prefix commands for display
      var prefixList = Object.values(activePrefixes).filter(Boolean);

      return h("div", { className: "dsh-sw-bar" },
        enabled.map(function (btn) {
          return h(SwitchButton, {
            key: btn.id,
            btn: btn,
            ctx: ctx,
            sessionId: sessionId,
            useProjection: useProjection,
            localState: localStates[btn.id],
            onLocalStateChange: handleLocalStateChange,
            busy: busy,
            setBusy: setBusy,
            error: err,
            setError: setErr,
            onPrefixChange: handlePrefixChange,
          });
        }),
        // Render active prefixes
        prefixList.length > 0 && prefixList.map(function (cmd, i) {
          return h("span", { key: "prefix-" + i, className: "dsh-sw-prefix" },
            h("span", { className: "dsh-sw-prefix-icon" }, "\u25B6"),
            cmd
          );
        })
      );
    }

    /* ---------------------------------------------------------- */
    /*  SettingsPanel — rendered in settings.section                 */
    /* ---------------------------------------------------------- */

    function Toggle(props) {
      var L = getUiStrings();
      return h("button", {
        type: "button",
        role: "switch",
        "aria-checked": !!props.on,
        className: "dsh-sw-toggle" + (props.on ? " dsh-sw-toggle--on" : ""),
        onClick: props.onToggle,
        title: props.on ? L.enabledOn : L.enabledOff,
        "aria-label": props.on ? L.enabledOn : L.enabledOff,
      });
    }

    var MODE_ORDER = ["toggle", "insert"];

    /** One labelled cell of a card body; the span class fixes its column width. */
    function Field(props) {
      return h("div", { className: "dsh-sw-field " + props.span },
        h("span", { className: "dsh-sw-field-label", title: props.label }, props.label),
        h("input", {
          className: "dsh-sw-input",
          value: props.value,
          placeholder: props.placeholder,
          title: props.title || props.label,
          "aria-label": props.label,
          spellCheck: false,
          autoComplete: "off",
          onChange: function (e) { props.onChange(e.target.value); },
        })
      );
    }

    function ButtonRow(props) {
      var btn = normalizeButton(props.btn);
      var mode = btn.mode || "toggle";
      var L = getUiStrings();
      var patch = function (p) { props.onChange(Object.assign({}, btn, p)); };
      return h("div", { className: "dsh-sw-card" },
        h("div", { className: "dsh-sw-card-head" },
          h("div", { className: "dsh-sw-field dsh-sw-field--s5" },
            h("span", { className: "dsh-sw-field-label" }, L.fieldName),
            h("input", {
              className: "dsh-sw-input",
              value: btn.label,
              placeholder: L.labelPlaceholder,
              "aria-label": L.fieldName,
              spellCheck: false,
              onChange: function (e) { patch({ label: e.target.value }); },
            })
          ),
          h("div", { className: "dsh-sw-field dsh-sw-field--s4" },
            h("span", { className: "dsh-sw-field-label" }, L.fieldMode),
            h("select", {
              className: "dsh-sw-select",
              value: mode,
              "aria-label": L.fieldMode,
              title: mode === "insert" ? L.modeTitleInsert : L.modeTitleToggle,
              onChange: function (e) { patch({ mode: e.target.value }); },
            },
              MODE_ORDER.map(function (m) {
                return h("option", { key: m, value: m }, m === "insert" ? L.modeInsert : L.modeToggle);
              })
            )
          ),
          h("div", { className: "dsh-sw-field dsh-sw-field--s3" },
            h("span", { className: "dsh-sw-field-label dsh-sw-field-label--ghost" }, "\u00A0"),
            h("div", { className: "dsh-sw-tools" },
              h(Toggle, {
                on: btn.enabled,
                onToggle: function () { patch({ enabled: !btn.enabled }); },
              }),
              h("button", {
                type: "button",
                className: "dsh-sw-del",
                onClick: props.onDelete,
                title: L.remove,
                "aria-label": L.remove,
              }, "\u00D7")
            )
          )
        ),
        h("div", { className: "dsh-sw-fields" },
          mode === "toggle"
            ? [
                h(Field, {
                  key: "on", span: "dsh-sw-field--s5", label: L.fieldOn,
                  value: btn.command, placeholder: L.cmdTogglePlaceholder,
                  onChange: function (v) { patch({ command: v }); },
                }),
                h(Field, {
                  key: "off", span: "dsh-sw-field--s4", label: L.fieldOff,
                  value: btn.commandOff || "", placeholder: L.offPlaceholder,
                  onChange: function (v) { patch({ commandOff: v || undefined }); },
                }),
                h(Field, {
                  key: "proj", span: "dsh-sw-field--s3", label: L.fieldProjection,
                  value: btn.projection || "", placeholder: L.projPlaceholder, title: L.projTitle,
                  onChange: function (v) { patch({ projection: v || undefined }); },
                }),
              ]
            : h(Field, {
                key: "cmd", span: "dsh-sw-field--full", label: L.fieldCommand,
                value: btn.command, placeholder: L.cmdPlainPlaceholder,
                onChange: function (v) { patch({ command: v }); },
              })
        )
      );
    }

    function SlashCommandsList(props) {
      var ctx = props.ctx;
      var i18n = getSlashCommands();
      var _commands = react.useState(null);
      var dynamicCommands = _commands[0];
      var setDynamicCommands = _commands[1];
      var _open = react.useState(true);
      var open = _open[0];
      var setOpen = _open[1];

      // Fetch commands dynamically from installed plugins
      react.useEffect(function () {
        if (!ctx) return;

        var fetchCommands = async function () {
          try {
            // Get sessions service
            var sessions = ctx.get ? ctx.get("sessions") : null;
            if (!sessions) return;

            // Get current session ID
            var sessionId = sessions.list && sessions.list.getSnapshot && sessions.list.getSnapshot().current;
            if (!sessionId) return;

            // Fetch commands for this session
            var cmdResult = await ctx.remote.commands.list(sessionId);
            if (cmdResult && cmdResult.ok && Array.isArray(cmdResult.value)) {
              setDynamicCommands(cmdResult.value);
            }
          } catch (e) {
            // Silently fail - will use hardcoded fallback
            console.debug("[dsh-switch] Failed to fetch dynamic commands:", e);
          }
        };

        fetchCommands();
      }, [ctx]);

      // Merge dynamic commands with hardcoded fallback
      var displayCommands = i18n.commands.slice();
      if (dynamicCommands && dynamicCommands.length > 0) {
        // Add dynamic commands that aren't already in the hardcoded list
        var existingNames = new Set(displayCommands.map(function (c) { return c.name; }));
        dynamicCommands.forEach(function (cmd) {
          var cmdName = "/" + cmd.name;
          if (!existingNames.has(cmdName)) {
            var englishDesc = cmd.description || (cmd.input && cmd.input.hint) || "";
            displayCommands.push({
              name: cmdName,
              desc: getTranslatedDescription(cmdName, englishDesc)
            });
          }
        });
      }

      return h("div", { className: "dsh-sw-cmd-ref" },
        h("button", {
          type: "button",
          className: "dsh-sw-cmd-ref-head",
          "aria-expanded": !!open,
          onClick: function () { setOpen(!open); },
        },
          h("span", { className: "dsh-sw-cmd-ref-chev" + (open ? " is-open" : "") }, "\u25B8"),
          h("span", null, i18n.title),
          h("span", { className: "dsh-sw-cmd-ref-count" }, "(" + displayCommands.length + ")")
        ),
        open && h("div", { className: "dsh-sw-cmd-ref-list" },
          displayCommands.map(function (cmd) {
            return h("div", { key: cmd.name, className: "dsh-sw-cmd-ref-item" },
              h("span", { className: "dsh-sw-cmd-ref-name" }, cmd.name),
              h("span", { className: "dsh-sw-cmd-ref-desc" }, cmd.desc)
            );
          })
        )
      );
    }

    function SettingsPanel(props) {
      var ctx = props.ctx;
      var _s = react.useState(null);
      var config = _s[0];
      var setConfig = _s[1];
      var L = getUiStrings();

      react.useEffect(function () {
        return subscribeConfig(setConfig);
      }, []);

      var save = react.useCallback(function (next) {
        setConfig(next);           // optimistic local paint
        writeButtons(next.buttons); // Host settings document (authoritative) + cache
      }, []);

      if (!config) return h("div", { style: { padding: "8px 0", color: "var(--dsw-alias-label-tertiary,#999)" } }, L.loading);

      return h("div", { className: "dsh-sw-panel" },
        config.buttons.map(function (btn, i) {
          return h(ButtonRow, {
            key: btn.id,
            btn: btn,
            onChange: function (updated) {
              var buttons = config.buttons.slice();
              buttons[i] = updated;
              save({ buttons: buttons });
            },
            onDelete: function () {
              save({ buttons: config.buttons.filter(function (_, j) { return j !== i; }) });
            },
          });
        }),
        config.buttons.length === 0 && h("div", { className: "dsh-sw-empty" }, L.empty),
        h("button", {
          type: "button",
          className: "dsh-sw-add",
          onClick: function () {
            save({
              buttons: config.buttons.concat([{
                id: "btn-" + Date.now(),
                label: "",
                command: "",
                mode: "toggle",
                enabled: true,
              }]),
            });
          },
        }, L.add),
        h(SlashCommandsList, { ctx: ctx })
      );
    }

    /* ---------------------------------------------------------- */
    /*  Plugin entry point                                          */
    /* ---------------------------------------------------------- */

    /* `settingsScope` MUST be declared: without it apply() can run before the
     * service exists, ctx.get() returns undefined, and the whole client
     * silently degrades to the localStorage cache — which is per-origin, and
     * DSH Desktop picks a new port every launch, so a restart would look like
     * the button configuration had been wiped. */
    var inject = ["slots", "remote", "remote.commands", "sessions", "settingsScope"];

    function apply(ctx) {
      /* Bind the persistent Host-side settings namespace first: every
       * component below subscribes through subscribeConfig(). */
      bindScope(ctx);

      /* Seed the config cache so a bar mounted before the first snapshot can
       * still paint the button list. */
      latestConfig = loadCachedConfig();

      /* Console diagnostics: __dshSwitch.state() shows what the insert path
       * actually sees (Host scope, per-session composer faces, the draft the
       * DOM exposes), __dshSwitch.insert("/cmd") runs one insertion attempt,
       * and __dshSwitch.log() replays the decisions that were made. */
      try {
        window.__dshSwitch = {
          scopeBound: function () { return !!scope; },
          draft: getComposerText,
          state: function () {
            return {
              scopeBound: !!scope,
              buttons: (latestConfig && latestConfig.buttons || []).map(function (b) {
                return { id: b.id, label: b.label, mode: b.mode, enabled: b.enabled, command: b.command };
              }),
              faces: Object.keys(composerFaces).map(function (id) {
                var face = composerFaces[id];
                return {
                  sessionId: id,
                  setDraft: !!(face.actions && face.actions.setDraft),
                  draft: face.input ? face.input.draft : null,
                  phase: face.input ? face.input.phase : null,
                  chips: draftHasChips(face.input),
                };
              }),
              draft: getComposerText(),
              editorFound: !!document.querySelector('[data-composer-input][contenteditable="true"]'),
              /* The host mirrors the submit machine onto the editor element, so
               * this is what the shell itself thinks the composer is doing. */
              editorPhase: (function () {
                var el = document.querySelector("[data-composer-input]");
                return el ? el.getAttribute("data-phase") : null;
              })(),
            };
          },
          log: function () { return { insert: insertLog.slice() }; },
          insert: function (command, sessionIdHint) {
            var sid = typeof sessionIdHint === "string" ? sessionIdHint : Object.keys(composerFaces)[0];
            return insertAtDraftStart(sid, String(command || "").trim() + " ");
          },
        };
      } catch (_) { /* window may be read-only in odd sandboxes */ }

      /* ---- Switch-button bar in the input area ---- */
      ctx.slots.inject("conversation.input.left", function () {
        return ctx.slots.register(
          { name: "conversation.input.left", id: "dsh-switch-bar" },
          function (props) {
            return h(SwitchBar, {
              ctx: ctx,
              sessionId: props.sessionId,
              /* Host composer face (see bindComposerFace): the official write
               * path and the point-in-time draft for this slot's session. */
              inputActions: props.inputActions,
              input: props.input,
              useProjection: typeof props.useProjection === "function" ? props.useProjection : null,
            });
          }
        );
      });

      /* ---- Settings panel section ---- */
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          { name: "settings.section", id: "dsh-switch", label: "Switch Buttons" },
          function () {
            return h(SettingsPanel, { ctx: ctx });
          }
        );
      });
    }

    /* ---------------------------------------------------------- */
    /*  Exports                                                     */
    /* ---------------------------------------------------------- */
    exports.inject = inject;
    exports.apply = apply;
    /* Test seam — inert in production; lets the unit tests drive the
     * draft-level logic (mode migration, face routing, chip/phase guards)
     * under jsdom without mounting React. */
    exports.__test = {
      normalizeButton: normalizeButton,
      /* Official-chip presence probe driving the plan-button suppression. */
      officialPlanChipPresent: officialPlanChipPresent,
      normalizeConfig: normalizeConfig,
      /* Panel components are exposed so the visual preview harness
       * (test/preview.cjs) can render the real markup without React. */
      SettingsPanel: SettingsPanel,
      ButtonRow: ButtonRow,
      SwitchButton: SwitchButton,
      Field: Field,
      Toggle: Toggle,
      MODE_ORDER: MODE_ORDER,
      /* Host settings plumbing: proves the retired "armed" key is neither
       * decoded nor written, and that a stored persistent button migrates. */
      bindScope: bindScope,
      subscribeConfig: subscribeConfig,
      writeButtons: writeButtons,
      loadCachedConfig: loadCachedConfig,
      /* Composer face + insert path. */
      bindComposerFace: bindComposerFace,
      unbindComposerFace: unbindComposerFace,
      composerFaces: composerFaces,
      draftHasChips: draftHasChips,
      draftLocked: draftLocked,
      insertAtDraftStart: insertAtDraftStart,
      insertIntoComposerInput: insertIntoComposerInput,
      getComposerText: getComposerText,
      setLatestConfig: function (c) { latestConfig = c; },
      getLatestConfig: function () { return latestConfig; },
      insertLog: insertLog,
    };
    return module.exports;
  }
});

/**
 * dsh-switch — Client half (DSH ModuleLoader bundle).
 *
 * Renders customisable switch-buttons in the chat input bar and a
 * configuration panel inside Settings → "Switch Buttons".
 *
 * Exactly one button type (`mode` field): "insert". Each click inserts
 * "<command> " into the composer draft, BEFORE any existing content
 * (one insertion per click).
 *
 * The type-1 "toggle" (Plan-style on/off command switch with host
 * projection) was retired in v1.5.0: no button executes commands through
 * the host any more, clicks are pure draft writes. A stored `mode:
 * "toggle"` (and every older legacy shape without a mode) is migrated to
 * "insert" on read — commandOff/projection are dropped, so the button
 * keeps working as a one-click insert of its on-command. The type-3
 * "persistent" mode had already been retired in v1.4.0 together with its
 * whole arm registry: it wrote the draft through DOM mutations that the
 * shell's Lexical editor reconciled away (and the composer's own
 * draft-restore could overwrite); a stored `mode: "persistent"` migrates
 * to "insert" the same way. The Host "armed" key is no longer read or
 * written.
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
 * first-paint cache / non-loopback fallback. Legacy configs are
 * normalised on read: every stored mode (`toggle`, `persistent`) and
 * every record without a `mode` becomes "insert".
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
        ".dsh-sw-btn.is-insert{color:var(--dsw-alias-state-business-primary,#3b82f6)}",
        ".dsh-sw-btn.is-insert:hover:not(:disabled){background:var(--dsw-alias-state-business-tertiary,#eff6ff)}",
        /* Settings panel — one card per button + a fixed 12-column field grid.
         * Tracks are minmax(0,1fr), so fields shrink instead of wrapping:
         * every card keeps the same shape whatever the panel width. */
        ".dsh-sw-panel{padding:4px 0;display:flex;flex-direction:column;gap:10px}",
        ".dsh-sw-restart-hint{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#999)}",
        ".dsh-sw-card{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#e6e6e6);border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}",
        ".dsh-sw-card-head{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));align-items:start;gap:8px}",
        ".dsh-sw-tools{height:28px;display:flex;align-items:center;justify-content:flex-end;gap:8px}",
        ".dsh-sw-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
        ".dsh-sw-field--s3{grid-column:span 3}",
        ".dsh-sw-field--s4{grid-column:span 4}",
        ".dsh-sw-field--s5{grid-column:span 5}",
        ".dsh-sw-field-label{font-size:11px;line-height:1.2;color:var(--dsw-alias-label-tertiary,#999);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".dsh-sw-field-label--ghost{visibility:hidden}",
        ".dsh-sw-input{width:100%;box-sizing:border-box;min-width:0;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:6px;font-size:13px;background:var(--dsw-specific-input-major,#fff);color:var(--dsw-alias-label-primary,#333);outline:none;font-family:inherit}",
        ".dsh-sw-input::placeholder{color:var(--dsw-alias-label-caption,#b3b3b3)}",
        ".dsh-sw-input:hover{border-color:var(--dsw-alias-border-l3,#b5b5b5)}",
        ".dsh-sw-input:focus{border-color:var(--dsw-alias-state-business-primary,#3b82f6);box-shadow:0 0 0 2px var(--dsw-alias-state-business-tertiary,rgba(59,130,246,.14))}",
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
        cmdPlainPlaceholder: "Slash command, e.g. /plan",
        fieldCommand: "Slash command",
        fieldName: "Name",
        empty: "No buttons yet \u2014 add one below.",
        refToggle: "Available slash commands",
        remove: "Remove",
        enabledOn: "Enabled",
        enabledOff: "Disabled",
        tipInsert: "Click to insert \u201c{cmd} \u201d before the input content",
        restartHint: "Button changes save instantly. If a plugin update changed the buttons themselves, fully restart DSH Desktop.",
      },
      zh: {
        add: "+ 添加按钮",
        loading: "加载中…",
        labelPlaceholder: "名称",
        cmdPlainPlaceholder: "如 /plan",
        fieldCommand: "斜杠命令",
        fieldName: "名称",
        empty: "还没有按钮，在下方添加一个。",
        refToggle: "可用斜杠命令",
        remove: "删除",
        enabledOn: "已启用",
        enabledOff: "已停用",
        tipInsert: "点击把“{cmd} ”插入到输入内容之前",
        restartHint: "按钮配置保存即时生效；若升级插件后按钮本身没有变化，请完全重启 DSH Desktop。",
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
      { id: "plan", label: "Plan", command: "/plan", mode: "insert", enabled: true },
      { id: "plan-off", label: "Plan Off", command: "/plan off", mode: "insert", enabled: true },
    ];

    /**
     * Migrate a stored button record to the single insert model. Every
     * retired shape becomes "insert" with the on-command kept: `mode:
     * "toggle"` (the Plan-style switch, dropped in v1.5.0 — its
     * commandOff/projection are deleted), `mode: "persistent"` (dropped in
     * v1.4.0), legacy `insert: true`, and records without any mode. The
     * command always executes as an insertion, never through the host.
     */
    function normalizeButton(b) {
      if (!b || typeof b !== "object") return b;
      if (b.mode === "insert" && b.commandOff === undefined && b.projection === undefined && !b.insert) return b;
      var out = Object.assign({}, b);
      delete out.insert;
      delete out.commandOff;
      delete out.projection;
      out.mode = "insert";
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
     * can vanish without a trace — which is exactly why the click path
     * prefers {@link insertAtDraftStart}. Kept for the two cases the face
     * cannot serve: no face bound for this session (bar mounted by an older
     * shell, or no session yet) and a chip-bearing draft, where setDraft would
     * flatten the reference nodes into plain text.
     * @param {string} text - The text to insert (e.g. "/plan ")
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
     * The insert write: put `text` at the very START of one session's draft.
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
    /*  SwitchButton — one insert button per configured command     */
    /* ---------------------------------------------------------- */

    function SwitchButton(props) {
      /* Normalize here too: an optimistic panel state or a cache written by an
       * older client can still hand us `mode: "toggle"` / `"persistent"`, and
       * letting it fall through would EXECUTE the command instead of
       * inserting it. After normalization every button is type "insert". */
      var btn = normalizeButton(props.btn);
      var sessionId = props.sessionId;
      var strings = getUiStrings();
      var commandText = (btn.command || "").trim();

      var handleClick = react.useCallback(function () {
        // One insertion per click, before existing draft content.
        // The write goes through the session's composer face when bound, so it
        // lands in the editor's own state instead of being reconciled away.
        if (commandText) insertAtDraftStart(sessionId, commandText + " ");
      }, [sessionId, commandText]);

      return h("button", {
        type: "button",
        className: "dsh-sw-btn is-insert",
        onClick: handleClick,
        title: strings.tipInsert.replace("{cmd}", commandText),
        "aria-label": btn.label || btn.command,
      },
        btn.label || btn.command
      );
    }

    /* ---------------------------------------------------------- */
    /*  SwitchBar — rendered in conversation.input.left              */
    /* ---------------------------------------------------------- */

    function SwitchBar(props) {
      var sessionId = props.sessionId;

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

      // Config comes from the Host settings scope (cache-fallback built in)
      react.useEffect(function () {
        return subscribeConfig(setConfig);
      }, []);

      // Always render if we have config
      if (!config || !config.buttons || config.buttons.length === 0) {
        return null;
      }

      var enabled = config.buttons.filter(function (b) { return b.enabled; });
      if (enabled.length === 0) {
        return null;
      }

      return h("div", { className: "dsh-sw-bar" },
        enabled.map(function (btn) {
          return h(SwitchButton, {
            key: btn.id,
            btn: btn,
            sessionId: sessionId,
          });
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

    function ButtonRow(props) {
      var btn = normalizeButton(props.btn);
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
            h("span", { className: "dsh-sw-field-label" }, L.fieldCommand),
            h("input", {
              className: "dsh-sw-input",
              value: btn.command,
              placeholder: L.cmdPlainPlaceholder,
              "aria-label": L.fieldCommand,
              spellCheck: false,
              autoComplete: "off",
              onChange: function (e) { patch({ command: e.target.value }); },
            })
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
                mode: "insert",
                enabled: true,
              }]),
            });
          },
        }, L.add),
        h("div", { className: "dsh-sw-restart-hint" }, L.restartHint),
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
    /* `remote` / `remote.commands` stay in the list only for the slash-command
     * reference (`commands.list`); no button executes commands any more. */
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
              sessionId: props.sessionId,
              /* Host composer face (see bindComposerFace): the official write
               * path and the point-in-time draft for this slot's session. */
              inputActions: props.inputActions,
              input: props.input,
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
      normalizeConfig: normalizeConfig,
      /* Panel components are exposed so the visual preview harness
       * (test/preview.cjs) can render the real markup without React. */
      SettingsPanel: SettingsPanel,
      ButtonRow: ButtonRow,
      SwitchButton: SwitchButton,
      Toggle: Toggle,
      /* Host settings plumbing: proves the retired "armed" key is neither
       * decoded nor written, and that every stored legacy mode migrates. */
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

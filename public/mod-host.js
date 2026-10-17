/* Oceans Symphony mod host — runs inside the sandboxed mod frame.
 *
 * Loaded by public/mod-host.html. The app (src/components/mods/ModFrame.jsx)
 * sends one "symphony:init" message with the mod's code, the page to draw and
 * the person's terms/theme. This file builds the `symphony` API the mod sees,
 * runs the mod, and turns every API call into a "symphony:call" message that
 * the app's broker (src/lib/mods/broker.js) answers. Nothing here can reach
 * the app's data directly — the browser's sandbox makes sure of that.
 *
 * Plain ES2018, no build step: this file is copied verbatim into dist/.
 */
(function () {
  "use strict";

  var root = document.getElementById("mod-root");
  var parentWin = window.parent;
  var started = false;
  var nextCallId = 1;
  var pending = {};
  var changeListeners = [];

  function showError(text) {
    root.innerHTML = "";
    var box = document.createElement("div");
    box.className = "os-error";
    box.textContent = text;
    root.appendChild(box);
  }

  function post(msg) {
    // The app's origin is not visible from an opaque-origin frame, so "*" is
    // the only target that works. Nothing secret travels this way: these are
    // the mod's own requests, and the app checks the sender before answering.
    parentWin.postMessage(msg, "*");
  }

  // ── Hardening, before any mod code exists ──────────────────────────────
  // Older Android WebViews expose Capacitor's native bridge to EVERY frame.
  // Modern ones only expose it to the app's own origin, which this frame is
  // not. If it is visible here, the sandbox can't be trusted on this device:
  // refuse to run rather than hand a mod the native bridge.
  var bridgeVisible = false;
  try { bridgeVisible = typeof window.androidBridge !== "undefined" || typeof window.webkit !== "undefined" && !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge); } catch (e) { bridgeVisible = true; }

  // WebRTC can reach the network without going through the page's
  // connect-src rules. Mods never need it.
  ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCSessionDescription", "RTCIceCandidate"].forEach(function (k) {
    try { Object.defineProperty(window, k, { value: undefined, configurable: false, writable: false }); } catch (e) { /* ignore */ }
  });
  // A nested frame would come with fresh, unpatched globals.
  try {
    var deny = function () { return null; };
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", { get: deny, configurable: false });
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", { get: deny, configurable: false });
  } catch (e) { /* ignore */ }

  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var callId = nextCallId++;
      pending[callId] = { resolve: resolve, reject: reject };
      post({ type: "symphony:call", callId: callId, method: method, args: args || [] });
    });
  }

  function reportHeight() {
    var h = Math.ceil(document.body.getBoundingClientRect().height);
    post({ type: "symphony:height", height: h });
  }

  function deepFreeze(o) {
    if (o && typeof o === "object") {
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
      Object.freeze(o);
    }
    return o;
  }

  function start(init) {
    var pages = {};
    var api = {
      mod: deepFreeze({ id: init.mod.id, name: init.mod.name, version: init.mod.version }),
      page: init.pageId,
      permissions: deepFreeze((init.permissions || []).slice()),
      terms: deepFreeze(init.terms || {}),
      theme: deepFreeze(init.theme || {}),
      // symphony.registerPage("notes", (root) => { ... })
      registerPage: function (id, render) {
        if (typeof id !== "string" || typeof render !== "function") throw new Error("registerPage(id, render) needs a page id and a function");
        pages[id] = render;
      },
      data: {
        list: function (collection, where) { return call("data.list", [collection, where || null]); },
        get: function (collection, id) { return call("data.get", [collection, id]); },
        create: function (collection, fields) { return call("data.create", [collection, fields]); },
        update: function (collection, id, fields) { return call("data.update", [collection, id, fields]); },
        remove: function (collection, id) { return call("data.remove", [collection, id]); },
      },
      alters: {
        list: function () { return call("alters.list", []); },
      },
      fronting: {
        current: function () { return call("fronting.current", []); },
      },
      ui: {
        toast: function (text) { return call("ui.toast", [String(text)]); },
        openPage: function (pageId) { return call("ui.openPage", [String(pageId)]); },
      },
      // Called after this mod's data changes from anywhere (another page of
      // the same mod, a sync from another device, an undo).
      onDataChange: function (fn) { if (typeof fn === "function") changeListeners.push(fn); },
    };
    Object.freeze(api.data); Object.freeze(api.alters); Object.freeze(api.fronting); Object.freeze(api.ui);
    Object.freeze(api);

    // Theme variables from the app, so mod UI matches the person's colours.
    var vars = init.cssVars || {};
    Object.keys(vars).forEach(function (k) {
      if (/^--[a-z0-9-]+$/i.test(k) && typeof vars[k] === "string") document.documentElement.style.setProperty(k, vars[k]);
    });
    if (init.dark) document.documentElement.classList.add("dark");

    try {
      // eslint-disable-next-line no-new-func
      var run = new Function("symphony", "\"use strict\";\n" + String(init.code || "") + "\n//# sourceURL=mod-" + init.mod.id + ".js");
      run(api);
    } catch (e) {
      showError("This mod failed to start:\n" + (e && e.message ? e.message : String(e)));
      return;
    }
    var render = pages[init.pageId];
    if (!render) {
      showError("This mod has no page called \"" + init.pageId + "\".");
      return;
    }
    Promise.resolve()
      .then(function () { return render(root, api); })
      .catch(function (e) { showError("This page hit an error:\n" + (e && e.message ? e.message : String(e))); });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== parentWin) return;
    var msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "symphony:init") {
      if (started) return;
      started = true;
      if (bridgeVisible) {
        showError("Mods can't run safely on this device: its system WebView is too old to keep them sandboxed. Updating \"Android System WebView\" from the Play Store fixes this.");
        post({ type: "symphony:blocked", reason: "bridge" });
        return;
      }
      start(msg);
    } else if (msg.type === "symphony:result") {
      var p = pending[msg.callId];
      if (!p) return;
      delete pending[msg.callId];
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new Error(msg.error || "Request failed"));
    } else if (msg.type === "symphony:dataChanged") {
      changeListeners.forEach(function (fn) { try { fn(msg.change || {}); } catch (e) { /* a listener's own bug */ } });
    }
  });

  if (typeof ResizeObserver === "function") new ResizeObserver(reportHeight).observe(document.body);
  window.addEventListener("load", reportHeight);
  post({ type: "symphony:hostReady" });
})();

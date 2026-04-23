/**
 * Canvas Speed Controller Plus - Background Service Worker
 * Re-injeta automaticamente a velocidade salva em QUALQUER frame novo
 * (resolve o bug de perder a aceleração ao voltar pro jogo)
 */

// === Funções de injeção (copiadas do popup.js) ===
// Essas funções rodam no contexto MAIN da página via chrome.scripting.executeScript

function injectCanvasSpeed(speed) {
  try {
    if (window.__CANVAS_SPEED__) {
      window.__CANVAS_SPEED__.setSpeed(speed);
      return "OK:update:" + speed;
    }

    var _setTimeout = window.setTimeout;
    var _setInterval = window.setInterval;
    var _clearTimeout = window.clearTimeout;
    var _clearInterval = window.clearInterval;
    var _RAF = window.requestAnimationFrame;
    var _cancelRAF = window.cancelAnimationFrame;
    var _DateNow = Date.now;
    var _perfNow = Performance.prototype.now;

    var ctrl = {
      speed: speed,
      active: speed > 1,
      lastPerf: _perfNow.call(performance),
      lastDate: _DateNow.call(Date),
      perfOffset: 0,
      dateOffset: 0
    };

    function sync() {
      var np = _perfNow.call(performance);
      var nd = _DateNow.call(Date);
      ctrl.perfOffset += (np - ctrl.lastPerf) * (ctrl.speed - 1);
      ctrl.dateOffset += (nd - ctrl.lastDate) * (ctrl.speed - 1);
      ctrl.lastPerf = np;
      ctrl.lastDate = nd;
    }

    window.setTimeout = function(fn, delay) {
      if (!ctrl.active) return _setTimeout.apply(window, arguments);
      var args = [fn, Math.max(1, Math.floor((delay || 0) / ctrl.speed))];
      for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
      return _setTimeout.apply(window, args);
    };

    window.setInterval = function(fn, delay) {
      if (!ctrl.active) return _setInterval.apply(window, arguments);
      var args = [fn, Math.max(1, Math.floor((delay || 0) / ctrl.speed))];
      for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
      return _setInterval.apply(window, args);
    };

    window.requestAnimationFrame = function(cb) {
      return _RAF.call(window, function(ts) {
        if (!ctrl.active) return cb(ts);
        sync();
        cb(ts + ctrl.perfOffset);
      });
    };

    window.clearTimeout = _clearTimeout;
    window.clearInterval = _clearInterval;
    window.cancelAnimationFrame = _cancelRAF;

    Performance.prototype.now = function() {
      if (!ctrl.active) return _perfNow.call(this);
      sync();
      return _perfNow.call(this) + ctrl.perfOffset;
    };

    Date.now = function() {
      if (!ctrl.active) return _DateNow.call(Date);
      sync();
      return _DateNow.call(Date) + ctrl.dateOffset;
    };

    function scanEngines() {
      var found = [];
      if (window.cc) {
        if (window.cc.director) {
          var scheduler = window.cc.director.getScheduler();
          if (scheduler) { scheduler.setTimeScale(ctrl.speed); found.push("cc.scheduler"); }
        }
        if (window.cc.game) found.push("cc.game");
      }
      if (window.PIXI && window.PIXI.Ticker) {
        var ticker = window.PIXI.Ticker.shared || window.PIXI.Ticker.system;
        if (ticker) { ticker.speed = ctrl.speed; found.push("PIXI.Ticker"); }
      }
      if (window.Phaser && window.Phaser.Game) {
        for (var k in window) {
          try {
            if (window[k] instanceof window.Phaser.Game && window[k].loop) {
              window[k].loop.targetFps = 60 * ctrl.speed; found.push("Phaser.Game"); break;
            }
          } catch(e) {}
        }
      }
      if (window.createjs && window.createjs.Ticker) {
        window.createjs.Ticker.timingMode = "raf"; found.push("createjs.Ticker");
      }
      var checked = 0;
      for (var key in window) {
        if (checked > 500) break; checked++;
        try {
          var obj = window[key];
          if (obj && typeof obj === 'object' && obj !== window) {
            if (typeof obj.timeScale === 'number') { obj.timeScale = ctrl.speed; found.push("window." + key + ".timeScale"); }
            if (typeof obj._timeScale === 'number') { obj._timeScale = ctrl.speed; found.push("window." + key + "._timeScale"); }
          }
        } catch(e) {}
      }
      return found;
    }

    var engineResult = scanEngines();
    // Re-scan periódico para pegar engines que carregam depois
    _setInterval.call(window, function() { if (ctrl.active) scanEngines(); }, 1000);

    ctrl.setSpeed = function(s) {
      if (s <= 1) {
        ctrl.speed = 1; ctrl.active = false; ctrl.perfOffset = 0; ctrl.dateOffset = 0;
        if (window.cc && window.cc.director) { var sched = window.cc.director.getScheduler(); if (sched) sched.setTimeScale(1); }
        if (window.PIXI && window.PIXI.Ticker) { var t = window.PIXI.Ticker.shared || window.PIXI.Ticker.system; if (t) t.speed = 1; }
        var checked = 0;
        for (var key in window) {
          if (checked > 500) break; checked++;
          try {
            var obj = window[key];
            if (obj && typeof obj === 'object' && obj !== window) {
              if (typeof obj.timeScale === 'number' && obj.timeScale !== 1) { obj.timeScale = 1; }
              if (typeof obj._timeScale === 'number' && obj._timeScale !== 1) { obj._timeScale = 1; }
            }
          } catch(e) {}
        }
      } else {
        sync(); ctrl.speed = s; ctrl.active = true;
        ctrl.lastPerf = _perfNow.call(performance); ctrl.lastDate = _DateNow.call(Date);
        scanEngines();
      }
    };

    ctrl.engineResult = engineResult;
    window.__CANVAS_SPEED__ = ctrl;
    return "OK:inject:" + speed + ":engines=" + engineResult.join(",");
  } catch (e) {
    return "ERRO:" + e.message;
  }
}

// Bridge setup — injetado em world: ISOLATED (fallback para páginas já abertas)
function setupBridge() {
  if (window.__CSP_BRIDGE_READY__) return "already_ready";
  window.__CSP_BRIDGE_READY__ = true;

  function sendStatus(text, isError) {
    try {
      window.postMessage({ __csp_source: "status", text: text, error: !!isError }, "*");
    } catch(e) {}
  }

  window.addEventListener("message", function(event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.__csp_source !== "panel") return;

    if (data.action === "speedChange" && typeof data.speed === "number") {
      sendStatus("[1/3] bridge OK, enviando...");
      try {
        chrome.runtime.sendMessage({
          action: "speedChangeFromPanel",
          speed: data.speed
        }, function(response) {
          if (chrome.runtime.lastError) {
            sendStatus("X bridge->bg: " + chrome.runtime.lastError.message.substring(0, 28), true);
            return;
          }
          if (!response) { sendStatus("X bg: sem resposta", true); return; }
          if (response.ok) {
            var engines = response.engines || "?";
            sendStatus("[3/3] " + response.framesInjected + "f " + engines, false);
          } else {
            sendStatus("X bg: " + (response.error ? response.error.substring(0, 25) : "err"), true);
          }
        });
        sendStatus("[2/3] msg enviada ao bg");
      } catch(err) {
        sendStatus("X sendMessage: " + err.message.substring(0, 25), true);
      }
      return;
    }

    if (data.action === "panelClosed") {
      try { chrome.runtime.sendMessage({ action: "panelClosedByUser" }); } catch(err) {}
    }

    if (data.action === "autoSkipToggle" && typeof data.enabled === "boolean") {
      sendStatus("[1/3] auto-skip " + (data.enabled ? "ON" : "OFF"));
      try {
        chrome.runtime.sendMessage({
          action: "autoSkipFromPanel",
          enabled: data.enabled
        }, function(resp) {
          if (chrome.runtime.lastError) {
            sendStatus("X skip: " + chrome.runtime.lastError.message.substring(0, 25), true);
            return;
          }
          if (resp && resp.ok) {
            sendStatus("[3/3] skip " + (data.enabled ? "ativo" : "off"), false);
          } else {
            sendStatus("X skip: " + (resp && resp.error ? resp.error.substring(0, 20) : "err"), true);
          }
        });
        sendStatus("[2/3] enviando skip...");
      } catch(err) {
        sendStatus("X skip send: " + err.message.substring(0, 20), true);
      }
    }
  });

  return "bridge_installed";
}

// Painel flutuante de controle (permite mudar velocidade na tela)
function injectFloatingControl(enabled, currentSpeed) {
  try {
    var PANEL_ID = "__csp_floating_panel__";
    var existing = document.getElementById(PANEL_ID);

    if (!enabled) {
      if (existing) existing.remove();
      if (window.__CSP_PANEL_OBSERVER__) {
        try { window.__CSP_PANEL_OBSERVER__.disconnect(); } catch(e) {}
        window.__CSP_PANEL_OBSERVER__ = null;
      }
      return "OK:panel_removed";
    }

    if (existing) {
      var btns = existing.querySelectorAll("[data-csp-speed]");
      btns.forEach(function(b) {
        var s = parseFloat(b.getAttribute("data-csp-speed"));
        var active = s === currentSpeed;
        b.style.background = active ? "linear-gradient(135deg, #A855F7, #06B6D4)" : "rgba(255,255,255,0.03)";
        b.style.borderColor = active ? "#A855F7" : "rgba(255,255,255,0.08)";
        b.style.color = active ? "#fff" : "rgba(255,255,255,0.7)";
      });
      var disp = existing.querySelector(".__csp_panel_speed_display");
      if (disp) disp.textContent = (currentSpeed % 1 === 0 ? currentSpeed.toFixed(1) : currentSpeed.toString()) + "x";
      return "OK:panel_updated";
    }

    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position: fixed", "top: 70px", "right: 16px", "z-index: 2147483646",
      "display: flex", "flex-direction: column", "gap: 8px", "padding: 12px",
      "background: rgba(10, 10, 26, 0.94)",
      "-webkit-backdrop-filter: blur(16px)", "backdrop-filter: blur(16px)",
      "border: 1px solid rgba(168, 85, 247, 0.4)", "border-radius: 14px",
      "color: #fff",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(168, 85, 247, 0.2)",
      "min-width: 200px", "user-select: none", "-webkit-user-select: none"
    ].join(";");

    var header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;cursor:grab;padding:2px 0 4px 0;";
    var title = document.createElement("span");
    title.textContent = "SPEED BET";
    title.style.cssText = "font-size:10px;font-weight:700;letter-spacing:0.25em;color:#A855F7;";
    header.appendChild(title);
    var closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Fechar");
    closeBtn.style.cssText = "background:transparent;border:none;color:rgba(255,255,255,0.6);font-size:20px;line-height:1;cursor:pointer;padding:0 6px;font-weight:300;";
    closeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      panel.remove();
      if (window.__CSP_PANEL_OBSERVER__) {
        try { window.__CSP_PANEL_OBSERVER__.disconnect(); } catch(err) {}
        window.__CSP_PANEL_OBSERVER__ = null;
      }
      try {
        window.postMessage({
          __csp_source: "panel",
          action: "panelClosed"
        }, "*");
      } catch(err) {}
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var speedDisplay = document.createElement("div");
    speedDisplay.className = "__csp_panel_speed_display";
    speedDisplay.style.cssText = "text-align:center;font-size:28px;font-weight:800;color:#A855F7;letter-spacing:-0.02em;line-height:1;padding:4px 0;";
    speedDisplay.textContent = (currentSpeed % 1 === 0 ? currentSpeed.toFixed(1) : currentSpeed.toString()) + "x";
    panel.appendChild(speedDisplay);

    // STATUS BAR (debug)
    var statusBar = document.createElement("div");
    statusBar.className = "__csp_panel_status";
    statusBar.style.cssText = "font-size:9px;color:rgba(255,255,255,0.5);text-align:center;padding:2px 0;min-height:12px;font-family:monospace;";
    statusBar.textContent = "ok";
    panel.appendChild(statusBar);

    window.addEventListener("message", function(event) {
      if (event.source !== window) return;
      var d = event.data;
      if (!d || d.__csp_source !== "status") return;
      statusBar.textContent = d.text || "?";
      statusBar.style.color = d.error ? "#ff5555" : "#4ECCA3";
    });

    var grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(4, 1fr);gap:5px;";

    var presets = [1, 1.5, 2, 2.5, 3, 5, 7, 10];
    presets.forEach(function(p) {
      var btn = document.createElement("button");
      btn.textContent = p + "x";
      btn.setAttribute("data-csp-speed", String(p));
      var active = p === currentSpeed;
      btn.style.cssText = [
        "padding:8px 0",
        "border:1px solid " + (active ? "#A855F7" : "rgba(255,255,255,0.08)"),
        "background:" + (active ? "linear-gradient(135deg, #A855F7, #06B6D4)" : "rgba(255,255,255,0.03)"),
        "color:" + (active ? "#fff" : "rgba(255,255,255,0.7)"),
        "border-radius:8px", "font-size:11px", "font-weight:700",
        "font-family:inherit", "cursor:pointer", "transition:all 0.15s", "outline:none"
      ].join(";");
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        var newSpeed = parseFloat(btn.getAttribute("data-csp-speed"));
        // Visual update imediato
        var allBtns = panel.querySelectorAll("[data-csp-speed]");
        allBtns.forEach(function(b) {
          var s = parseFloat(b.getAttribute("data-csp-speed"));
          var a = s === newSpeed;
          b.style.background = a ? "linear-gradient(135deg, #A855F7, #06B6D4)" : "rgba(255,255,255,0.03)";
          b.style.borderColor = a ? "#A855F7" : "rgba(255,255,255,0.08)";
          b.style.color = a ? "#fff" : "rgba(255,255,255,0.7)";
        });
        speedDisplay.textContent = (newSpeed % 1 === 0 ? newSpeed.toFixed(1) : newSpeed.toString()) + "x";
        // Envia pro bridge via postMessage (background re-injeta em allFrames)
        try {
          window.postMessage({
            __csp_source: "panel",
            action: "speedChange",
            speed: newSpeed
          }, "*");
        } catch(err) {}
      });
      grid.appendChild(btn);
    });
    panel.appendChild(grid);

    var dragging = false, dragOffsetX = 0, dragOffsetY = 0;
    header.addEventListener("mousedown", function(e) {
      if (e.target === closeBtn) return;
      dragging = true;
      var rect = panel.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      header.style.cursor = "grabbing";
      e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
      if (!dragging) return;
      panel.style.left = (e.clientX - dragOffsetX) + "px";
      panel.style.top = (e.clientY - dragOffsetY) + "px";
      panel.style.right = "auto";
    });
    document.addEventListener("mouseup", function() {
      if (dragging) { dragging = false; header.style.cursor = "grab"; }
    });

    (document.body || document.documentElement).appendChild(panel);

    var observer = new MutationObserver(function() {
      if (!document.getElementById(PANEL_ID) && (document.body || document.documentElement)) {
        (document.body || document.documentElement).appendChild(panel);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__CSP_PANEL_OBSERVER__ = observer;

    return "OK:panel_created";
  } catch(e) {
    return "ERRO_PANEL:" + e.message;
  }
}

// HUD flutuante que mostra a velocidade atual no canto superior direito
function injectHUD(speed) {
  try {
    var HUD_ID = "__canvas_speed_hud__";
    var existing = document.getElementById(HUD_ID);

    if (speed <= 1) {
      if (existing) existing.remove();
      if (window.__CSP_HUD_OBSERVER__) {
        try { window.__CSP_HUD_OBSERVER__.disconnect(); } catch(e) {}
        window.__CSP_HUD_OBSERVER__ = null;
      }
      return "OK:hud_removed";
    }

    var speedText = (speed % 1 === 0 ? speed.toFixed(1) : speed.toString()) + "x";

    if (existing) {
      var span = existing.querySelector(".__csp_speed_text");
      if (span) span.textContent = speedText;
      return "OK:hud_updated";
    }

    var hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.style.cssText = [
      "position: fixed",
      "top: 16px",
      "right: 16px",
      "z-index: 2147483647",
      "display: flex",
      "align-items: center",
      "gap: 7px",
      "padding: 7px 14px",
      "background: rgba(12, 35, 24, 0.88)",
      "-webkit-backdrop-filter: blur(8px)",
      "backdrop-filter: blur(8px)",
      "border: 1px solid rgba(78, 204, 163, 0.45)",
      "border-radius: 100px",
      "color: #4ECCA3",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "font-size: 14px",
      "font-weight: 700",
      "letter-spacing: 0.02em",
      "pointer-events: none",
      "user-select: none",
      "-webkit-user-select: none",
      "box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 20px rgba(78, 204, 163, 0.25)",
      "line-height: 1"
    ].join(";");

    var SVG_NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "#4ECCA3");
    svg.style.filter = "drop-shadow(0 0 4px rgba(78,204,163,0.6))";
    var poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", "13 2 3 14 12 14 11 22 21 10 12 10 13 2");
    svg.appendChild(poly);
    hud.appendChild(svg);

    var span2 = document.createElement("span");
    span2.className = "__csp_speed_text";
    span2.textContent = speedText;
    hud.appendChild(span2);

    (document.body || document.documentElement).appendChild(hud);

    var observer = new MutationObserver(function() {
      if (!document.getElementById(HUD_ID) && (document.body || document.documentElement)) {
        (document.body || document.documentElement).appendChild(hud);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__CSP_HUD_OBSERVER__ = observer;

    return "OK:hud_created:" + speedText;
  } catch(e) {
    return "ERRO_HUD:" + e.message;
  }
}

function injectAutoSkip(enabled) {
  try {
    if (window.__AUTO_SKIP__) {
      window.__AUTO_SKIP__.enabled = enabled;
      return "OK:" + (enabled ? "on" : "off");
    }
    if (!enabled) return "OK:off";
    var skip = { enabled: true, intervalId: null };
    function doSkip() {
      if (!skip.enabled) return;
      var canvas = document.querySelector("canvas");
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var cx = rect.width / 2, cy = rect.height / 2;
      canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: rect.left + cx, clientY: rect.top + cy }));
      canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: rect.left + cx, clientY: rect.top + cy }));
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: rect.left + cx, clientY: rect.top + cy }));
      try {
        var touch = new Touch({ identifier: 1, target: canvas, clientX: rect.left + cx, clientY: rect.top + cy });
        canvas.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
        canvas.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], targetTouches: [], changedTouches: [touch] }));
      } catch(e) {}
    }
    skip.intervalId = setInterval(function() { if (skip.enabled) doSkip(); }, 500);
    window.__AUTO_SKIP__ = skip;
    return "OK:on";
  } catch(e) {
    return "ERRO:" + e.message;
  }
}

// === Helper: re-injeta em um frame específico (quando carrega/navega) ===

async function reinjectInFrame(tabId, frameId) {
  try {
    var data = await chrome.storage.local.get(["speed", "autoSkip", "floatingPanel"]);
    var speed = data.speed || 1;
    var autoSkip = !!data.autoSkip;
    var floatingPanel = !!data.floatingPanel;

    // Só injeta se há velocidade > 1 OU auto-skip ativo OU painel flutuante ativo
    if (speed <= 1 && !autoSkip && !floatingPanel) return;

    if (speed > 1) {
      await chrome.scripting.executeScript({
        target: { tabId: tabId, frameIds: [frameId] },
        world: "MAIN",
        func: injectCanvasSpeed,
        args: [speed]
      });
    }

    if (autoSkip) {
      await chrome.scripting.executeScript({
        target: { tabId: tabId, frameIds: [frameId] },
        world: "MAIN",
        func: injectAutoSkip,
        args: [true]
      });
    }

    // HUD e painel flutuante — apenas no top frame
    if (frameId === 0) {
      if (speed > 1) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId, frameIds: [0] },
          world: "MAIN",
          func: injectHUD,
          args: [speed]
        });
      }
      if (floatingPanel) {
        // Garante bridge em world ISOLATED
        await chrome.scripting.executeScript({
          target: { tabId: tabId, frameIds: [0] },
          world: "ISOLATED",
          func: setupBridge
        }).catch(function() {});

        await chrome.scripting.executeScript({
          target: { tabId: tabId, frameIds: [0] },
          world: "MAIN",
          func: injectFloatingControl,
          args: [true, speed]
        });
      }
    }
  } catch (e) {}
}

// === Listener: re-injeta quando qualquer frame termina de carregar ===

chrome.webNavigation.onCommitted.addListener(function(details) {
  // Ignorar navegações não-http (chrome://, about:, etc)
  if (!details.url || (!details.url.startsWith("http://") && !details.url.startsWith("https://"))) {
    return;
  }

  // Delay curto pra garantir que o frame está pronto pra receber o script
  setTimeout(function() {
    reinjectInFrame(details.tabId, details.frameId);
  }, 100);
});

// === Listener: re-injeta quando a aba é atualizada/recarregada ===

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === "complete" && tab.url && tab.url.startsWith("http")) {
    chrome.storage.local.get(["speed", "autoSkip", "floatingPanel"], function(data) {
      var speed = data.speed || 1;
      var autoSkip = !!data.autoSkip;
      var floatingPanel = !!data.floatingPanel;

      if (speed <= 1 && !autoSkip && !floatingPanel) return;

      try {
        if (speed > 1) {
          chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            world: "MAIN",
            func: injectCanvasSpeed,
            args: [speed]
          }).catch(function() {});

          chrome.scripting.executeScript({
            target: { tabId: tabId, frameIds: [0] },
            world: "MAIN",
            func: injectHUD,
            args: [speed]
          }).catch(function() {});
        }

        if (autoSkip) {
          chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            world: "MAIN",
            func: injectAutoSkip,
            args: [true]
          }).catch(function() {});
        }

        if (floatingPanel) {
          // Garante bridge em world ISOLATED primeiro
          chrome.scripting.executeScript({
            target: { tabId: tabId, frameIds: [0] },
            world: "ISOLATED",
            func: setupBridge
          }).catch(function() {});

          chrome.scripting.executeScript({
            target: { tabId: tabId, frameIds: [0] },
            world: "MAIN",
            func: injectFloatingControl,
            args: [true, speed]
          }).catch(function() {});
        }
      } catch (e) {}
    });
  }
});

// === Mensagens do popup ===

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action === "getState") {
    chrome.storage.local.get(["speed", "autoSkip", "floatingPanel"], function(data) {
      sendResponse({
        speed: data.speed || 1,
        autoSkip: !!data.autoSkip,
        floatingPanel: !!data.floatingPanel
      });
    });
    return true;
  }

  // Usuário clicou em um preset no painel flutuante
  if (msg.action === "speedChangeFromPanel" && typeof msg.speed === "number") {
    var tabId = sender.tab && sender.tab.id;
    chrome.storage.local.set({ speed: msg.speed });

    if (!tabId) {
      sendResponse({ ok: false, error: "no tabId" });
      return true;
    }

    // Re-injeta em todos os frames
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      world: "MAIN",
      func: injectCanvasSpeed,
      args: [msg.speed]
    }).then(function(results) {
      // results é array de {result, frameId} — contar quantos deram OK
      var okCount = 0, errCount = 0, engines = [];
      results.forEach(function(r) {
        if (r.result && typeof r.result === "string") {
          if (r.result.indexOf("OK") === 0) {
            okCount++;
            var match = r.result.match(/engines=([^:]*)/);
            if (match && match[1] && match[1] !== "") {
              engines.push(match[1]);
            }
          } else if (r.result.indexOf("ERRO") === 0) {
            errCount++;
          }
        }
      });

      // HUD apenas no top frame
      chrome.scripting.executeScript({
        target: { tabId: tabId, frameIds: [0] },
        world: "MAIN",
        func: injectHUD,
        args: [msg.speed]
      }).catch(function() {});

      var engineStr = engines.length > 0 ? engines[0].substring(0, 25) : "sem engine";
      sendResponse({
        ok: true,
        framesInjected: okCount,
        framesError: errCount,
        engines: engineStr
      });
    }).catch(function(err) {
      sendResponse({ ok: false, error: (err && err.message) || "executeScript falhou" });
    });

    return true; // async
  }

  // Usuário fechou o painel flutuante clicando no ×
  // RESET TOTAL: desliga speed, auto-skip, remove HUD e painel
  if (msg.action === "panelClosedByUser") {
    var tabId = sender.tab && sender.tab.id;

    // Limpa storage de uma vez
    chrome.storage.local.set({
      floatingPanel: false,
      speed: 1,
      autoSkip: false
    });

    if (!tabId) {
      sendResponse({ ok: true });
      return true;
    }

    // 1) Reseta speed em TODOS os frames (inclui iframe do jogo)
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      world: "MAIN",
      func: injectCanvasSpeed,
      args: [1]
    }).catch(function() {});

    // 2) Desliga auto-skip em TODOS os frames
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      world: "MAIN",
      func: injectAutoSkip,
      args: [false]
    }).catch(function() {});

    // 3) Remove HUD do top frame (velocidade 1 = remove)
    chrome.scripting.executeScript({
      target: { tabId: tabId, frameIds: [0] },
      world: "MAIN",
      func: injectHUD,
      args: [1]
    }).catch(function() {});

    sendResponse({ ok: true, reset: true });
    return true;
  }

  // Usuário ligou/desligou auto-skip pelo painel flutuante
  if (msg.action === "autoSkipFromPanel" && typeof msg.enabled === "boolean") {
    var tabId = sender.tab && sender.tab.id;
    chrome.storage.local.set({ autoSkip: msg.enabled });

    if (!tabId) {
      sendResponse({ ok: false, error: "no tabId" });
      return true;
    }

    // Auto-skip injeta em allFrames (precisa rodar no iframe do jogo)
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      world: "MAIN",
      func: injectAutoSkip,
      args: [msg.enabled]
    }).then(function() {
      sendResponse({ ok: true });
    }).catch(function(err) {
      sendResponse({ ok: false, error: (err && err.message) || "falha" });
    });

    return true; // async
  }
});

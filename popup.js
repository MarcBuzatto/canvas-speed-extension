/**
 * Canvas Speed Controller Plus v3.0
 * Desenvolvido por markizin
 * Controla velocidade de animações em jogos HTML5/canvas
 * Todos os direitos reservados.
 */

var slider = document.getElementById("speedSlider");
var display = document.getElementById("speedDisplay");
var statusEl = document.getElementById("status");
var presetBtns = document.querySelectorAll(".preset-btn");
var resetBtn = document.getElementById("resetBtn");
var skipToggle = document.getElementById("skipToggle");
var skipStatus = document.getElementById("skipStatus");
var floatingToggle = document.getElementById("floatingToggle");
var floatingStatus = document.getElementById("floatingStatus");

function updateUI(speed, statusText) {
  display.textContent = speed + "x";
  slider.value = speed;
  presetBtns.forEach(function(btn) {
    btn.classList.toggle("active", parseFloat(btn.dataset.speed) === speed);
  });
  if (statusText) {
    statusEl.textContent = statusText;
  } else {
    statusEl.textContent = speed === 1 ? "Normal" : speed + "x ativo";
  }
  statusEl.style.color = speed > 1 ? "#e94560" : "#4ecca3";
}

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
    _setInterval.call(window, function() { if (ctrl.active) scanEngines(); }, 1000);

    ctrl.setSpeed = function(s) {
      if (s <= 1) {
        ctrl.speed = 1; ctrl.active = false; ctrl.perfOffset = 0; ctrl.dateOffset = 0;
        // Resetar TODOS os engines para velocidade normal
        if (window.cc && window.cc.director) { var sched = window.cc.director.getScheduler(); if (sched) sched.setTimeScale(1); }
        if (window.PIXI && window.PIXI.Ticker) { var t = window.PIXI.Ticker.shared || window.PIXI.Ticker.system; if (t) t.speed = 1; }
        // Resetar Spine e qualquer objeto com timeScale
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
    return "OK:inject:" + speed + ":engines=" + engineResult.join(",") + ":url=" + location.href.substring(0, 60);
  } catch (e) {
    return "ERRO:" + e.message + ":url=" + location.href.substring(0, 60);
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
      // APENAS CLICKS no centro do canvas - NAO usar teclado (espaco inicia nova rodada)
      canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: rect.left + cx, clientY: rect.top + cy }));
      canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: rect.left + cx, clientY: rect.top + cy }));
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: rect.left + cx, clientY: rect.top + cy }));
      // Touch events para engines mobile (Cocos em geral)
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

function checkActiveState() {
  return {
    currentSpeed: window.__CANVAS_SPEED__ ? window.__CANVAS_SPEED__.speed : 0,
    active: window.__CANVAS_SPEED__ ? window.__CANVAS_SPEED__.active : false,
    autoSkip: window.__AUTO_SKIP__ ? window.__AUTO_SKIP__.enabled : false
  };
}

// Painel flutuante interativo (controle de velocidade na tela)
// Permite mudar velocidade sem abrir o popup
function injectFloatingControl(enabled, currentSpeed, autoSkipActive) {
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

    // Se já existe, apenas atualiza o preset ativo e o toggle de auto-skip
    if (existing) {
      var btns = existing.querySelectorAll("[data-csp-speed]");
      btns.forEach(function(b) {
        var s = parseFloat(b.getAttribute("data-csp-speed"));
        var active = s === currentSpeed;
        b.style.background = active ? "linear-gradient(135deg, #A855F7, #06B6D4)" : "rgba(255,255,255,0.03)";
        b.style.borderColor = active ? "#A855F7" : "rgba(255,255,255,0.08)";
        b.style.color = active ? "#fff" : "rgba(255,255,255,0.7)";
      });
      var skipCheckbox = existing.querySelector("[data-csp-skip-toggle]");
      if (skipCheckbox) skipCheckbox.checked = !!autoSkipActive;
      var skipTrack = existing.querySelector("[data-csp-skip-track]");
      if (skipTrack) {
        skipTrack.style.background = autoSkipActive ? "linear-gradient(135deg, #A855F7, #06B6D4)" : "rgba(255,255,255,0.08)";
      }
      var skipKnob = existing.querySelector("[data-csp-skip-knob]");
      if (skipKnob) {
        skipKnob.style.left = autoSkipActive ? "18px" : "3px";
        skipKnob.style.background = autoSkipActive ? "#fff" : "#888";
      }
      return "OK:panel_updated";
    }

    // Criar painel do zero
    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position: fixed",
      "top: 70px",
      "right: 16px",
      "z-index: 2147483646",
      "display: flex",
      "flex-direction: column",
      "gap: 8px",
      "padding: 12px",
      "background: rgba(10, 10, 26, 0.94)",
      "-webkit-backdrop-filter: blur(16px)",
      "backdrop-filter: blur(16px)",
      "border: 1px solid rgba(168, 85, 247, 0.4)",
      "border-radius: 14px",
      "color: #fff",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(168, 85, 247, 0.2)",
      "min-width: 200px",
      "user-select: none",
      "-webkit-user-select: none"
    ].join(";");

    // Header (drag handle)
    var header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;cursor:grab;padding:2px 0 4px 0;";

    var title = document.createElement("span");
    title.textContent = "CANVAS SPEED";
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
      // Notifica extensão via postMessage (bridge envia pro background)
      try {
        window.postMessage({
          __csp_source: "panel",
          action: "panelClosed"
        }, "*");
      } catch(err) {}
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Display da velocidade atual
    var speedDisplay = document.createElement("div");
    speedDisplay.className = "__csp_panel_speed_display";
    speedDisplay.style.cssText = [
      "text-align:center",
      "font-size:28px",
      "font-weight:800",
      "color:#A855F7",
      "letter-spacing:-0.02em",
      "line-height:1",
      "padding:4px 0"
    ].join(";");
    speedDisplay.textContent = (currentSpeed % 1 === 0 ? currentSpeed.toFixed(1) : currentSpeed.toString()) + "x";
    panel.appendChild(speedDisplay);

    // STATUS BAR (debug) — mostra o que está acontecendo em cada etapa
    var statusBar = document.createElement("div");
    statusBar.className = "__csp_panel_status";
    statusBar.style.cssText = [
      "font-size:9px",
      "color:rgba(255,255,255,0.5)",
      "text-align:center",
      "padding:2px 0",
      "min-height:12px",
      "font-family:monospace"
    ].join(";");
    statusBar.textContent = "ok";
    panel.appendChild(statusBar);

    // Listener para receber echo de status do bridge/background
    function onStatusMessage(event) {
      if (event.source !== window) return;
      var d = event.data;
      if (!d || d.__csp_source !== "status") return;
      statusBar.textContent = d.text || "?";
      statusBar.style.color = d.error ? "#ff5555" : "#4ECCA3";
    }
    window.addEventListener("message", onStatusMessage);

    // Grid 4x2 de presets
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
        "border-radius:8px",
        "font-size:11px",
        "font-weight:700",
        "font-family:inherit",
        "cursor:pointer",
        "transition:all 0.15s",
        "outline:none"
      ].join(";");

      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        var newSpeed = parseFloat(btn.getAttribute("data-csp-speed"));

        // Atualiza visual local imediatamente (feedback ao usuário)
        var allBtns = panel.querySelectorAll("[data-csp-speed]");
        allBtns.forEach(function(b) {
          var s = parseFloat(b.getAttribute("data-csp-speed"));
          var isActive = s === newSpeed;
          b.style.background = isActive ? "linear-gradient(135deg, #A855F7, #06B6D4)" : "rgba(255,255,255,0.03)";
          b.style.borderColor = isActive ? "#A855F7" : "rgba(255,255,255,0.08)";
          b.style.color = isActive ? "#fff" : "rgba(255,255,255,0.7)";
        });
        speedDisplay.textContent = (newSpeed % 1 === 0 ? newSpeed.toFixed(1) : newSpeed.toString()) + "x";

        // Envia mensagem pro content-bridge via postMessage
        // (postMessage é mais confiável que CustomEvent entre worlds MAIN/ISOLATED)
        // O background vai receber e re-injetar o speed hack em TODOS os frames
        // (incluindo o iframe do jogo, que é onde o speed hack realmente funciona)
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

    // === AUTO-SKIP TOGGLE ===
    var skipRow = document.createElement("div");
    skipRow.style.cssText = [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "padding:8px 4px 4px 4px",
      "margin-top:4px",
      "border-top:1px solid rgba(255,255,255,0.06)"
    ].join(";");

    var skipLabel = document.createElement("span");
    skipLabel.textContent = "Auto-Skip";
    skipLabel.style.cssText = "font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.02em;";
    skipRow.appendChild(skipLabel);

    // Switch (custom, sem depender de CSS externo)
    var skipSwitch = document.createElement("label");
    skipSwitch.style.cssText = "position:relative;width:38px;height:20px;flex-shrink:0;cursor:pointer;";

    var skipCheckbox = document.createElement("input");
    skipCheckbox.type = "checkbox";
    skipCheckbox.checked = !!autoSkipActive;
    skipCheckbox.setAttribute("data-csp-skip-toggle", "");
    skipCheckbox.style.cssText = "opacity:0;width:0;height:0;position:absolute;";

    var skipTrack = document.createElement("span");
    skipTrack.setAttribute("data-csp-skip-track", "");
    skipTrack.style.cssText = [
      "position:absolute",
      "inset:0",
      "background:" + (autoSkipActive ? "linear-gradient(135deg, #A855F7, #06B6D4)" : "rgba(255,255,255,0.08)"),
      "border-radius:10px",
      "transition:background 0.2s"
    ].join(";");

    var skipKnob = document.createElement("span");
    skipKnob.setAttribute("data-csp-skip-knob", "");
    skipKnob.style.cssText = [
      "position:absolute",
      "width:14px",
      "height:14px",
      "left:" + (autoSkipActive ? "18px" : "3px"),
      "top:3px",
      "background:" + (autoSkipActive ? "#fff" : "#888"),
      "border-radius:50%",
      "transition:all 0.2s",
      "pointer-events:none"
    ].join(";");
    skipTrack.appendChild(skipKnob);

    skipCheckbox.addEventListener("change", function() {
      var isOn = skipCheckbox.checked;
      skipTrack.style.background = isOn ? "linear-gradient(135deg, #A855F7, #06B6D4)" : "rgba(255,255,255,0.08)";
      skipKnob.style.left = isOn ? "18px" : "3px";
      skipKnob.style.background = isOn ? "#fff" : "#888";
      // Dispara postMessage — bridge envia pro background
      try {
        window.postMessage({
          __csp_source: "panel",
          action: "autoSkipToggle",
          enabled: isOn
        }, "*");
      } catch(err) {}
    });

    skipSwitch.appendChild(skipCheckbox);
    skipSwitch.appendChild(skipTrack);
    skipRow.appendChild(skipSwitch);
    panel.appendChild(skipRow);

    // Drag and drop no header
    var dragging = false;
    var dragOffsetX = 0, dragOffsetY = 0;

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
      if (dragging) {
        dragging = false;
        header.style.cursor = "grab";
      }
    });

    (document.body || document.documentElement).appendChild(panel);

    // MutationObserver para sobrevivência contra SPA re-render
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
// Injetado SO no top frame (frameId: 0) para ficar em cima de tudo
function injectHUD(speed) {
  try {
    var HUD_ID = "__canvas_speed_hud__";
    var existing = document.getElementById(HUD_ID);

    // Velocidade 1x → remove o HUD
    if (speed <= 1) {
      if (existing) existing.remove();
      if (window.__CSP_HUD_OBSERVER__) {
        try { window.__CSP_HUD_OBSERVER__.disconnect(); } catch(e) {}
        window.__CSP_HUD_OBSERVER__ = null;
      }
      return "OK:hud_removed";
    }

    // Formatar velocidade (10 vira "10.0x", 1.5 vira "1.5x")
    var speedText = (speed % 1 === 0 ? speed.toFixed(1) : speed.toString()) + "x";

    // Se HUD já existe, só atualiza o número
    if (existing) {
      var span = existing.querySelector(".__csp_speed_text");
      if (span) span.textContent = speedText;
      return "OK:hud_updated";
    }

    // Criar HUD novo via DOM API (seguro, sem innerHTML)
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

    // Ícone SVG (raio) - criado via DOM API
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

    // Texto da velocidade
    var span = document.createElement("span");
    span.className = "__csp_speed_text";
    span.textContent = speedText;
    hud.appendChild(span);

    // Insere no body (ou html se body não existe ainda)
    (document.body || document.documentElement).appendChild(hud);

    // MutationObserver: se o site remover o HUD (SPA re-render), re-insere
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

async function setSpeed(speed) {
  updateUI(speed, "Injetando...");
  chrome.storage.local.set({ speed: speed });
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  if (!tab) { statusEl.textContent = "Sem aba ativa"; statusEl.style.color = "#ff4444"; return; }
  try {
    var results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "MAIN", func: injectCanvasSpeed, args: [speed]
    });
    var allResults = results.map(function(r) { return r.result || "null"; });
    var ok = results.filter(function(r) { return r.result && r.result.indexOf("OK") === 0; });
    var errs = results.filter(function(r) { return r.result && r.result.indexOf("ERRO") === 0; });
    if (ok.length > 0) {
      var engineInfo = "";
      ok.forEach(function(r) { var m = r.result.match(/engines=([^:]*)/); if (m && m[1]) engineInfo = m[1]; });
      statusEl.textContent = speed > 1 ? ok.length + " frame(s) " + speed + "x" + (engineInfo ? " [" + engineInfo + "]" : "") : "Normal";
      statusEl.style.color = speed > 1 ? "#e94560" : "#4ecca3";
    } else if (errs.length > 0) {
      statusEl.textContent = "Erro: " + errs[0].result.substring(0, 50);
      statusEl.style.color = "#ff6b6b";
    } else {
      statusEl.textContent = results.length + " frames, 0 responderam";
      statusEl.style.color = "#ff6b6b";
    }

    // HUD no top frame — indicador visual da velocidade no canto da tela
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        world: "MAIN", func: injectHUD, args: [speed]
      });
    } catch(e) {}

    // Painel flutuante (se ativo) — atualiza o preset selecionado
    var panelData = await chrome.storage.local.get(["floatingPanel", "autoSkip"]);
    if (panelData.floatingPanel) {
      try {
        // Bridge primeiro
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [0] },
          world: "ISOLATED", func: setupBridge
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [0] },
          world: "MAIN", func: injectFloatingControl, args: [true, speed, !!panelData.autoSkip]
        });
      } catch(e) {}
    }
  } catch (e) {
    statusEl.textContent = "Falha: " + e.message.substring(0, 50);
    statusEl.style.color = "#ff6b6b";
  }
}

// Função que injeta o bridge em world: ISOLATED
// (fallback para páginas abertas antes da instalação do content_scripts)
function setupBridge() {
  if (window.__CSP_BRIDGE_READY__) return "already_ready";
  window.__CSP_BRIDGE_READY__ = true;

  function sendStatus(text, isError) {
    try {
      window.postMessage({
        __csp_source: "status",
        text: text,
        error: !!isError
      }, "*");
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
          if (!response) {
            sendStatus("X bg: sem resposta", true);
            return;
          }
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

    // Auto-skip toggle pelo painel
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

async function toggleFloatingControl(enabled) {
  chrome.storage.local.set({ floatingPanel: enabled });
  floatingStatus.textContent = enabled ? "Ativo" : "Desativado";
  floatingStatus.style.color = enabled ? "#e94560" : "#666";
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  if (!tab) return;
  var data = await chrome.storage.local.get(["speed", "autoSkip"]);
  var currentSpeed = data.speed || 1;
  try {
    // Se ativando, injeta o bridge em world ISOLATED (fallback para páginas já abertas)
    if (enabled) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [0] },
          world: "ISOLATED",
          func: setupBridge
        });
      } catch(e) {}
    }

    // Injeta o painel em world MAIN
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      world: "MAIN",
      func: injectFloatingControl,
      args: [enabled, currentSpeed, !!data.autoSkip]
    });
  } catch(e) {
    floatingStatus.textContent = "Erro: " + e.message.substring(0, 30);
    floatingStatus.style.color = "#ff4444";
  }
}

async function toggleAutoSkip(enabled) {
  chrome.storage.local.set({ autoSkip: enabled });
  skipStatus.textContent = enabled ? "Auto-skip ativo" : "Desativado";
  skipStatus.style.color = enabled ? "#e94560" : "#666";
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  if (!tab) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "MAIN", func: injectAutoSkip, args: [enabled]
    });

    // Se painel flutuante está ativo, atualiza o toggle lá também
    var d = await chrome.storage.local.get(["speed", "floatingPanel"]);
    if (d.floatingPanel) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        world: "MAIN",
        func: injectFloatingControl,
        args: [true, d.speed || 1, enabled]
      }).catch(function() {});
    }
  } catch(e) {
    skipStatus.textContent = "Erro: " + e.message.substring(0, 30);
    skipStatus.style.color = "#ff4444";
  }
}

async function initPopup() {
  var data = await chrome.storage.local.get(["speed", "autoSkip", "floatingPanel"]);
  var savedSpeed = data.speed || 1;
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];

  // Sempre atualiza UI com o valor salvo
  updateUI(savedSpeed);

  if (data.autoSkip) {
    skipToggle.checked = true;
    skipStatus.textContent = "Auto-skip ativo";
    skipStatus.style.color = "#e94560";
  }

  if (data.floatingPanel) {
    floatingToggle.checked = true;
    floatingStatus.textContent = "Ativo";
    floatingStatus.style.color = "#e94560";
  }

  // BUG FIX: Ao abrir o popup, SEMPRE re-injeta em TODOS os frames
  // Isso resolve o bug de "volto pro jogo e a extensão não funciona"
  // (o iframe do jogo é recriado quando o usuário navega, perdendo a injeção)
  if (tab && savedSpeed > 1) {
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: "MAIN", func: injectCanvasSpeed, args: [savedSpeed]
      });
      var ok = results.filter(function(r) { return r.result && r.result.indexOf("OK") === 0; });
      if (ok.length > 0) {
        var engineInfo = "";
        ok.forEach(function(r) { var m = r.result.match(/engines=([^:]*)/); if (m && m[1]) engineInfo = m[1]; });
        statusEl.textContent = ok.length + " frame(s) " + savedSpeed + "x" + (engineInfo ? " [" + engineInfo + "]" : "");
        statusEl.style.color = "#e94560";
      }

      // Re-injeta HUD no top frame
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        world: "MAIN", func: injectHUD, args: [savedSpeed]
      });
    } catch(e) {
      // Ignorar erros de injeção silenciosa
    }
  }

  // Se painel flutuante está ativo, re-injeta (bridge + painel)
  if (tab && data.floatingPanel) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        world: "ISOLATED", func: setupBridge
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        world: "MAIN", func: injectFloatingControl, args: [true, savedSpeed, !!data.autoSkip]
      });
    } catch(e) {}
  }

  // Se auto-skip estava ativo, re-injeta também
  if (tab && data.autoSkip) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: "MAIN", func: injectAutoSkip, args: [true]
      });
    } catch(e) {}
  }
}

// Tabs handler
function setupTabs() {
  var tabBtns = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");
  tabBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var target = btn.getAttribute("data-tab");
      tabBtns.forEach(function(b) { b.classList.toggle("active", b === btn); });
      tabPanels.forEach(function(p) {
        p.classList.toggle("active", p.id === "tab-" + target);
      });
    });
  });
}

try {
  setupTabs();
  initPopup();

  slider.addEventListener("input", function() { display.textContent = parseFloat(slider.value) + "x"; });
  slider.addEventListener("change", function() { setSpeed(parseFloat(slider.value)); });
  presetBtns.forEach(function(btn) { btn.addEventListener("click", function() { slider.value = btn.dataset.speed; setSpeed(parseFloat(btn.dataset.speed)); }); });
  resetBtn.addEventListener("click", function() { slider.value = 1; setSpeed(1); });
  skipToggle.addEventListener("change", function() { toggleAutoSkip(skipToggle.checked); });
  floatingToggle.addEventListener("change", function() { toggleFloatingControl(floatingToggle.checked); });

  // BUG 2 FIX: Listener pro storage. Quando o usuário fecha o painel flutuante
  // pelo × (background atualiza storage), o toggle do popup reflete a mudança em tempo real
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== "local") return;
    if (changes.floatingPanel !== undefined) {
      var newVal = !!changes.floatingPanel.newValue;
      floatingToggle.checked = newVal;
      floatingStatus.textContent = newVal ? "Ativo" : "Desativado";
      floatingStatus.style.color = newVal ? "#e94560" : "#666";
    }
    if (changes.speed !== undefined) {
      var newSpeed = changes.speed.newValue || 1;
      updateUI(newSpeed);
    }
    if (changes.autoSkip !== undefined) {
      var newSkip = !!changes.autoSkip.newValue;
      skipToggle.checked = newSkip;
      skipStatus.textContent = newSkip ? "Auto-skip ativo" : "Desativado";
      skipStatus.style.color = newSkip ? "#e94560" : "#666";
    }
  });

  statusEl.textContent = "Pronto - clique uma velocidade";
  statusEl.style.color = "#4ecca3";
} catch(e) {
  document.getElementById("status").textContent = "ERRO JS: " + e.message;
  document.getElementById("status").style.color = "#ff4444";
}

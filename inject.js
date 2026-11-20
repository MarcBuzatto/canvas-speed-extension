/**
 * Canvas Speed Controller Plus - funções injetadas na página (world MAIN).
 * Fonte única usada pelo popup e pelo background (antes havia 3 cópias divergentes).
 * Cada função é serializada por chrome.scripting.executeScript, então precisa ser
 * autocontida: nada de referência a variáveis ou funções de fora dela.
 */

function formatSpeedLabel(speed) {
  return (speed % 1 === 0 ? speed.toFixed(1) : String(speed)) + "x";
}

function injectCanvasSpeed(speed) {
  try {
    if (window.__CANVAS_SPEED__) {
      var found = window.__CANVAS_SPEED__.setSpeed(speed) || [];
      return "OK:update:" + speed + ":engines=" + found.join(",");
    }

    var _setTimeout = window.setTimeout;
    var _setInterval = window.setInterval;
    var _RAF = window.requestAnimationFrame;
    var _DateNow = Date.now;
    var _perfNow = Performance.prototype.now;

    var ctrl = {
      speed: speed,
      lastPerf: _perfNow.call(performance),
      lastDate: _DateNow.call(Date),
      perfOffset: 0,
      dateOffset: 0,
      touched: [],
      rawSetTimeout: _setTimeout,
      rawSetInterval: _setInterval
    };

    function isActive() { return ctrl.speed !== 1; }

    function sync() {
      var np = _perfNow.call(performance);
      var nd = _DateNow.call(Date);
      ctrl.perfOffset += (np - ctrl.lastPerf) * (ctrl.speed - 1);
      ctrl.dateOffset += (nd - ctrl.lastDate) * (ctrl.speed - 1);
      ctrl.lastPerf = np;
      ctrl.lastDate = nd;
    }

    function scaleArgs(args) {
      var out = Array.prototype.slice.call(args);
      out[1] = Math.max(1, Math.floor((out[1] || 0) / ctrl.speed));
      return out;
    }

    window.setTimeout = function() {
      if (!isActive()) return _setTimeout.apply(window, arguments);
      return _setTimeout.apply(window, scaleArgs(arguments));
    };

    window.setInterval = function() {
      if (!isActive()) return _setInterval.apply(window, arguments);
      return _setInterval.apply(window, scaleArgs(arguments));
    };

    // O offset é aplicado sempre (mesmo em 1x): assim o relógio continua contínuo
    // depois de um reset, em vez de pular para trás e gerar delta negativo no jogo.
    window.requestAnimationFrame = function(cb) {
      return _RAF.call(window, function(ts) {
        sync();
        cb(ts + ctrl.perfOffset);
      });
    };

    Performance.prototype.now = function() {
      sync();
      return _perfNow.call(this) + ctrl.perfOffset;
    };

    Date.now = function() {
      sync();
      return _DateNow.call(Date) + ctrl.dateOffset;
    };

    function touch(obj, prop, value) {
      obj[prop] = value;
      for (var i = 0; i < ctrl.touched.length; i++) {
        if (ctrl.touched[i].obj === obj && ctrl.touched[i].prop === prop) return;
      }
      ctrl.touched.push({ obj: obj, prop: prop });
    }

    function scanEngines() {
      var found = [];
      if (window.cc && window.cc.director && window.cc.director.getScheduler) {
        var scheduler = window.cc.director.getScheduler();
        if (scheduler) { scheduler.setTimeScale(ctrl.speed); found.push("cc.scheduler"); }
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
          if (obj && typeof obj === "object" && obj !== window) {
            if (typeof obj.timeScale === "number") { touch(obj, "timeScale", ctrl.speed); found.push(key + ".timeScale"); }
            if (typeof obj._timeScale === "number") { touch(obj, "_timeScale", ctrl.speed); found.push(key + "._timeScale"); }
          }
        } catch(e) {}
      }
      return found;
    }

    function resetEngines() {
      try {
        if (window.cc && window.cc.director && window.cc.director.getScheduler) {
          var sched = window.cc.director.getScheduler();
          if (sched) sched.setTimeScale(1);
        }
      } catch(e) {}
      try {
        if (window.PIXI && window.PIXI.Ticker) {
          var t = window.PIXI.Ticker.shared || window.PIXI.Ticker.system;
          if (t) t.speed = 1;
        }
      } catch(e) {}
      ctrl.touched.forEach(function(entry) {
        try { entry.obj[entry.prop] = 1; } catch(e) {}
      });
      ctrl.touched = [];
    }

    ctrl.setSpeed = function(s) {
      sync();
      var wasActive = isActive();
      ctrl.speed = s;
      if (isActive()) return scanEngines();
      // Date.now é relógio de parede: volta ao real. performance.now é monotônico: mantém o offset.
      ctrl.dateOffset = 0;
      if (wasActive) resetEngines();
      return [];
    };

    var engineResult = isActive() ? scanEngines() : [];
    _setInterval.call(window, function() { if (isActive()) scanEngines(); }, 1000);

    window.__CANVAS_SPEED__ = ctrl;
    return "OK:inject:" + speed + ":engines=" + engineResult.join(",");
  } catch (e) {
    return "ERRO:" + e.message;
  }
}

function injectAutoSkip(enabled, options) {
  try {
    var opts = options || {};
    var intervalMs = typeof opts.intervalMs === "number" && opts.intervalMs >= 50 ? opts.intervalMs : 500;
    var px = typeof opts.x === "number" ? Math.min(100, Math.max(0, opts.x)) : 50;
    var py = typeof opts.y === "number" ? Math.min(100, Math.max(0, opts.y)) : 50;
    var skip = window.__AUTO_SKIP__;

    // Instância da v3.4 (sem .click) continuaria clicando em paralelo: cancela e recria.
    if (skip && typeof skip.click !== "function") {
      if (skip.intervalId !== undefined && skip.intervalId !== null) clearInterval(skip.intervalId);
      skip.enabled = false;
      skip = null;
      window.__AUTO_SKIP__ = null;
    }

    if (!skip) {
      if (!enabled) return "OK:off";
      skip = { enabled: false, intervalMs: 0, x: 50, y: 50, timerId: null };
      skip.click = function() {
        var canvas = document.querySelector("canvas");
        if (!canvas) return;
        var rect = canvas.getBoundingClientRect();
        var x = rect.left + rect.width * skip.x / 100;
        var y = rect.top + rect.height * skip.y / 100;
        // Só clique/touch no canvas: teclado (espaço) iniciaria nova rodada em alguns jogos.
        canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        try {
          var t = new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y });
          canvas.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
          canvas.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], targetTouches: [], changedTouches: [t] }));
        } catch(e) {}
      };
      window.__AUTO_SKIP__ = skip;
    }

    skip.enabled = enabled;
    skip.x = px;
    skip.y = py;

    if (!enabled) {
      if (skip.timerId !== null) { clearInterval(skip.timerId); skip.timerId = null; }
      return "OK:off";
    }

    if (skip.timerId === null || skip.intervalMs !== intervalMs) {
      if (skip.timerId !== null) clearInterval(skip.timerId);
      // setInterval original: com o hook ativo, 10x viraria um clique 10x mais frequente.
      var rawSetInterval = (window.__CANVAS_SPEED__ && window.__CANVAS_SPEED__.rawSetInterval) || window.setInterval;
      skip.timerId = rawSetInterval.call(window, function() { if (skip.enabled) skip.click(); }, intervalMs);
      skip.intervalMs = intervalMs;
    }
    return "OK:on";
  } catch(e) {
    return "ERRO:" + e.message;
  }
}

function injectHUD(speed) {
  try {
    var HUD_ID = "__canvas_speed_hud__";
    var existing = document.getElementById(HUD_ID);

    if (speed === 1) {
      if (existing) existing.remove();
      if (window.__CSP_HUD_OBSERVER__) {
        try { window.__CSP_HUD_OBSERVER__.disconnect(); } catch(e) {}
        window.__CSP_HUD_OBSERVER__ = null;
      }
      return "OK:hud_removed";
    }

    var speedText = (speed % 1 === 0 ? speed.toFixed(1) : String(speed)) + "x";

    if (existing) {
      var span = existing.querySelector(".__csp_speed_text");
      if (span) span.textContent = speedText;
      return "OK:hud_updated";
    }

    var hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.setAttribute("role", "status");
    hud.style.cssText = [
      "position: fixed", "top: 16px", "right: 16px", "z-index: 2147483647",
      "display: flex", "align-items: center", "gap: 7px", "padding: 7px 14px",
      "background: rgba(12, 35, 24, 0.88)",
      "-webkit-backdrop-filter: blur(8px)", "backdrop-filter: blur(8px)",
      "border: 1px solid rgba(78, 204, 163, 0.45)", "border-radius: 100px",
      "color: #4ECCA3",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "font-size: 14px", "font-weight: 700", "letter-spacing: 0.02em",
      "pointer-events: none", "user-select: none", "-webkit-user-select: none",
      "box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 20px rgba(78, 204, 163, 0.25)",
      "line-height: 1"
    ].join(";");

    var SVG_NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "#4ECCA3");
    svg.setAttribute("aria-hidden", "true");
    svg.style.filter = "drop-shadow(0 0 4px rgba(78,204,163,0.6))";
    var poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", "13 2 3 14 12 14 11 22 21 10 12 10 13 2");
    svg.appendChild(poly);
    hud.appendChild(svg);

    var text = document.createElement("span");
    text.className = "__csp_speed_text";
    text.textContent = speedText;
    hud.appendChild(text);

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

function injectFloatingControl(enabled, currentSpeed, autoSkipActive, presets) {
  try {
    var PANEL_ID = "__csp_floating_panel__";
    var ACTIVE_BG = "linear-gradient(135deg, #A855F7, #06B6D4)";
    var existing = document.getElementById(PANEL_ID);

    function fmt(s) { return (s % 1 === 0 ? s.toFixed(1) : String(s)) + "x"; }

    function paintPresets(root, speed) {
      root.querySelectorAll("[data-csp-speed]").forEach(function(b) {
        var active = parseFloat(b.getAttribute("data-csp-speed")) === speed;
        b.style.background = active ? ACTIVE_BG : "rgba(255,255,255,0.03)";
        b.style.borderColor = active ? "#A855F7" : "rgba(255,255,255,0.08)";
        b.style.color = active ? "#fff" : "rgba(255,255,255,0.7)";
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      var disp = root.querySelector(".__csp_panel_speed_display");
      if (disp) disp.textContent = fmt(speed);
    }

    function paintSkip(root, on) {
      var cb = root.querySelector("[data-csp-skip-toggle]");
      if (cb) cb.checked = !!on;
      var track = root.querySelector("[data-csp-skip-track]");
      if (track) track.style.background = on ? ACTIVE_BG : "rgba(255,255,255,0.08)";
      var knob = root.querySelector("[data-csp-skip-knob]");
      if (knob) {
        knob.style.left = on ? "18px" : "3px";
        knob.style.background = on ? "#fff" : "#888";
      }
    }

    var presetList = Array.isArray(presets) && presets.length ? presets : [1, 1.5, 2, 2.5, 3, 5, 7, 10];

    function post(payload) {
      payload.__csp_source = "panel";
      try { window.postMessage(payload, "*"); } catch(e) {}
    }

    function buildGrid(root, grid) {
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      grid.setAttribute("data-csp-presets", presetList.join(","));
      presetList.forEach(function(p) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = p + "x";
        btn.setAttribute("data-csp-speed", String(p));
        btn.style.cssText = [
          "padding:8px 0", "border:1px solid rgba(255,255,255,0.08)",
          "border-radius:8px", "font-size:11px", "font-weight:700",
          "font-family:inherit", "cursor:pointer", "transition:all 0.15s"
        ].join(";");
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          paintPresets(root, p);
          post({ action: "speedChange", speed: p });
        });
        grid.appendChild(btn);
      });
    }

    function teardown() {
      if (window.__CSP_PANEL_CLEANUP__) {
        try { window.__CSP_PANEL_CLEANUP__(); } catch(e) {}
        window.__CSP_PANEL_CLEANUP__ = null;
      }
    }

    if (!enabled) {
      teardown();
      if (existing) existing.remove();
      return "OK:panel_removed";
    }

    if (existing) {
      var existingGrid = existing.querySelector("[data-csp-presets]");
      if (existingGrid && existingGrid.getAttribute("data-csp-presets") !== presetList.join(",")) {
        buildGrid(existing, existingGrid);
      }
      paintPresets(existing, currentSpeed);
      paintSkip(existing, autoSkipActive);
      return "OK:panel_updated";
    }

    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Controle de velocidade");
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
    title.textContent = "CANVAS SPEED";
    title.style.cssText = "font-size:10px;font-weight:700;letter-spacing:0.25em;color:#A855F7;";
    header.appendChild(title);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Fechar e resetar");
    closeBtn.style.cssText = "background:transparent;border:none;color:rgba(255,255,255,0.6);font-size:20px;line-height:1;cursor:pointer;padding:0 6px;font-weight:300;";
    closeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      teardown();
      panel.remove();
      post({ action: "panelClosed" });
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var speedDisplay = document.createElement("div");
    speedDisplay.className = "__csp_panel_speed_display";
    speedDisplay.setAttribute("aria-live", "polite");
    speedDisplay.style.cssText = "text-align:center;font-size:28px;font-weight:800;color:#A855F7;letter-spacing:-0.02em;line-height:1;padding:4px 0;";
    panel.appendChild(speedDisplay);

    var statusBar = document.createElement("div");
    statusBar.style.cssText = "font-size:9px;color:rgba(255,255,255,0.5);text-align:center;padding:2px 0;min-height:12px;font-family:monospace;";
    statusBar.textContent = "ok";
    panel.appendChild(statusBar);

    function onStatusMessage(event) {
      if (event.source !== window) return;
      var d = event.data;
      if (!d || d.__csp_source !== "status") return;
      statusBar.textContent = d.text || "?";
      statusBar.style.color = d.error ? "#ff5555" : "#4ECCA3";
    }
    window.addEventListener("message", onStatusMessage);

    var grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(4, 1fr);gap:5px;";
    buildGrid(panel, grid);
    panel.appendChild(grid);

    var skipRow = document.createElement("div");
    skipRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 4px 4px 4px;margin-top:4px;border-top:1px solid rgba(255,255,255,0.06);";
    var skipSwitch = document.createElement("label");
    skipSwitch.style.cssText = "display:flex;align-items:center;justify-content:space-between;width:100%;cursor:pointer;";
    var skipLabel = document.createElement("span");
    skipLabel.textContent = "Auto-Skip";
    skipLabel.style.cssText = "font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.02em;";
    var skipCheckbox = document.createElement("input");
    skipCheckbox.type = "checkbox";
    skipCheckbox.setAttribute("data-csp-skip-toggle", "");
    skipCheckbox.style.cssText = "opacity:0;width:0;height:0;position:absolute;";
    var skipTrack = document.createElement("span");
    skipTrack.setAttribute("data-csp-skip-track", "");
    skipTrack.style.cssText = "position:relative;display:inline-block;width:38px;height:20px;flex-shrink:0;border-radius:10px;transition:background 0.2s;";
    var skipKnob = document.createElement("span");
    skipKnob.setAttribute("data-csp-skip-knob", "");
    skipKnob.style.cssText = "position:absolute;width:14px;height:14px;top:3px;border-radius:50%;transition:all 0.2s;pointer-events:none;";
    skipTrack.appendChild(skipKnob);
    skipCheckbox.addEventListener("change", function() {
      paintSkip(panel, skipCheckbox.checked);
      post({ action: "autoSkipToggle", enabled: skipCheckbox.checked });
    });
    skipSwitch.appendChild(skipLabel);
    skipSwitch.appendChild(skipCheckbox);
    skipSwitch.appendChild(skipTrack);
    skipRow.appendChild(skipSwitch);
    panel.appendChild(skipRow);

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
    function onMouseMove(e) {
      if (!dragging) return;
      var maxX = window.innerWidth - panel.offsetWidth;
      var maxY = window.innerHeight - panel.offsetHeight;
      panel.style.left = Math.min(Math.max(0, e.clientX - dragOffsetX), Math.max(0, maxX)) + "px";
      panel.style.top = Math.min(Math.max(0, e.clientY - dragOffsetY), Math.max(0, maxY)) + "px";
      panel.style.right = "auto";
    }
    function onMouseUp() {
      if (dragging) { dragging = false; header.style.cursor = "grab"; }
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    paintPresets(panel, currentSpeed);
    paintSkip(panel, autoSkipActive);
    (document.body || document.documentElement).appendChild(panel);

    var observer = new MutationObserver(function() {
      if (!document.getElementById(PANEL_ID) && (document.body || document.documentElement)) {
        (document.body || document.documentElement).appendChild(panel);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.__CSP_PANEL_CLEANUP__ = function() {
      observer.disconnect();
      window.removeEventListener("message", onStatusMessage);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    return "OK:panel_created";
  } catch(e) {
    return "ERRO_PANEL:" + e.message;
  }
}

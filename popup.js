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
  } catch (e) {
    statusEl.textContent = "Falha: " + e.message.substring(0, 50);
    statusEl.style.color = "#ff6b6b";
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
  } catch(e) {
    skipStatus.textContent = "Erro: " + e.message.substring(0, 30);
    skipStatus.style.color = "#ff4444";
  }
}

async function initPopup() {
  var data = await chrome.storage.local.get(["speed", "autoSkip"]);
  var savedSpeed = data.speed || 1;
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];

  if (tab) {
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: "MAIN", func: checkActiveState
      });
      var found = false;
      for (var i = 0; i < results.length; i++) {
        var r = results[i].result;
        if (r && r.active) {
          found = true;
          updateUI(r.currentSpeed, r.currentSpeed + "x ativo");
          if (r.autoSkip) {
            skipToggle.checked = true;
            skipStatus.textContent = "Auto-skip ativo";
            skipStatus.style.color = "#e94560";
          }
          break;
        }
      }
      if (!found) updateUI(savedSpeed);
    } catch(e) {
      updateUI(savedSpeed);
    }
  } else {
    updateUI(savedSpeed);
  }

  if (data.autoSkip) {
    skipToggle.checked = true;
    skipStatus.textContent = "Auto-skip ativo";
    skipStatus.style.color = "#e94560";
  }
}

try {
  initPopup();

  slider.addEventListener("input", function() { display.textContent = parseFloat(slider.value) + "x"; });
  slider.addEventListener("change", function() { setSpeed(parseFloat(slider.value)); });
  presetBtns.forEach(function(btn) { btn.addEventListener("click", function() { slider.value = btn.dataset.speed; setSpeed(parseFloat(btn.dataset.speed)); }); });
  resetBtn.addEventListener("click", function() { slider.value = 1; setSpeed(1); });
  skipToggle.addEventListener("change", function() { toggleAutoSkip(skipToggle.checked); });

  statusEl.textContent = "Pronto - clique uma velocidade";
  statusEl.style.color = "#4ecca3";
} catch(e) {
  document.getElementById("status").textContent = "ERRO JS: " + e.message;
  document.getElementById("status").style.color = "#ff4444";
}

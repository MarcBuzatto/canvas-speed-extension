/**
 * Canvas Speed Controller Plus - lógica do lado da extensão (popup + background).
 * Depende das funções de inject.js estarem carregadas no mesmo escopo.
 *
 * O estado é guardado POR SITE (chave "site:<host>"): antes era global, e o
 * background injetava o speed hack em toda página http(s) aberta, não só no jogo.
 */

var MIN_SPEED = 0.25;
var MAX_SPEED = 16;
var SITE_KEY_PREFIX = "site:";
var LEGACY_STORAGE_KEYS = ["speed", "autoSkip", "floatingPanel"];

function defaultSiteState() {
  return { speed: 1, autoSkip: false, floatingPanel: false };
}

function clampSpeed(value) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
}

function siteKeyFromUrl(url) {
  try {
    var u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.host || null;
  } catch (e) {
    return null;
  }
}

function storageKeyForSite(siteKey) {
  return SITE_KEY_PREFIX + siteKey;
}

function normalizeSiteState(raw) {
  var state = defaultSiteState();
  if (!raw || typeof raw !== "object") return state;
  var speed = clampSpeed(raw.speed);
  if (speed !== null) state.speed = speed;
  state.autoSkip = raw.autoSkip === true;
  state.floatingPanel = raw.floatingPanel === true;
  return state;
}

function isDefaultSiteState(state) {
  return state.speed === 1 && !state.autoSkip && !state.floatingPanel;
}

async function getSiteState(siteKey) {
  if (!siteKey) return defaultSiteState();
  var key = storageKeyForSite(siteKey);
  var data = await chrome.storage.local.get([key]);
  return normalizeSiteState(data[key]);
}

async function setSiteState(siteKey, patch) {
  var current = await getSiteState(siteKey);
  var next = normalizeSiteState({
    speed: patch.speed !== undefined && clampSpeed(patch.speed) !== null ? patch.speed : current.speed,
    autoSkip: patch.autoSkip !== undefined ? patch.autoSkip : current.autoSkip,
    floatingPanel: patch.floatingPanel !== undefined ? patch.floatingPanel : current.floatingPanel
  });
  if (!siteKey) return next;
  var key = storageKeyForSite(siteKey);
  if (isDefaultSiteState(next)) {
    await chrome.storage.local.remove(key);
  } else {
    var obj = {};
    obj[key] = next;
    await chrome.storage.local.set(obj);
  }
  return next;
}

function summarizeInjection(results) {
  var summary = { ok: 0, errors: 0, engines: "", firstError: "" };
  (results || []).forEach(function(r) {
    var res = r && r.result;
    if (typeof res !== "string") return;
    if (res.indexOf("OK") === 0) {
      summary.ok++;
      var m = res.match(/engines=([^:]*)/);
      if (m && m[1] && !summary.engines) summary.engines = m[1];
    } else if (res.indexOf("ERRO") === 0) {
      summary.errors++;
      if (!summary.firstError) summary.firstError = res;
    }
  });
  return summary;
}

async function runScript(options) {
  try {
    return await chrome.scripting.executeScript(options);
  } catch (e) {
    return [{ result: "ERRO:" + ((e && e.message) || "executeScript falhou") }];
  }
}

/**
 * Aplica o estado do site numa aba.
 * - frameId omitido: todos os frames (inclusive reset quando o estado é padrão).
 * - frameId informado: só aquele frame (frame recém-navegado); estado padrão = nada a fazer.
 * Retorna o resumo da injeção do speed hack.
 */
async function applySiteState(tabId, state, frameId) {
  var allFrames = frameId === undefined || frameId === null;
  if (!allFrames && isDefaultSiteState(state)) return summarizeInjection([]);

  var target = allFrames ? { tabId: tabId, allFrames: true } : { tabId: tabId, frameIds: [frameId] };
  var isTop = allFrames || frameId === 0;
  var topTarget = { tabId: tabId, frameIds: [0] };
  var speedResults = [];

  if (allFrames || state.speed !== 1) {
    speedResults = await runScript({
      target: target, world: "MAIN", injectImmediately: true,
      func: injectCanvasSpeed, args: [state.speed]
    });
  }

  if (allFrames || state.autoSkip) {
    await runScript({ target: target, world: "MAIN", func: injectAutoSkip, args: [state.autoSkip] });
  }

  if (isTop) {
    if (allFrames || state.speed !== 1) {
      await runScript({ target: topTarget, world: "MAIN", func: injectHUD, args: [state.speed] });
    }
    if (state.floatingPanel) {
      await runScript({ target: topTarget, files: ["content-bridge.js"] });
      await runScript({
        target: topTarget, world: "MAIN",
        func: injectFloatingControl, args: [true, state.speed, state.autoSkip]
      });
    } else if (allFrames) {
      await runScript({
        target: topTarget, world: "MAIN",
        func: injectFloatingControl, args: [false, state.speed, state.autoSkip]
      });
    }
  }

  return summarizeInjection(speedResults);
}

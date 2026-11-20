/**
 * Canvas Speed Controller Plus - lógica do lado da extensão (popup + background).
 * Depende das funções de inject.js estarem carregadas no mesmo escopo.
 *
 * O estado é guardado POR SITE (chave "site:<host>"): antes era global, e o
 * background injetava o speed hack em toda página http(s) aberta, não só no jogo.
 */

var MIN_SPEED = 0.25;
var MAX_SPEED = 16;
var MIN_SKIP_INTERVAL = 100;
var MAX_SKIP_INTERVAL = 10000;
var MAX_PRESETS = 8;
var DEFAULT_PRESETS = [1, 1.5, 2, 2.5, 3, 5, 7, 10];
var SITE_KEY_PREFIX = "site:";
var SETTINGS_KEY = "settings";
var LEGACY_STORAGE_KEYS = ["speed", "autoSkip", "floatingPanel"];

function defaultSiteState() {
  return { speed: 1, autoSkip: false, floatingPanel: false, skipIntervalMs: 500, skipX: 50, skipY: 50 };
}

function clampSpeed(value) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
}

function clampSkipInterval(value) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  return Math.min(MAX_SKIP_INTERVAL, Math.max(MIN_SKIP_INTERVAL, Math.round(value)));
}

function clampPercent(value) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
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

// Valores inválidos em `raw` caem no valor de `base` (padrão, se omitido).
function normalizeSiteState(raw, base) {
  var state = Object.assign(defaultSiteState(), base || {});
  if (!raw || typeof raw !== "object") return state;
  var speed = clampSpeed(raw.speed);
  if (speed !== null) state.speed = speed;
  if (typeof raw.autoSkip === "boolean") state.autoSkip = raw.autoSkip;
  if (typeof raw.floatingPanel === "boolean") state.floatingPanel = raw.floatingPanel;
  var interval = clampSkipInterval(raw.skipIntervalMs);
  if (interval !== null) state.skipIntervalMs = interval;
  var x = clampPercent(raw.skipX);
  if (x !== null) state.skipX = x;
  var y = clampPercent(raw.skipY);
  if (y !== null) state.skipY = y;
  return state;
}

function isDefaultSiteState(state) {
  var def = defaultSiteState();
  return Object.keys(def).every(function(k) { return state[k] === def[k]; });
}

function needsInjection(state) {
  return state.speed !== 1 || state.autoSkip || state.floatingPanel;
}

function skipOptions(state) {
  return { intervalMs: state.skipIntervalMs, x: state.skipX, y: state.skipY };
}

async function getSiteState(siteKey) {
  if (!siteKey) return defaultSiteState();
  var key = storageKeyForSite(siteKey);
  var data = await chrome.storage.local.get([key]);
  return normalizeSiteState(data[key]);
}

async function setSiteState(siteKey, patch) {
  var current = await getSiteState(siteKey);
  var next = normalizeSiteState(patch, current);
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

function normalizePresets(list) {
  var seen = {};
  var out = [];
  (Array.isArray(list) ? list : []).forEach(function(v) {
    if (typeof v !== "number" || !isFinite(v) || v < MIN_SPEED || v > MAX_SPEED) return;
    var rounded = Math.round(v * 100) / 100;
    if (seen[rounded]) return;
    seen[rounded] = true;
    out.push(rounded);
  });
  out.sort(function(x, y) { return x - y; });
  out = out.slice(0, MAX_PRESETS);
  return out.length ? out : DEFAULT_PRESETS.slice();
}

// Aceita "1, 1.5 2;3" (vírgula separa valores; decimal usa ponto). Tokens
// inválidos são devolvidos para a UI avisar o usuário.
function parsePresets(text) {
  var tokens = String(text || "").split(/[\s,;]+/).filter(Boolean);
  var values = [];
  var invalid = [];
  tokens.forEach(function(tok) {
    var n = Number(tok);
    if (!isFinite(n) || n < MIN_SPEED || n > MAX_SPEED) invalid.push(tok);
    else values.push(n);
  });
  return { presets: values.length ? normalizePresets(values) : [], invalid: invalid };
}

async function getSettings() {
  var data = await chrome.storage.local.get([SETTINGS_KEY]);
  var raw = data[SETTINGS_KEY] || {};
  return { presets: normalizePresets(raw.presets) };
}

async function setPresets(list) {
  var presets = normalizePresets(list);
  var obj = {};
  obj[SETTINGS_KEY] = { presets: presets };
  await chrome.storage.local.set(obj);
  return presets;
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
  if (!allFrames && !needsInjection(state)) return summarizeInjection([]);

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
    await runScript({ target: target, world: "MAIN", func: injectAutoSkip, args: [state.autoSkip, skipOptions(state)] });
  }

  if (isTop) {
    if (allFrames || state.speed !== 1) {
      await runScript({ target: topTarget, world: "MAIN", func: injectHUD, args: [state.speed] });
    }
    if (state.floatingPanel) {
      var settings = await getSettings();
      await runScript({ target: topTarget, files: ["content-bridge.js"] });
      await runScript({
        target: topTarget, world: "MAIN",
        func: injectFloatingControl, args: [true, state.speed, state.autoSkip, settings.presets]
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

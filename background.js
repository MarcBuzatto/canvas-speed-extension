/**
 * Canvas Speed Controller Plus - Background Service Worker
 * Re-injeta o estado salvo do site em todo frame novo daquele site
 * (o iframe do jogo é recriado ao navegar e perderia a aceleração).
 */

importScripts("inject.js", "core.js");

chrome.runtime.onInstalled.addListener(function() {
  // Até a v3.4 o estado era global; descarta para não acelerar sites aleatórios.
  chrome.storage.local.remove(LEGACY_STORAGE_KEYS);
});

async function siteKeyForFrame(tabId, frameId, frameUrl) {
  if (frameId === 0) return siteKeyFromUrl(frameUrl);
  try {
    var tab = await chrome.tabs.get(tabId);
    return siteKeyFromUrl(tab.url);
  } catch (e) {
    return null;
  }
}

chrome.webNavigation.onCommitted.addListener(async function(details) {
  if (!/^https?:/.test(details.url || "")) return;
  var siteKey = await siteKeyForFrame(details.tabId, details.frameId, details.url);
  if (!siteKey) return;
  var state = await getSiteState(siteKey);
  if (isDefaultSiteState(state)) return;
  await applySiteState(details.tabId, state, details.frameId);
});

// Rede de segurança: frames criados sem navegação "commitada" própria (ex.: about:blank + document.write).
chrome.tabs.onUpdated.addListener(async function(tabId, changeInfo, tab) {
  if (changeInfo.status !== "complete") return;
  var siteKey = siteKeyFromUrl(tab.url);
  if (!siteKey) return;
  var state = await getSiteState(siteKey);
  if (isDefaultSiteState(state)) return;
  await applySiteState(tabId, state);
});

async function handlePanelMessage(msg, tabId, siteKey) {
  var state = await getSiteState(siteKey);
  // Qualquer script da página consegue postar para a bridge; só aceitamos
  // comandos quando o usuário de fato ligou o painel neste site.
  if (!state.floatingPanel) return { ok: false, error: "painel desativado" };

  if (msg.action === "speedChangeFromPanel") {
    var speed = clampSpeed(msg.speed);
    if (speed === null) return { ok: false, error: "velocidade inválida" };
    state = await setSiteState(siteKey, { speed: speed });
    var summary = await applySiteState(tabId, state);
    return { ok: summary.ok > 0, frames: summary.ok, engines: summary.engines, error: summary.firstError };
  }

  if (msg.action === "autoSkipFromPanel" && typeof msg.enabled === "boolean") {
    state = await setSiteState(siteKey, { autoSkip: msg.enabled });
    await applySiteState(tabId, state);
    return { ok: true };
  }

  if (msg.action === "panelClosedByUser") {
    // Fechar o painel pelo × é um reset total do site (velocidade, auto-skip, HUD).
    state = await setSiteState(siteKey, defaultSiteState());
    await applySiteState(tabId, state);
    return { ok: true, reset: true };
  }

  return { ok: false, error: "ação desconhecida" };
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (!msg || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return;
  var siteKey = siteKeyFromUrl(sender.tab.url);
  if (!siteKey) return;
  handlePanelMessage(msg, sender.tab.id, siteKey).then(sendResponse, function(err) {
    sendResponse({ ok: false, error: (err && err.message) || "erro" });
  });
  return true;
});

/**
 * Canvas Speed Controller Plus - Content Script Bridge (world ISOLATED).
 * Ponte entre o painel flutuante (world MAIN) e o background.
 * Pode ser carregado duas vezes (content_scripts + executeScript de fallback);
 * a guarda evita registrar o listener em dobro, o que duplicava cada comando.
 */
(function() {
  if (window.__CSP_BRIDGE_READY__) return;
  window.__CSP_BRIDGE_READY__ = true;

  function sendStatus(text, isError) {
    try {
      window.postMessage({ __csp_source: "status", text: text, error: !!isError }, "*");
    } catch(e) {}
  }

  function forward(message, okText) {
    try {
      chrome.runtime.sendMessage(message, function(response) {
        if (chrome.runtime.lastError) {
          sendStatus("X " + chrome.runtime.lastError.message.substring(0, 30), true);
          return;
        }
        if (!response || !response.ok) {
          sendStatus("X " + ((response && response.error) || "sem resposta").substring(0, 30), true);
          return;
        }
        sendStatus(okText(response), false);
      });
    } catch(err) {
      sendStatus("X " + err.message.substring(0, 30), true);
    }
  }

  window.addEventListener("message", function(event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || typeof data !== "object" || data.__csp_source !== "panel") return;

    if (data.action === "speedChange" && typeof data.speed === "number") {
      forward({ action: "speedChangeFromPanel", speed: data.speed }, function(r) {
        return r.frames + " frame(s) " + (r.engines || "sem engine");
      });
    } else if (data.action === "autoSkipToggle" && typeof data.enabled === "boolean") {
      forward({ action: "autoSkipFromPanel", enabled: data.enabled }, function() {
        return "auto-skip " + (data.enabled ? "ativo" : "off");
      });
    } else if (data.action === "panelClosed") {
      try { chrome.runtime.sendMessage({ action: "panelClosedByUser" }); } catch(err) {}
    }
  });
})();

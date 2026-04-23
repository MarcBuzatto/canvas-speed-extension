/**
 * Canvas Speed Controller Plus - Content Script Bridge
 * Roda em world: ISOLATED. Ponte entre painel (world: MAIN) e background.
 */

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

  // Evento: usuário clicou num preset
  if (data.action === "speedChange" && typeof data.speed === "number") {
    sendStatus("[1/3] bridge OK, enviando...");
    try {
      chrome.runtime.sendMessage({
        action: "speedChangeFromPanel",
        speed: data.speed
      }, function(response) {
        if (chrome.runtime.lastError) {
          sendStatus("X bridge→bg: " + chrome.runtime.lastError.message.substring(0, 30), true);
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

  // Evento: usuário fechou painel
  if (data.action === "panelClosed") {
    try {
      chrome.runtime.sendMessage({ action: "panelClosedByUser" });
    } catch(err) {}
  }
});

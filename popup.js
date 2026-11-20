/**
 * Canvas Speed Controller Plus - Popup
 * Desenvolvido por markizin. Todos os direitos reservados.
 * Funções injetadas vêm de inject.js; estado/aplicação vêm de core.js.
 */

var slider = document.getElementById("speedSlider");
var display = document.getElementById("speedDisplay");
var statusEl = document.getElementById("status");
var siteLabel = document.getElementById("siteLabel");
var presetBtns = document.querySelectorAll(".preset-btn");
var resetBtn = document.getElementById("resetBtn");
var skipToggle = document.getElementById("skipToggle");
var skipStatus = document.getElementById("skipStatus");
var floatingToggle = document.getElementById("floatingToggle");
var floatingStatus = document.getElementById("floatingStatus");

var COLOR_ACTIVE = "#e94560";
var COLOR_OK = "#4ecca3";
var COLOR_ERROR = "#ff6b6b";
var COLOR_OFF = "#888";

var currentTab = null;
var siteKey = null;

function setStatus(text, color) {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function renderState(state) {
  display.textContent = formatSpeedLabel(state.speed);
  slider.value = state.speed;
  presetBtns.forEach(function(btn) {
    var active = parseFloat(btn.dataset.speed) === state.speed;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  skipToggle.checked = state.autoSkip;
  skipStatus.textContent = state.autoSkip ? "Auto-skip ativo" : "Desativado";
  skipStatus.style.color = state.autoSkip ? COLOR_ACTIVE : COLOR_OFF;
  floatingToggle.checked = state.floatingPanel;
  floatingStatus.textContent = state.floatingPanel ? "Ativo" : "Desativado";
  floatingStatus.style.color = state.floatingPanel ? COLOR_ACTIVE : COLOR_OFF;
}

function renderInjectionStatus(state, summary) {
  if (summary.ok > 0) {
    if (state.speed === 1) return setStatus("Normal", COLOR_OK);
    var engines = summary.engines ? " [" + summary.engines.substring(0, 40) + "]" : "";
    return setStatus(summary.ok + " frame(s) " + formatSpeedLabel(state.speed) + engines, COLOR_ACTIVE);
  }
  if (summary.firstError) return setStatus("Erro: " + summary.firstError.substring(0, 60), COLOR_ERROR);
  setStatus("Nenhum frame respondeu", COLOR_ERROR);
}

function setControlsDisabled(disabled) {
  [slider, resetBtn, skipToggle, floatingToggle].forEach(function(el) { el.disabled = disabled; });
  presetBtns.forEach(function(btn) { btn.disabled = disabled; });
}

async function updateSite(patch) {
  if (!siteKey) return;
  setStatus("Injetando...", COLOR_OK);
  var state = await setSiteState(siteKey, patch);
  renderState(state);
  var summary = await applySiteState(currentTab.id, state);
  renderInjectionStatus(state, summary);
}

async function initPopup() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0] || null;
  siteKey = currentTab ? siteKeyFromUrl(currentTab.url) : null;

  if (!siteKey) {
    renderState(defaultSiteState());
    setControlsDisabled(true);
    siteLabel.textContent = "Página não suportada";
    setStatus("Abra um site http(s) para usar", COLOR_OFF);
    return;
  }

  siteLabel.textContent = siteKey;
  var state = await getSiteState(siteKey);
  renderState(state);

  // Reaplica ao abrir: o iframe do jogo pode ter sido recriado e perdido a injeção.
  if (!isDefaultSiteState(state)) {
    var summary = await applySiteState(currentTab.id, state);
    renderInjectionStatus(state, summary);
  } else {
    setStatus("Pronto - escolha uma velocidade", COLOR_OK);
  }

  // Mantém o popup em sincronia com mudanças feitas pelo painel flutuante.
  chrome.storage.onChanged.addListener(function(changes, area) {
    var key = storageKeyForSite(siteKey);
    if (area !== "local" || !changes[key]) return;
    renderState(normalizeSiteState(changes[key].newValue));
  });
}

function setupTabs() {
  var tabBtns = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");
  tabBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var target = btn.getAttribute("data-tab");
      tabBtns.forEach(function(b) {
        var active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      tabPanels.forEach(function(p) {
        p.classList.toggle("active", p.id === "tab-" + target);
      });
    });
  });
}

setupTabs();
slider.addEventListener("input", function() { display.textContent = formatSpeedLabel(parseFloat(slider.value)); });
slider.addEventListener("change", function() { updateSite({ speed: parseFloat(slider.value) }); });
presetBtns.forEach(function(btn) {
  btn.addEventListener("click", function() { updateSite({ speed: parseFloat(btn.dataset.speed) }); });
});
resetBtn.addEventListener("click", function() { updateSite({ speed: 1 }); });
skipToggle.addEventListener("change", function() { updateSite({ autoSkip: skipToggle.checked }); });
floatingToggle.addEventListener("change", function() { updateSite({ floatingPanel: floatingToggle.checked }); });

initPopup().catch(function(e) {
  setStatus("Erro: " + e.message, COLOR_ERROR);
});

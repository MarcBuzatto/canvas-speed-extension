/**
 * Canvas Speed Controller Plus - Popup
 * Desenvolvido por markizin. Todos os direitos reservados.
 * Funções injetadas vêm de inject.js; estado/aplicação vêm de core.js.
 */

var slider = document.getElementById("speedSlider");
var display = document.getElementById("speedDisplay");
var statusEl = document.getElementById("status");
var siteLabel = document.getElementById("siteLabel");
var presetsEl = document.getElementById("presets");
var resetBtn = document.getElementById("resetBtn");
var customSpeedForm = document.getElementById("customSpeedForm");
var customSpeedInput = document.getElementById("customSpeed");
var skipToggle = document.getElementById("skipToggle");
var skipStatus = document.getElementById("skipStatus");
var skipIntervalInput = document.getElementById("skipInterval");
var skipXInput = document.getElementById("skipX");
var skipYInput = document.getElementById("skipY");
var floatingToggle = document.getElementById("floatingToggle");
var floatingStatus = document.getElementById("floatingStatus");
var presetsForm = document.getElementById("presetsForm");
var presetsInput = document.getElementById("presetsInput");
var presetsDefaultBtn = document.getElementById("presetsDefault");
var presetsStatus = document.getElementById("presetsStatus");

var COLOR_ACTIVE = "#e94560";
var COLOR_OK = "#4ecca3";
var COLOR_ERROR = "#ff6b6b";
var COLOR_OFF = "#888";

var currentTab = null;
var siteKey = null;
var currentState = defaultSiteState();
var currentPresets = DEFAULT_PRESETS.slice();

function setStatus(text, color) {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function renderPresets(presets) {
  currentPresets = presets;
  presetsInput.value = presets.join(", ");
  presetsEl.textContent = "";
  presets.forEach(function(p) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.dataset.speed = String(p);
    btn.textContent = p + "x";
    btn.disabled = !siteKey;
    btn.addEventListener("click", function() { updateSite({ speed: p }); });
    presetsEl.appendChild(btn);
  });
  renderState(currentState);
}

function setNumberInput(input, value) {
  if (document.activeElement !== input) input.value = value;
  input.removeAttribute("aria-invalid");
}

function renderState(state) {
  currentState = state;
  display.textContent = formatSpeedLabel(state.speed);
  slider.value = state.speed;
  presetsEl.querySelectorAll(".preset-btn").forEach(function(btn) {
    var active = parseFloat(btn.dataset.speed) === state.speed;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  skipToggle.checked = state.autoSkip;
  skipStatus.textContent = state.autoSkip ? "Auto-skip ativo" : "Desativado";
  skipStatus.style.color = state.autoSkip ? COLOR_ACTIVE : COLOR_OFF;
  setNumberInput(skipIntervalInput, state.skipIntervalMs);
  setNumberInput(skipXInput, state.skipX);
  setNumberInput(skipYInput, state.skipY);
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
  [slider, resetBtn, customSpeedInput, skipToggle, skipIntervalInput, skipXInput, skipYInput, floatingToggle]
    .forEach(function(el) { el.disabled = disabled; });
  customSpeedForm.querySelector("button").disabled = disabled;
  presetsEl.querySelectorAll("button").forEach(function(btn) { btn.disabled = disabled; });
}

async function updateSite(patch) {
  if (!siteKey) return;
  setStatus("Injetando...", COLOR_OK);
  var state = await setSiteState(siteKey, patch);
  renderState(state);
  var summary = await applySiteState(currentTab.id, state);
  renderInjectionStatus(state, summary);
}

function bindNumberField(input, clamp, field) {
  input.addEventListener("change", function() {
    var value = clamp(input.value === "" ? NaN : Number(input.value));
    if (value === null) {
      input.setAttribute("aria-invalid", "true");
      return;
    }
    input.value = value;
    var patch = {};
    patch[field] = value;
    updateSite(patch);
  });
}

async function savePresets(list) {
  var presets = await setPresets(list);
  renderPresets(presets);
  // Painel flutuante aberto precisa redesenhar os botões.
  if (siteKey && currentState.floatingPanel) await applySiteState(currentTab.id, currentState);
  return presets;
}

async function initPopup() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0] || null;
  siteKey = currentTab ? siteKeyFromUrl(currentTab.url) : null;

  var settings = await getSettings();
  renderPresets(settings.presets);

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
  if (needsInjection(state)) {
    var summary = await applySiteState(currentTab.id, state);
    renderInjectionStatus(state, summary);
  } else {
    setStatus("Pronto - escolha uma velocidade", COLOR_OK);
  }

  // Mantém o popup em sincronia com mudanças feitas pelo painel flutuante.
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== "local") return;
    var key = storageKeyForSite(siteKey);
    if (changes[key]) renderState(normalizeSiteState(changes[key].newValue));
    if (changes[SETTINGS_KEY]) renderPresets(normalizePresets((changes[SETTINGS_KEY].newValue || {}).presets));
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
resetBtn.addEventListener("click", function() { updateSite({ speed: 1 }); });

customSpeedForm.addEventListener("submit", function(e) {
  e.preventDefault();
  var speed = clampSpeed(Number(customSpeedInput.value));
  if (speed === null) {
    customSpeedInput.setAttribute("aria-invalid", "true");
    return;
  }
  customSpeedInput.removeAttribute("aria-invalid");
  customSpeedInput.value = "";
  updateSite({ speed: speed });
});

skipToggle.addEventListener("change", function() { updateSite({ autoSkip: skipToggle.checked }); });
bindNumberField(skipIntervalInput, clampSkipInterval, "skipIntervalMs");
bindNumberField(skipXInput, clampPercent, "skipX");
bindNumberField(skipYInput, clampPercent, "skipY");
floatingToggle.addEventListener("change", function() { updateSite({ floatingPanel: floatingToggle.checked }); });

presetsForm.addEventListener("submit", function(e) {
  e.preventDefault();
  var parsed = parsePresets(presetsInput.value);
  if (parsed.invalid.length || !parsed.presets.length) {
    presetsInput.setAttribute("aria-invalid", "true");
    presetsStatus.textContent = parsed.invalid.length
      ? "Inválido: " + parsed.invalid.join(", ")
      : "Informe ao menos um valor";
    presetsStatus.style.color = COLOR_ERROR;
    return;
  }
  presetsInput.removeAttribute("aria-invalid");
  savePresets(parsed.presets).then(function(saved) {
    presetsStatus.textContent = "Salvo (" + saved.length + " presets)";
    presetsStatus.style.color = COLOR_OK;
  });
});

presetsDefaultBtn.addEventListener("click", function() {
  presetsInput.removeAttribute("aria-invalid");
  savePresets(DEFAULT_PRESETS.slice()).then(function() {
    presetsStatus.textContent = "Presets padrão restaurados";
    presetsStatus.style.color = COLOR_OK;
  });
});

initPopup().catch(function(e) {
  setStatus("Erro: " + e.message, COLOR_ERROR);
});

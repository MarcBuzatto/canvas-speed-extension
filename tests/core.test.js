const test = require("node:test");
const assert = require("node:assert/strict");
const { createChromeMock, loadCore } = require("./helpers");

test("clampSpeed rejeita valores inválidos e limita a faixa", () => {
  const core = loadCore(createChromeMock().chrome);
  assert.equal(core.clampSpeed(NaN), null);
  assert.equal(core.clampSpeed(Infinity), null);
  assert.equal(core.clampSpeed("2"), null);
  assert.equal(core.clampSpeed(undefined), null);
  assert.equal(core.clampSpeed(-3), core.MIN_SPEED);
  assert.equal(core.clampSpeed(0), core.MIN_SPEED);
  assert.equal(core.clampSpeed(999), core.MAX_SPEED);
  assert.equal(core.clampSpeed(2.5), 2.5);
});

test("siteKeyFromUrl só aceita http(s) e separa por host:porta", () => {
  const core = loadCore(createChromeMock().chrome);
  assert.equal(core.siteKeyFromUrl("https://jogo.com/play?x=1"), "jogo.com");
  assert.equal(core.siteKeyFromUrl("http://localhost:8080/"), "localhost:8080");
  assert.equal(core.siteKeyFromUrl("chrome://extensions"), null);
  assert.equal(core.siteKeyFromUrl("file:///C:/a.html"), null);
  assert.equal(core.siteKeyFromUrl("lixo"), null);
  assert.equal(core.siteKeyFromUrl(undefined), null);
});

test("estado é salvo por site, sem vazar para outros sites", async () => {
  const { chrome } = createChromeMock();
  const core = loadCore(chrome);
  await core.setSiteState("jogo.com", { speed: 3 });
  assert.equal((await core.getSiteState("jogo.com")).speed, 3);
  assert.equal((await core.getSiteState("banco.com")).speed, 1);
});

test("estado padrão remove a entrada do storage", async () => {
  const { chrome, store } = createChromeMock();
  const core = loadCore(chrome);
  await core.setSiteState("jogo.com", { speed: 3, autoSkip: true });
  await core.setSiteState("jogo.com", { speed: 1, autoSkip: false });
  assert.deepEqual(Object.keys(store), []);
});

test("setSiteState ignora velocidade inválida e mantém a anterior", async () => {
  const { chrome } = createChromeMock();
  const core = loadCore(chrome);
  await core.setSiteState("jogo.com", { speed: 2 });
  const state = await core.setSiteState("jogo.com", { speed: NaN });
  assert.equal(state.speed, 2);
});

test("summarizeInjection conta frames e extrai engines", () => {
  const core = loadCore(createChromeMock().chrome);
  const summary = core.summarizeInjection([
    { result: "OK:inject:2:engines=PIXI.Ticker" },
    { result: "OK:update:2:engines=" },
    { result: "ERRO:boom" },
    { result: null },
  ]);
  assert.equal(summary.ok, 2);
  assert.equal(summary.errors, 1);
  assert.equal(summary.engines, "PIXI.Ticker");
  assert.equal(summary.firstError, "ERRO:boom");
});

test("applySiteState em frame novo com estado padrão não injeta nada", async () => {
  const { chrome, calls } = createChromeMock();
  const core = loadCore(chrome);
  await core.applySiteState(7, core.defaultSiteState(), 3);
  assert.equal(calls.length, 0);
});

test("applySiteState em iframe injeta só speed/auto-skip, sem HUD nem painel", async () => {
  const { chrome, calls } = createChromeMock();
  const core = loadCore(chrome);
  await core.applySiteState(7, { speed: 2, autoSkip: true, floatingPanel: true }, 3);
  const names = calls.map((c) => c.func && c.func.name);
  assert.deepEqual(names, ["injectCanvasSpeed", "injectAutoSkip"]);
  assert.ok(calls.every((c) => c.target.frameIds[0] === 3));
  assert.ok(calls[0].injectImmediately, "speed hack deve rodar o quanto antes");
});

test("applySiteState em todos os frames com padrão reseta tudo", async () => {
  const { chrome, calls } = createChromeMock();
  const core = loadCore(chrome);
  await core.applySiteState(7, core.defaultSiteState());
  const byName = Object.fromEntries(calls.filter((c) => c.func).map((c) => [c.func.name, [...c.args]]));
  assert.deepEqual(byName.injectCanvasSpeed, [1, "clock"]);
  assert.equal(byName.injectAutoSkip[0], false);
  assert.deepEqual(byName.injectHUD, [1]);
  assert.equal(byName.injectFloatingControl[0], false);
});

test("applySiteState com painel ativo injeta a bridge antes do painel", async () => {
  const { chrome, calls } = createChromeMock();
  const core = loadCore(chrome);
  await core.applySiteState(7, { speed: 2, autoSkip: false, floatingPanel: true });
  const bridgeIdx = calls.findIndex((c) => c.files && c.files[0] === "content-bridge.js");
  const panelIdx = calls.findIndex((c) => c.func && c.func.name === "injectFloatingControl");
  assert.ok(bridgeIdx >= 0 && panelIdx > bridgeIdx);
  assert.deepEqual([...calls[panelIdx].args].slice(0, 3), [true, 2, false]);
});

test("applySiteState continua mesmo se uma injeção falhar", async () => {
  const { chrome, calls } = createChromeMock();
  const original = chrome.scripting.executeScript;
  chrome.scripting.executeScript = async (opts) => {
    if (opts.func && opts.func.name === "injectCanvasSpeed") throw new Error("frame removido");
    return original(opts);
  };
  const core = loadCore(chrome);
  const summary = await core.applySiteState(7, { speed: 2, autoSkip: true, floatingPanel: false });
  assert.ok(calls.some((c) => c.func && c.func.name === "injectAutoSkip"));
  assert.equal(summary.ok, 0);
  assert.match(summary.firstError, /frame removido/);
});

test("parsePresets aceita vírgula/espaço, ordena, remove duplicatas e limita a 8", () => {
  const core = loadCore(createChromeMock().chrome);
  const r = core.parsePresets("3, 1 2,2 ; 10 1.5");
  assert.deepEqual([...r.presets], [1, 1.5, 2, 3, 10]);
  assert.deepEqual([...r.invalid], []);
  const many = core.parsePresets("1 2 3 4 5 6 7 8 9 10");
  assert.equal(many.presets.length, core.MAX_PRESETS);
});

test("parsePresets aponta tokens inválidos e fora da faixa", () => {
  const core = loadCore(createChromeMock().chrome);
  const r = core.parsePresets("2, abc, 0, 99");
  assert.deepEqual([...r.presets], [2]);
  assert.deepEqual([...r.invalid], ["abc", "0", "99"]);
});

test("presets inválidos ou vazios caem no padrão", async () => {
  const { chrome } = createChromeMock();
  const core = loadCore(chrome);
  assert.deepEqual([...(await core.getSettings()).presets], [...core.DEFAULT_PRESETS]);
  await core.setPresets([]);
  assert.deepEqual([...(await core.getSettings()).presets], [...core.DEFAULT_PRESETS]);
  await core.setPresets([4, 1.25]);
  assert.deepEqual([...(await core.getSettings()).presets], [1.25, 4]);
});

test("config de auto-skip é salva por site e validada", async () => {
  const { chrome } = createChromeMock();
  const core = loadCore(chrome);
  let s = await core.setSiteState("jogo.com", { skipIntervalMs: 1200, skipX: 80, skipY: 10 });
  assert.equal(s.skipIntervalMs, 1200);
  assert.equal(s.skipX, 80);
  assert.equal(s.skipY, 10);
  s = await core.setSiteState("jogo.com", { skipIntervalMs: 5, skipX: 150, skipY: NaN });
  assert.equal(s.skipIntervalMs, core.MIN_SKIP_INTERVAL);
  assert.equal(s.skipX, 100);
  assert.equal(s.skipY, 10);
  assert.equal((await core.getSiteState("outro.com")).skipIntervalMs, 500);
});

test("config de auto-skip personalizada não é apagada mesmo com tudo desligado", async () => {
  const { chrome, store } = createChromeMock();
  const core = loadCore(chrome);
  await core.setSiteState("jogo.com", { skipX: 30 });
  assert.ok("site:jogo.com" in store);
  assert.equal(core.needsInjection(await core.getSiteState("jogo.com")), false);
});

test("applySiteState passa intervalo/ponto ao auto-skip e presets ao painel", async () => {
  const { chrome, calls } = createChromeMock();
  const core = loadCore(chrome);
  await core.setPresets([1, 4]);
  const state = Object.assign(core.defaultSiteState(), {
    speed: 2, autoSkip: true, floatingPanel: true, skipIntervalMs: 900, skipX: 20, skipY: 70,
  });
  await core.applySiteState(7, state);
  const skip = calls.find((c) => c.func && c.func.name === "injectAutoSkip");
  assert.deepEqual({ ...skip.args[1] }, { intervalMs: 900, x: 20, y: 70 });
  const panel = calls.find((c) => c.func && c.func.name === "injectFloatingControl");
  assert.deepEqual([...panel.args[3]], [1, 4]);
});

test("speedMode por site: padrão relógio, aceita engine, rejeita lixo", async () => {
  const { chrome } = createChromeMock();
  const core = loadCore(chrome);
  assert.equal(core.defaultSiteState().speedMode, "clock");
  let state = await core.setSiteState("jogo.com", { speedMode: "engine" });
  assert.equal(state.speedMode, "engine");
  state = await core.setSiteState("jogo.com", { speedMode: "turbo" });
  assert.equal(state.speedMode, "engine");
  assert.equal((await core.getSiteState("outro.com")).speedMode, "clock");
});

test("applySiteState repassa o modo de aceleração para o inject", async () => {
  const { chrome, calls } = createChromeMock();
  const core = loadCore(chrome);
  const state = Object.assign(core.defaultSiteState(), { speed: 3, speedMode: "engine" });
  await core.applySiteState(7, state);
  const speedCall = calls.find((c) => c.func && c.func.name === "injectCanvasSpeed");
  assert.deepEqual(Array.from(speedCall.args), [3, "engine"]);
});

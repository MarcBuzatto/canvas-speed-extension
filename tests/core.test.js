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
  assert.deepEqual(byName.injectCanvasSpeed, [1]);
  assert.deepEqual(byName.injectAutoSkip, [false]);
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
  assert.deepEqual([...calls[panelIdx].args], [true, 2, false]);
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

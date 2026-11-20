const test = require("node:test");
const assert = require("node:assert/strict");
const { createFakePage } = require("./helpers");

test("acelera performance.now e Date.now na velocidade escolhida", () => {
  const page = createFakePage();
  page.injectCanvasSpeed(2);
  const p0 = page.performance.now();
  const d0 = page.Date.now();
  page.advance(100);
  assert.equal(page.performance.now() - p0, 200);
  assert.equal(page.Date.now() - d0, 200);
});

test("câmera lenta (< 1x) realmente desacelera", () => {
  const page = createFakePage();
  page.injectCanvasSpeed(0.5);
  const p0 = page.performance.now();
  page.advance(100);
  assert.equal(page.performance.now() - p0, 50);
});

test("voltar para 1x não faz performance.now andar para trás", () => {
  const page = createFakePage();
  page.injectCanvasSpeed(3);
  page.advance(1000);
  const before = page.performance.now();
  page.injectCanvasSpeed(1);
  const after = page.performance.now();
  assert.ok(after >= before, `relógio voltou: ${before} -> ${after}`);
  page.advance(100);
  assert.equal(page.performance.now() - after, 100);
});

test("timestamp do requestAnimationFrame também não volta ao resetar", () => {
  const page = createFakePage();
  page.injectCanvasSpeed(4);
  let ts = [];
  page.requestAnimationFrame((t) => ts.push(t));
  page.advance(500);
  page.rafCallbacks.shift()(page.clock.perf);
  page.injectCanvasSpeed(1);
  page.requestAnimationFrame((t) => ts.push(t));
  page.rafCallbacks.shift()(page.clock.perf);
  assert.ok(ts[1] >= ts[0], `rAF voltou: ${ts[0]} -> ${ts[1]}`);
});

test("ao resetar, Date.now volta ao relógio real (wall clock)", () => {
  const page = createFakePage();
  page.injectCanvasSpeed(5);
  page.advance(1000);
  page.injectCanvasSpeed(1);
  assert.equal(page.Date.now(), page.clock.date);
});

test("trocar de velocidade mantém o relógio contínuo", () => {
  const page = createFakePage();
  page.injectCanvasSpeed(2);
  page.advance(100);
  const mid = page.performance.now();
  page.injectCanvasSpeed(4);
  assert.equal(page.performance.now(), mid);
  page.advance(100);
  assert.equal(page.performance.now() - mid, 400);
});

test("setTimeout escala o delay nos dois sentidos", () => {
  const page = createFakePage();
  page.injectCanvasSpeed(2);
  page.setTimeout(() => {}, 1000);
  page.injectCanvasSpeed(0.5);
  page.setTimeout(() => {}, 1000);
  const delays = page.timers.filter((t) => t.kind === "timeout").map((t) => t.delay);
  assert.deepEqual(delays, [500, 2000]);
});

test("injetar em 1x não sobrescreve timeScale do jogo", () => {
  const page = createFakePage();
  page.gameClock = { timeScale: 0 };
  page.injectCanvasSpeed(1);
  assert.equal(page.gameClock.timeScale, 0);
});

test("reset só restaura timeScale de objetos que a extensão alterou", () => {
  const page = createFakePage();
  page.spine = { timeScale: 1 };
  page.injectCanvasSpeed(2, "engine");
  assert.equal(page.spine.timeScale, 2);
  page.lateObject = { timeScale: 0.25 };
  page.__CANVAS_SPEED__.setSpeed(1, "engine");
  assert.equal(page.spine.timeScale, 1);
  assert.equal(page.lateObject.timeScale, 0.25);
});

test("auto-skip usa o setInterval original mesmo com speed hack ativo", () => {
  const page = createFakePage();
  page.injectCanvasSpeed(10);
  page.injectAutoSkip(true);
  const skip = page.timers.find((t) => t.kind === "interval" && t.delay === 500);
  assert.ok(skip, "intervalo de 500ms real não encontrado (foi acelerado)");
});

test("formatSpeedLabel mantém casas decimais consistentes", () => {
  const page = createFakePage();
  assert.equal(page.formatSpeedLabel(2), "2.0x");
  assert.equal(page.formatSpeedLabel(1.5), "1.5x");
  assert.equal(page.formatSpeedLabel(0.5), "0.5x");
});

function fakeCanvas() {
  const events = [];
  return {
    events,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }),
    dispatchEvent: (e) => events.push(e),
  };
}

test("auto-skip clica no ponto configurado (em % do canvas)", () => {
  const page = createFakePage();
  const canvas = fakeCanvas();
  page.document.querySelector = () => canvas;
  page.injectAutoSkip(true, { intervalMs: 500, x: 25, y: 75 });
  page.timers.find((t) => t.kind === "interval").fn();
  const click = canvas.events.find((e) => e.type === "click");
  assert.equal(click.init.clientX, 200);
  assert.equal(click.init.clientY, 200);
});

test("auto-skip usa o intervalo configurado e reagenda ao mudar", () => {
  const page = createFakePage();
  page.injectAutoSkip(true, { intervalMs: 1500, x: 50, y: 50 });
  page.injectAutoSkip(true, { intervalMs: 300, x: 50, y: 50 });
  const intervals = page.timers.filter((t) => t.kind === "interval").map((t) => t.delay);
  assert.deepEqual(intervals, [1500, 300]);
  assert.equal(page.cleared.length, 1);
});

test("desligar auto-skip cancela o intervalo", () => {
  const page = createFakePage();
  page.injectAutoSkip(true, { intervalMs: 500, x: 50, y: 50 });
  page.injectAutoSkip(false);
  assert.equal(page.cleared.length, 1);
  assert.equal(page.__AUTO_SKIP__.enabled, false);
});

test("auto-skip substitui instância legada (v3.4) sem duplicar cliques", () => {
  const page = createFakePage();
  page.__AUTO_SKIP__ = { enabled: true, intervalId: 42 };
  page.injectAutoSkip(true, { intervalMs: 500, x: 50, y: 50 });
  assert.deepEqual(page.cleared, [42]);
  assert.equal(typeof page.__AUTO_SKIP__.click, "function");
});

function fakePixi(page) {
  const ticker = { speed: 1 };
  page.PIXI = { Ticker: { shared: ticker } };
  return ticker;
}

test("modo relógio não multiplica de novo pelo speed da engine (sem 4x virar 16x)", () => {
  const page = createFakePage();
  const ticker = fakePixi(page);
  page.injectCanvasSpeed(4);
  const p0 = page.performance.now();
  page.advance(100);
  assert.equal((page.performance.now() - p0) * ticker.speed, 400);
});

test("modo engine acelera só via engine e mantém o relógio real", () => {
  const page = createFakePage();
  const ticker = fakePixi(page);
  page.injectCanvasSpeed(4, "engine");
  assert.equal(ticker.speed, 4);
  const p0 = page.performance.now();
  const d0 = page.Date.now();
  page.advance(100);
  assert.equal(page.performance.now() - p0, 100);
  assert.equal(page.Date.now() - d0, 100);
  page.setTimeout(() => {}, 1000);
  assert.equal(page.timers.at(-1).delay, 1000);
});

test("trocar de engine para relógio restaura a engine e acelera o relógio", () => {
  const page = createFakePage();
  const ticker = fakePixi(page);
  page.injectCanvasSpeed(3, "engine");
  page.injectCanvasSpeed(3, "clock");
  assert.equal(ticker.speed, 1);
  const p0 = page.performance.now();
  page.advance(100);
  assert.equal(page.performance.now() - p0, 300);
});

test("trocar de relógio para engine não faz performance.now voltar e zera o Date", () => {
  const page = createFakePage();
  const ticker = fakePixi(page);
  page.injectCanvasSpeed(5);
  page.advance(1000);
  const before = page.performance.now();
  page.injectCanvasSpeed(5, "engine");
  assert.ok(page.performance.now() >= before);
  assert.equal(page.Date.now(), page.clock.date);
  assert.equal(ticker.speed, 5);
});

test("modo inválido cai no padrão (relógio)", () => {
  const page = createFakePage();
  const ticker = fakePixi(page);
  page.injectCanvasSpeed(2, "turbo");
  assert.equal(ticker.speed, 1);
  const p0 = page.performance.now();
  page.advance(50);
  assert.equal(page.performance.now() - p0, 100);
});

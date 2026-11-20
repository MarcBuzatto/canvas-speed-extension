const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

function readSource(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

// Simula o "world MAIN" de uma página: relógio controlável + timers/rAF gravados.
function createFakePage() {
  const clock = { perf: 1000, date: 1_700_000_000_000 };
  const timers = [];
  const rafCallbacks = [];
  const cleared = [];

  class FakeEvent {
    constructor(type, init) {
      this.type = type;
      this.init = init;
    }
  }

  function Performance() {}
  Performance.prototype.now = function () {
    return clock.perf;
  };

  const ctx = {
    clock,
    timers,
    cleared,
    MouseEvent: FakeEvent,
    rafCallbacks,
    Performance,
    performance: new Performance(),
    Date: { now: () => clock.date },
    setTimeout: (fn, delay) => {
      timers.push({ kind: "timeout", fn, delay });
      return timers.length;
    },
    setInterval: (fn, delay) => {
      timers.push({ kind: "interval", fn, delay });
      return timers.length;
    },
    clearTimeout: () => {},
    clearInterval: (id) => cleared.push(id),
    requestAnimationFrame: (cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    },
    cancelAnimationFrame: () => {},
    document: { querySelector: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readSource("inject.js"), ctx);

  ctx.advance = (ms) => {
    clock.perf += ms;
    clock.date += ms;
  };
  return ctx;
}

function createChromeMock() {
  const store = {};
  const calls = [];
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (k in store) out[k] = structuredClone(store[k]);
          return out;
        },
        async set(obj) {
          Object.assign(store, structuredClone(obj));
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete store[k];
        },
      },
    },
    scripting: {
      async executeScript(opts) {
        calls.push(opts);
        const frames = opts.target.allFrames ? [0, 1] : opts.target.frameIds;
        return frames.map((frameId) => ({
          frameId,
          result: opts.func && opts.func.name === "injectCanvasSpeed" ? "OK:inject:2:engines=PIXI.Ticker" : "OK",
        }));
      },
    },
  };
  return { chrome, store, calls };
}

function loadCore(chrome) {
  const ctx = { chrome, URL, structuredClone, console };
  vm.createContext(ctx);
  vm.runInContext(readSource("inject.js"), ctx);
  vm.runInContext(readSource("core.js"), ctx);
  return ctx;
}

module.exports = { createFakePage, createChromeMock, loadCore };

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
function harness() {
  let now = 0,
    id = 0;
  const timers = new Map(),
    doc = new EventTarget(),
    win = new EventTarget();
  doc.hidden = false;
  const source = readFileSync("assets/core.js", "utf8")
    .split("export function poll(")[1]
    .split("export { sound }")[0];
  const context = vm.createContext({
    document: doc,
    window: win,
    Date: { now: () => now },
    setTimeout: (fn, ms) => {
      timers.set(++id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext("function poll(" + source, context);
  return {
    poll: context.poll,
    timers,
    doc,
    async advance(ms) {
      now += ms;
      for (const [k, t] of [...timers])
        if (t.at <= now) {
          timers.delete(k);
          t.fn();
        }
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
    get now() {
      return now;
    },
  };
}
test("sondeo: la latencia de respuesta no se suma al intervalo ni se superponen llamadas", async () => {
  const h = harness();
  let finish,
    calls = 0;
  const p = h.poll(() => {
    calls++;
    return new Promise((r) => (finish = r));
  }, 2000);
  assert.equal(calls, 1);
  await h.advance(1500);
  finish();
  await h.advance(0);
  assert.equal([...h.timers.values()][0].at, 2000);
  await h.advance(499);
  assert.equal(calls, 1);
  await h.advance(1);
  assert.equal(calls, 2);
  p.refresh();
  p.refresh();
  p.refresh();
  assert.equal(calls, 2);
  finish();
  await h.advance(0);
  await h.advance(0);
  assert.equal(calls, 3);
  p.stop();
  finish();
  await h.advance(10000);
  assert.equal(h.timers.size, 0);
});
test("sondeo: fallos y pestaña oculta conservan espera y recuperación al volver", async () => {
  const h = harness();
  let calls = 0;
  const p = h.poll(async () => {
    calls++;
    throw Error("offline");
  }, 2000);
  await h.advance(0);
  assert.equal([...h.timers.values()][0].at, 4000);
  h.doc.hidden = true;
  await h.advance(4000);
  assert.equal([...h.timers.values()][0].at, 34000);
  h.doc.hidden = false;
  h.doc.dispatchEvent(new Event("visibilitychange"));
  await h.advance(0);
  assert.equal(calls, 3);
  p.stop();
});
test("sondeo: una respuesta lenta fallida conserva todo el tiempo de reintento", async () => {
  const h = harness();
  let fail;
  const p = h.poll(
    () => new Promise((resolve, reject) => (fail = reject)),
    2000,
  );
  await h.advance(10000);
  fail(Error("timeout"));
  await h.advance(0);
  assert.equal([...h.timers.values()][0].at, 14000);
  p.stop();
});

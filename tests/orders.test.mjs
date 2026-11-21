import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOrder } from "../assets/orders.js";
test("una solicitud con celulares numéricos de Sheets conserva datos utilizables por la tarjeta", () => {
  const o = normalizeOrder({
    id: "test",
    name: "Cliente de prueba",
    phone: 3001234567,
    courierPhone: 3101234567,
    address: "Calle 49 # 8-25",
    status: " pending ",
    service: "envio",
  });
  assert.equal(o.phone.replace(/[^+\d]/g, ""), "3001234567");
  assert.equal(o.courierPhone.replace(/[^+\d]/g, ""), "3101234567");
  assert.equal(o.status, "pending");
  assert.equal(o.name, "Cliente de prueba");
});
test("campos faltantes tienen una representación segura sin inventar un estado operativo", () => {
  const o = normalizeOrder({
    id: 123,
    name: null,
    phone: null,
    address: null,
    status: null,
  });
  assert.equal(o.id, "123");
  assert.equal(o.name, "Cliente sin nombre");
  assert.equal(o.phone, "");
  assert.equal(o.status, "");
});

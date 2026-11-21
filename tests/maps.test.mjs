import test from "node:test";
import assert from "node:assert/strict";
import { environment } from "./support/gas.mjs";
import { randomUUID, randomBytes } from "node:crypto";
test("la dirección de Google no sustituye las coordenadas GPS y la caché evita llamadas repetidas", () => {
  const e = environment(),
    p = { cityId: "barrancabermeja", lat: 7.065312, lng: -73.854712 };
  const r = e.call("resolveLocation", p);
  assert.ok(r.ok, r.error?.message);
  assert.match(r.data.address, /Calle 49/);
  assert.equal(r.data.lat, p.lat);
  assert.equal(r.data.lng, p.lng);
  const near = { ...p, lat: 7.065313 };
  const cached = e.call("resolveLocation", near);
  assert.equal(cached.data.lat, near.lat);
  assert.equal(e.geocoding.reverseCalls, 1);
});
test("la búsqueda manual incluye la ciudad y descarta resultados de otra zona", () => {
  const e = environment(),
    p = { cityId: "barrancabermeja", address: "Calle 49 #8-25" };
  assert.ok(e.call("searchAddress", p).ok);
  assert.match(e.geocoding.lastSearch, /Barrancabermeja, Colombia/);
  e.geocoding.outside = true;
  assert.equal(
    e.call("searchAddress", { ...p, address: "Otra calle" }).error.code,
    "ADDRESS_NOT_FOUND",
  );
  assert.equal(
    e.call("resolveLocation", { cityId: p.cityId, lat: 4.7, lng: -74.1 }).error
      .code,
    "OUTSIDE_CITY",
  );
  assert.equal(e.geocoding.reverseCalls, 0);
});
test("un fallo de Google devuelve una alternativa clara y no crea solicitudes", () => {
  const e = environment();
  e.geocoding.fail = true;
  const r = e.call("resolveLocation", {
    cityId: "barrancabermeja",
    lat: 7.0653,
    lng: -73.8547,
  });
  assert.equal(r.error.code, "MAPS_UNAVAILABLE");
  assert.equal(e.context.rows_("Requests").length, 0);
});
test("cliente y administrador reciben el mismo punto y los celulares numéricos se normalizan", () => {
  const e = environment(),
    p = {
      id: randomUUID(),
      trackingToken: randomBytes(32).toString("hex"),
      cityId: "barrancabermeja",
      name: "Prueba GPS",
      phone: "3001234567",
      address: "Calle 49 #8-25",
      service: "envio",
      consent: true,
      lat: 7.06531,
      lng: -73.85471,
      accuracy: 124,
      locationMode: "gps",
    };
  assert.ok(e.call("createRequest", p).ok);
  const row = e.context.rows_("Requests")[0];
  row.phone = 3001234567;
  row.locationAt = new Date(Date.now() - 21000).toISOString();
  e.context.write_("Requests", row);
  e.cache.delete("order:" + e.context.digest_(p.id));
  const moved = {
    id: p.id,
    trackingToken: p.trackingToken,
    cityId: p.cityId,
    lat: 7.0658,
    lng: -73.8545,
    accuracy: 18,
    address: "Calle 50 #8-25",
  };
  assert.equal(e.call("updateLocation", moved).data.updated, true);
  const client = e.call("trackRequest", p).data,
    admin = e.call("dashboard", {}, e.owner).data.orders[0];
  assert.equal(client.lat, admin.lat);
  assert.equal(client.lng, admin.lng);
  assert.equal(client.address, moved.address);
  assert.equal(client.accuracy, 18);
  assert.equal(admin.phone, "3001234567");
  assert.equal(client.trackingHash, undefined);
});

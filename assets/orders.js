// Sheets puede devolver un celular como número. La vista trabaja con tipos estables.
export function normalizeOrder(value) {
  const order = value && typeof value === "object" ? { ...value } : {};
  for (const field of [
    "id",
    "name",
    "phone",
    "address",
    "reference",
    "notes",
    "courier",
    "courierPhone",
    "cityId",
    "locationMode",
    "locationAt",
    "cancelReason",
  ])
    order[field] = String(order[field] ?? "").trim();
  order.name ||= "Cliente sin nombre";
  order.address ||= "Punto de recogida por confirmar";
  order.status = String(order.status ?? "")
    .trim()
    .toLowerCase();
  order.service = String(order.service ?? "")
    .trim()
    .toLowerCase();
  order.revision = Number(order.revision) || 1;
  return order;
}

/** Source included by scripts/build-push-crypto.mjs in the complete Code.gs. */
function pushInfo_() {
  const p = PropertiesService.getScriptProperties();
  const available =
    !!book_().getSheetByName("PushSubscriptions") &&
    !!book_().getSheetByName("PushEvents");
  const publicKey = p.getProperty("PUSH_PUBLIC_KEY") || "";
  return {
    available: available,
    enabled: available && !!publicKey && !!p.getProperty("PUSH_PRIVATE_KEY"),
    publicKey: publicKey,
    version: APP_VERSION,
  };
}
function pushBytes_(text) {
  return Utilities.base64DecodeWebSafe(String(text)).map(function (b) {
    return (b + 256) % 256;
  });
}
function pushB64_(bytes) {
  return Utilities.base64EncodeWebSafe(
    bytes.map(function (b) {
      return b > 127 ? b - 256 : b;
    }),
  ).replace(/=+$/, "");
}
function pushUtf8_(text) {
  return Utilities.newBlob(String(text))
    .getBytes()
    .map(function (b) {
      return (b + 256) % 256;
    });
}
function configurePush_(actor, d) {
  owner_(actor);
  return locked_(function () {
    actor = authenticate_(actor._token);
    owner_(actor);
    if (!pushInfo_().available)
      fail_(
        "PUSH_SETUP_REQUIRED",
        "El servicio de avisos necesita completar su actualización.",
      );
    const p = PropertiesService.getScriptProperties();
    if (p.getProperty("PUSH_PUBLIC_KEY")) return pushInfo_();
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(String(d.privateKey)) ||
      !/^[A-Za-z0-9_-]{87}$/.test(String(d.publicKey))
    )
      fail_(
        "VALIDATION",
        "No pudimos preparar los avisos de este dispositivo.",
      );
    let calculated;
    try {
      calculated = pushB64_(TocPushCrypto.publicKey(pushBytes_(d.privateKey)));
    } catch (error) {
      fail_(
        "VALIDATION",
        "No pudimos preparar los avisos de este dispositivo.",
      );
    }
    if (!equal_(calculated, d.publicKey))
      fail_("VALIDATION", "La configuración de avisos no es válida.");
    p.setProperty("PUSH_PRIVATE_KEY", d.privateKey);
    p.setProperty("PUSH_PUBLIC_KEY", d.publicKey);
    audit_(actor, "PUSH_ENABLED", actor.id);
    return pushInfo_();
  });
}
function preparePush_(actor) {
  owner_(actor);
  return locked_(function () {
    owner_(authenticate_(actor._token));
    ["PushSubscriptions", "PushEvents"].forEach(function (name) {
      const s = book_().getSheetByName(name) || book_().insertSheet(name),
        columns = SCHEMA[name];
      if (s.getLastRow() > 0) {
        if (
          JSON.stringify(s.getRange(1, 1, 1, columns.length).getValues()[0]) !==
          JSON.stringify(columns)
        )
          fail_(
            "PUSH_SETUP_REQUIRED",
            "El jefe debe revisar la preparación de los avisos.",
          );
      } else s.getRange(1, 1, 1, columns.length).setValues([columns]);
      s.setFrozenRows(1);
    });
    if (
      !ScriptApp.getProjectTriggers().some(function (t) {
        return t.getHandlerFunction() === "deliverPushQueue";
      })
    )
      ScriptApp.newTrigger("deliverPushQueue")
        .timeBased()
        .everyMinutes(1)
        .create();
    audit_(actor, "PUSH_PREPARED", actor.id);
    return pushInfo_();
  });
}
function pushEndpoint_(endpoint) {
  const text = text_(endpoint, 2048, true),
    match = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^#\s]*)$/i.exec(text);
  if (!match) fail_("VALIDATION", "La dirección de avisos no es válida.");
  const host = match[1].toLowerCase();
  if (!(
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host === "push.services.mozilla.com" ||
    host === "web.push.apple.com" ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(host)
  ))
    fail_(
      "VALIDATION",
      "El proveedor de avisos de este navegador no está habilitado.",
    );
  return { endpoint: text, origin: "https://" + host };
}
function pushPendingCount_(cityId) {
  return cached_(
    "push-count:" + cityId + ":" + revision_(cityId),
    function () {
      return rows_("Requests").filter(function (o) {
        return o.cityId === cityId && o.status === "pending";
      }).length;
    },
    45,
  );
}
function subscribePush_(d, session) {
  if (!pushInfo_().enabled)
    fail_(
      "PUSH_SETUP_REQUIRED",
      "El jefe debe activar primero los avisos del equipo.",
    );
  const target =
    d.scope === "admin" ? authenticate_(session) : authorizeTracking_(d);
  if (d.scope !== "admin" && d.scope !== "client")
    fail_("VALIDATION", "Tipo de aviso no válido.");
  if (d.scope === "admin" && truth_(target.mustChangePassword))
    fail_("PASSWORD_CHANGE_REQUIRED", "Cambia primero tu contraseña inicial.");
  const endpoint = pushEndpoint_(d.endpoint).endpoint;
  return locked_(function () {
    rateUnlocked_("push-subscribe:" + digest_(endpoint), 20, 600);
    // Revalida el permiso tras tomar el bloqueo; no se aceptan roles del navegador.
    const fresh =
      d.scope === "admin"
        ? authenticate_(session)
        : authorizeTracking_(d, true);
    const id = digest_(endpoint + ":" + d.scope + ":" + fresh.id);
    let row = rows_("PushSubscriptions").find(function (s) {
      return s.id === id;
    });
    const grant = random_() + random_(),
      now = now_();
    row = Object.assign(row || { id: id, createdAt: now }, {
      scope: d.scope,
      userId: d.scope === "admin" ? fresh.id : "",
      cityId: fresh.cityId,
      requestId: d.scope === "client" ? fresh.id : "",
      endpoint: endpoint,
      tokenHash: digest_(grant),
      active: true,
      updatedAt: now,
      expiresAt: new Date(
        Date.now() + (d.scope === "admin" ? 365 : 30) * 86400000,
      ).toISOString(),
    });
    if (row._row) write_("PushSubscriptions", row);
    else append_("PushSubscriptions", row);
    cache_().remove("push-subscriptions");
    cache_().remove("push-grant:" + id);
    const result = {
      id: id,
      token: grant,
      scope: row.scope,
      requestId: row.requestId,
      userId: row.userId,
      expiresAt: row.expiresAt,
    };
    // Close the race between an order transition and enabling this device.
    const pending = d.scope === "admin" && pushPendingCount_(fresh.cityId) > 0;
    if (pending || (d.scope === "client" && fresh.status !== "pending"))
      result.pushDispatch = enqueuePush_(
        { id: row.requestId, cityId: row.cityId },
        "catchup",
        "subscription",
        row.id,
      );
    return result;
  });
}
function pushGrant_(d) {
  if (
    !/^[a-f0-9]{64}$/.test(String(d.id)) ||
    !/^[a-f0-9]{64}$/.test(String(d.token))
  )
    fail_("UNAUTHORIZED", "Vuelve a activar los avisos en este dispositivo.");
  const row = cached_(
    "push-grant:" + d.id,
    function () {
      return (
        rows_("PushSubscriptions").find(function (s) {
          return s.id === d.id;
        }) || null
      );
    },
    60,
  );
  if (
    !row ||
    !truth_(row.active) ||
    new Date(row.expiresAt).getTime() <= Date.now() ||
    !equal_(row.tokenHash, digest_(d.token))
  )
    fail_("UNAUTHORIZED", "Vuelve a activar los avisos en este dispositivo.");
  if (row.scope === "admin") {
    const u = users_().find(function (u) {
      return u.id === row.userId;
    });
    if (
      !u ||
      !truth_(u.active) ||
      truth_(u.mustChangePassword) ||
      u.cityId !== row.cityId
    )
      fail_("UNAUTHORIZED", "Esta cuenta ya no tiene acceso a los avisos.");
  } else {
    const request = findRequest_(row.requestId);
    if (!request || request.cityId !== row.cityId)
      fail_("UNAUTHORIZED", "Este seguimiento ya no está disponible.");
  }
  return row;
}
function unsubscribePush_(d) {
  return locked_(function () {
    const row = pushGrant_(d);
    row.active = false;
    row.updatedAt = now_();
    write_("PushSubscriptions", row);
    cache_().remove("push-grant:" + row.id);
    cache_().remove("push-subscriptions");
    return { disabled: true };
  });
}
function pushRecentEvents_() {
  const s = sheet_("PushEvents"),
    count = Math.min(500, s.getLastRow() - 1);
  if (count < 1) return [];
  const start = s.getLastRow() - count + 1;
  return s
    .getRange(start, 1, count, SCHEMA.PushEvents.length)
    .getValues()
    .map(function (v, i) {
      return object_("PushEvents", v, start + i);
    });
}
function pushEventMatches_(e, s) {
  return e.audience === "subscription"
    ? e.targetId === s.id
    : e.audience === "admin"
      ? s.scope === "admin" && e.cityId === s.cityId
      : s.scope === "client" && e.requestId === s.requestId;
}
function pushInbox_(d) {
  rate_("push-inbox:" + text_(d.id, 64, true), 40, 60);
  const s = pushGrant_(d),
    since = Number(d.since) || 0;
  const events = pushRecentEvents_()
    .filter(function (e) {
      return (
        pushEventMatches_(e, s) &&
        new Date(e.createdAt).getTime() >= since - 5000
      );
    })
    .slice(-5);
  const notifications = events.map(function (e) {
    if (e.kind === "test")
      return {
        id: e.id,
        title: "TocToc está listo",
        body: "Este dispositivo ya puede recibir tus avisos.",
        tag: "toc-test",
        path: s.scope === "admin" ? "admin.html#settings" : "index.html",
        scope: s.scope,
        requestId: s.requestId,
        alertKey: "test:" + e.id,
      };
    if (s.scope === "admin") {
      const count = pushPendingCount_(s.cityId);
      return {
        id: e.id,
        title: count
          ? "Tienes servicios por aceptar"
          : "Tu centro de servicios está al día",
        body: count
          ? count === 1
            ? "Hay una solicitud esperando. Abre TocToc para revisarla."
            : "Hay " +
              count +
              " solicitudes esperando. Abre TocToc para revisarlas."
          : "Abre TocToc para consultar las últimas novedades.",
        tag: "toc-services-" + s.cityId,
        path: "admin.html#inbox",
        scope: "admin",
        requestId: e.requestId,
        alertKey: "admin:" + e.requestId + ":new",
      };
    }
    const order = findRequest_(s.requestId);
    const copy = {
      pending: [
        "Recibimos tu solicitud",
        "El equipo está revisando tu servicio.",
      ],
      accepted: [
        "Tu domiciliario está en camino",
        "Tu servicio fue aceptado. Abre TocToc para ver sus datos.",
      ],
      completed: [
        "Un pendiente menos",
        "Tu servicio fue marcado como completado.",
      ],
      cancelled: [
        "Tu solicitud fue cancelada",
        "Abre TocToc para consultar el estado de tu servicio.",
      ],
    }[order.status] || [
      "Hay novedades de tu servicio",
      "Abre TocToc para consultarlas.",
    ];
    return {
      id: e.id + ":" + order.status,
      title: copy[0],
      body: copy[1],
      tag: "toc-request-" + order.id,
      path: "index.html#service=" + encodeURIComponent(order.id),
      scope: "client",
      requestId: order.id,
      alertKey: "client:" + order.id + ":" + order.status,
    };
  });
  return { notifications: notifications, checkedAt: Date.now() };
}
function enqueuePush_(order, kind, audience, targetId) {
  if (!pushInfo_().enabled) return null;
  const event = {
    id: random_(),
    createdAt: now_(),
    cityId: order.cityId || "",
    requestId: order.id || "",
    kind: kind,
    audience: audience,
    targetId: targetId || "",
    state: "pending",
    attempts: 0,
    nextAttemptAt: now_(),
    leaseUntil: "",
    leaseToken: "",
    lastError: "",
  };
  append_("PushEvents", event);
  PropertiesService.getScriptProperties().setProperty("pushPending", "1");
  const expires = Date.now() + 120000;
  return {
    id: event.id,
    expires: expires,
    token: hmac_("push-dispatch:" + event.id + ":" + expires),
  };
}
function attachPush_(result, order, kind, audience) {
  try {
    const dispatch = enqueuePush_(order, kind, audience);
    if (dispatch) result.pushDispatch = dispatch;
  } catch (error) {
    console.error(
      "No se pudo programar un aviso. El servicio permanece registrado.",
    );
  }
  return result;
}
function testPush_(d) {
  return locked_(function () {
    const s = pushGrant_(d);
    rateUnlocked_("push-test:" + s.id, 3, 60);
    const dispatch = enqueuePush_(
      { id: s.requestId, cityId: s.cityId },
      "test",
      "subscription",
      s.id,
    );
    return { queued: !!dispatch, pushDispatch: dispatch };
  });
}
function pushVapidHeader_(origin) {
  const props = PropertiesService.getScriptProperties(),
    publicKey = props.getProperty("PUSH_PUBLIC_KEY");
  return cached_(
    "vapid:" + digest_(origin + publicKey),
    function () {
      const head = pushB64_(
        pushUtf8_(JSON.stringify({ typ: "JWT", alg: "ES256" })),
      );
      const body = pushB64_(
        pushUtf8_(
          JSON.stringify({
            aud: origin,
            exp: Math.floor(Date.now() / 1000) + 43200,
            sub: "https://devnnex.github.io/TOC-TOC-DOMICILIOS.COM/",
          }),
        ),
      );
      const signature = pushB64_(
        TocPushCrypto.sign(
          pushUtf8_(head + "." + body),
          pushBytes_(props.getProperty("PUSH_PRIVATE_KEY")),
        ),
      );
      return (
        "vapid t=" + head + "." + body + "." + signature + ",k=" + publicKey
      );
    },
    3600,
  );
}
function dispatchPush_(d) {
  const expiry = Number(d.expires);
  if (
    !/^[a-f0-9]{32}$/.test(String(d.id)) ||
    !Number.isFinite(expiry) ||
    expiry < Date.now() ||
    expiry > Date.now() + 125000 ||
    !equal_(String(d.token), hmac_("push-dispatch:" + d.id + ":" + expiry))
  )
    fail_("FORBIDDEN", "El permiso para enviar este aviso ya venció.");
  return deliverPushEvent_(d.id);
}
function deliverPushEvent_(id) {
  const claimed = locked_(function () {
    const e = rows_("PushEvents").find(function (e) {
      return e.id === id;
    });
    if (
      !e ||
      ["sent", "failed", "skipped"].includes(e.state) ||
      new Date(e.nextAttemptAt).getTime() > Date.now() ||
      (e.state === "sending" && new Date(e.leaseUntil).getTime() > Date.now())
    )
      return null;
    e.state = "sending";
    e.leaseUntil = new Date(Date.now() + 60000).toISOString();
    e.leaseToken = random_();
    write_("PushEvents", e);
    return e;
  });
  if (!claimed) return { sent: 0 };
  const enabledUsers = users_(),
    seen = {},
    all = cached_(
      "push-subscriptions",
      function () {
        return rows_("PushSubscriptions");
      },
      60,
    );
  const subscriptions = all.filter(function (s) {
    if (
      !truth_(s.active) ||
      new Date(s.expiresAt).getTime() <= Date.now() ||
      !pushEventMatches_(claimed, s) ||
      seen[s.endpoint]
    )
      return false;
    if (
      s.scope === "admin" &&
      !enabledUsers.some(function (u) {
        return (
          u.id === s.userId &&
          u.cityId === s.cityId &&
          truth_(u.active) &&
          !truth_(u.mustChangePassword)
        );
      })
    )
      return false;
    seen[s.endpoint] = true;
    return true;
  });
  const expired = [],
    failed = [];
  let sent = 0;
  // Payload-less Web Push: the worker reads its scoped inbox over HTTPS.
  for (let i = 0; i < subscriptions.length; i += 100) {
    const batch = subscriptions.slice(i, i + 100);
    try {
      const responses = UrlFetchApp.fetchAll(
        batch.map(function (s) {
          const dest = pushEndpoint_(s.endpoint);
          return {
            url: dest.endpoint,
            method: "post",
            payload: "",
            headers: {
              Authorization: pushVapidHeader_(dest.origin),
              TTL: "86400",
              Urgency: "high",
              Topic: digest_(claimed.audience + claimed.requestId).slice(0, 32),
            },
            muteHttpExceptions: true,
            followRedirects: false,
            validateHttpsCertificates: true,
          };
        }),
      );
      responses.forEach(function (response, index) {
        const code = response.getResponseCode();
        if (code >= 200 && code < 300) sent++;
        else if (code === 404 || code === 410) expired.push(batch[index]);
        else failed.push(String(code));
      });
    } catch (error) {
      failed.push("NETWORK");
    }
  }
  locked_(function () {
    expired.forEach(function (old) {
      const s = rows_("PushSubscriptions").find(function (s) {
        return s.id === old.id;
      });
      if (s && s.updatedAt === old.updatedAt) {
        s.active = false;
        s.updatedAt = now_();
        write_("PushSubscriptions", s);
        cache_().remove("push-grant:" + s.id);
      }
    });
    if (expired.length) cache_().remove("push-subscriptions");
    const e = rows_("PushEvents").find(function (e) {
      return e.id === claimed.id;
    });
    if (!e || e.leaseToken !== claimed.leaseToken) return;
    e.attempts = Number(e.attempts) + 1;
    e.state = failed.length ? (e.attempts >= 6 ? "failed" : "retry") : "sent";
    e.nextAttemptAt = new Date(
      Date.now() + Math.min(900000, 30000 * Math.pow(2, e.attempts)),
    ).toISOString();
    e.lastError = failed.slice(0, 3).join(",");
    e.leaseUntil = "";
    e.leaseToken = "";
    write_("PushEvents", e);
  });
  return { sent: sent, retry: failed.length > 0 };
}
/** Minute trigger is a fallback when a tab closes before dispatching its job. */
function deliverPushQueue() {
  if (
    PropertiesService.getScriptProperties().getProperty("pushPending") !==
      "1" ||
    !pushInfo_().enabled
  )
    return { sent: 0 };
  const pending = rows_("PushEvents").filter(function (e) {
    return ["pending", "retry", "sending"].includes(e.state);
  });
  const due = pending
    .filter(function (e) {
      return (
        new Date(e.nextAttemptAt).getTime() <= Date.now() &&
        (e.state !== "sending" ||
          new Date(e.leaseUntil).getTime() <= Date.now())
      );
    })
    .slice(0, 4);
  let sent = 0;
  due.forEach(function (e) {
    sent += deliverPushEvent_(e.id).sent || 0;
  });
  if (
    !rows_("PushEvents").some(function (e) {
      return ["pending", "retry", "sending"].includes(e.state);
    })
  )
    PropertiesService.getScriptProperties().setProperty("pushPending", "0");
  return { sent: sent };
}
/** Only disposable delivery metadata expires. Never remove business records. */
function cleanupPush_() {
  if (!pushInfo_().available) return;
  const cutoff = Date.now() - 7 * 86400000;
  deleteRows_(
    "PushEvents",
    rows_("PushEvents").filter(function (e) {
      return (
        ["sent", "failed", "skipped"].includes(e.state) &&
        new Date(e.createdAt).getTime() < cutoff
      );
    }),
  );
  const expired = rows_("PushSubscriptions").filter(function (s) {
    return new Date(s.expiresAt).getTime() < cutoff;
  });
  expired.forEach(function (s) {
    cache_().remove("push-grant:" + s.id);
  });
  deleteRows_("PushSubscriptions", expired);
  cache_().remove("push-subscriptions");
}

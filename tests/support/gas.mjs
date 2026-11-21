import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash, createHmac, randomUUID, pbkdf2Sync } from "node:crypto";
function environment({ createOwner = true } = {}) {
  const props = new Map(),
    cache = new Map(),
    tables = new Map(),
    triggers = [];
  let locked = false;
  class Sheet {
    constructor(name) {
      this.name = name;
      this.data = [];
    }
    getLastRow() {
      let n = this.data.length;
      while (n && !this.data[n - 1].some((x) => x !== "" && x != null)) n--;
      return n;
    }
    getRange(row, col, n = 1, m = 1) {
      const self = this;
      return {
        getValues() {
          return Array.from({ length: n }, (_, i) =>
            Array.from(
              { length: m },
              (_, j) => self.data[row + i - 1]?.[col + j - 1] ?? "",
            ),
          );
        },
        setValues(values) {
          for (let i = 0; i < n; i++) {
            self.data[row + i - 1] ??= [];
            for (let j = 0; j < m; j++)
              self.data[row + i - 1][col + j - 1] = values[i][j];
          }
          return this;
        },
        setBackground() {
          return this;
        },
        setFontColor() {
          return this;
        },
        setFontWeight() {
          return this;
        },
        createTextFinder(value) {
          return {
            matchEntireCell() {
              return this;
            },
            findNext() {
              for (let i = row - 1; i < row + n - 1; i++)
                if (self.data[i]?.[col - 1] === value)
                  return { getRow: () => i + 1 };
              return null;
            },
          };
        },
      };
    }
    setFrozenRows() {}
    deleteRow(row) {
      this.deleteRows(row, 1);
    }
    deleteRows(row, n) {
      this.data.splice(row - 1, n);
    }
  }
  const context = vm.createContext({
    console: { log() {}, error() {} },
    SpreadsheetApp: {
      flush() {},
      openById: () => ({
        getSheetByName: (n) => tables.get(n),
        insertSheet: (n) => {
          const s = new Sheet(n);
          tables.set(n, s);
          return s;
        },
        setSpreadsheetTimeZone() {},
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) ?? null,
        setProperty: (k, v) => props.set(k, v),
        deleteProperty: (k) => props.delete(k),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) ?? null,
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k),
        removeAll: (keys) => keys.forEach((k) => cache.delete(k)),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          assert.equal(locked, false, "Sin bloqueos anidados");
          locked = true;
          return true;
        },
        releaseLock: () => (locked = false),
      }),
    },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (n) => ({
        after() {
          return this;
        },
        timeBased() {
          return this;
        },
        everyDays() {
          return this;
        },
        atHour() {
          return this;
        },
        inTimezone() {
          return this;
        },
        create() {
          triggers.push({ getHandlerFunction: () => n });
        },
      }),
    },
    Utilities: {
      getUuid: randomUUID,
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_, s) => [...createHash("sha256").update(s).digest()],
      computeHmacSha256Signature: (s, k) => [
        ...createHmac("sha256", k).update(s).digest(),
      ],
      formatDate: (d) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Bogota",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s) => ({ setMimeType: () => s }),
    },
  });
  vm.runInContext(readFileSync("Code.gs", "utf8"), context);
  const call = (action, data = {}, session = "") =>
    JSON.parse(
      context.doPost({
        postData: { contents: JSON.stringify({ action, data, session }) },
      }),
    );
  context.setup();
  const key = (email, password = "UnaClaveSegura2026!") => {
    const r = call("challenge", { email });
    assert.ok(r.ok, r.error?.message);
    return pbkdf2Sync(password, r.data.salt, 310000, 32, "sha256").toString(
      "hex",
    );
  };
  const ownerKey = key("jefe@example.com");
  const boot = createOwner
    ? call("bootstrap", {
        email: "jefe@example.com",
        name: "Jefe",
        passwordKey: ownerKey,
        bootstrapToken: props.get("BOOTSTRAP_TOKEN"),
      })
    : null;
  if (boot) assert.ok(boot.ok, boot.error?.message);
  return {
    context,
    call,
    key,
    props,
    cache,
    tables,
    triggers,
    owner: boot?.data.token || "",
    ownerKey,
  };
}

export { environment };

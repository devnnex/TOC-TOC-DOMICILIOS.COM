// Shared by the page and its worker. Each deployed app gets its own database.
globalThis.TocPwaStore = {
  async entries(scope, prefix) {
    const db = await this.open(scope);
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("state"),
          request = tx.objectStore("state").openCursor(),
          result = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (String(cursor.key).startsWith(prefix))
            result.push([cursor.key, cursor.value]);
          cursor.continue();
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  },
  async open(scope) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("toc-pwa:" + scope, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async get(scope, key) {
    const db = await this.open(scope);
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("state").objectStore("state").get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  },
  async put(scope, key, value) {
    const db = await this.open(scope);
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("state", "readwrite");
        transaction.objectStore("state").put(value, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  },
  async remove(scope, key) {
    const db = await this.open(scope);
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("state", "readwrite");
        transaction.objectStore("state").delete(key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  },
};

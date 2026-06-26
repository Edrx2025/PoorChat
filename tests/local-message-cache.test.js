const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const LocalMessageCache = require("../src/main/LocalMessageCache");

test("el caché local aísla cuentas, pagina y elimina vistas previas", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chad-cache-"));
  const cache = new LocalMessageCache(path.join(directory, "cache.sqlite"));

  try {
    cache.configure({ host: "100.64.0.10", port: 5050, userId: 1 });
    cache.upsertMessages("private", 7, [
      {
        id: 1,
        chatId: 7,
        content: "primero",
        createdAt: "2026-01-01T10:00:00Z",
      },
      {
        id: 2,
        chatId: 7,
        content: "segundo",
        createdAt: "2026-01-01T10:01:00Z",
        file: {
          id: 9,
          fileType: "image",
          previewData: "data:image/png;base64,demasiado-grande",
        },
      },
      {
        id: 3,
        chatId: 7,
        content: "tercero",
        createdAt: "2026-01-01T10:02:00Z",
      },
    ]);
    cache.markInitialized("private", 7);

    assert.equal(cache.isInitialized("private", 7), true);
    assert.deepEqual(
      cache.getLatest("private", 7, 2).map((message) => message.id),
      [2, 3],
    );
    assert.equal(cache.getLatest("private", 7, 2)[0].file.previewData, null);
    assert.deepEqual(
      cache.getBefore("private", 7, 3, 10).map((message) => message.id),
      [1, 2],
    );
    assert.equal(cache.getNewestId("private", 7), 3);
    assert.equal(cache.getOldestId("private", 7), 1);

    cache.configure({ host: "100.64.0.10", port: 5050, userId: 2 });
    assert.deepEqual(cache.getLatest("private", 7), []);

    cache.configure({ host: "100.64.0.11", port: 5050, userId: 1 });
    assert.deepEqual(cache.getLatest("private", 7), []);

    cache.configure({ host: "100.64.0.10", port: 5050, userId: 1 });
    cache.clearContext("private", 7);
    assert.deepEqual(cache.getLatest("private", 7), []);
    assert.equal(cache.isInitialized("private", 7), false);
  } finally {
    cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_STORE_PATH = path.join(process.cwd(), ".data", "whisper-state.json");

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadStateSnapshot(filePath = DEFAULT_STORE_PATH) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      __loadError: `Failed to load state snapshot: ${error.message}`,
    };
  }
}

function createStatePersister(filePath = DEFAULT_STORE_PATH) {
  let lastPayload = "";

  return (snapshot) => {
    const payload = JSON.stringify(snapshot, null, 2);

    if (payload === lastPayload) {
      return;
    }

    ensureParentDir(filePath);
    fs.writeFileSync(filePath, payload);
    lastPayload = payload;
  };
}

module.exports = {
  DEFAULT_STORE_PATH,
  loadStateSnapshot,
  createStatePersister,
};

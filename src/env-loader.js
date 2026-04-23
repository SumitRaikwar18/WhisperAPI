const fs = require("node:fs");
const path = require("node:path");

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separator = trimmed.indexOf("=");

  if (separator === -1) {
    return null;
  }

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (parsed && !Object.prototype.hasOwnProperty.call(process.env, parsed.key)) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

function loadProjectEnv(rootDir) {
  const candidates = [
    ".env",
    ".env.local",
    ".env.devnet",
    ".env.devnet.local",
  ];

  for (const filename of candidates) {
    loadEnvFile(path.join(rootDir, filename));
  }
}

module.exports = {
  loadProjectEnv,
};

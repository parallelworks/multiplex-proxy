const fs = require("fs");
const os = require("os");
const path = require("path");

const HOSTS_PATH =
  process.platform === "win32"
    ? path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "drivers",
        "etc",
        "hosts",
      )
    : "/etc/hosts";

const START_MARKER = "# multiplex-tunnel-start";
const END_MARKER = "# multiplex-tunnel-end";

function addHosts(hostnames, logger) {
  removeHosts(logger);

  const entries = hostnames.map((h) => `127.0.0.1 ${h}`).join(os.EOL);
  const block = `${os.EOL}${START_MARKER}${os.EOL}${entries}${os.EOL}${END_MARKER}${os.EOL}`;

  fs.appendFileSync(HOSTS_PATH, block);
  logger(`[HOSTS] Added ${hostnames.length} entries to ${HOSTS_PATH}`);
  for (const h of hostnames) {
    logger(`[HOSTS]   127.0.0.1 ${h}`);
  }
}

function removeHosts(logger) {
  let content;
  try {
    content = fs.readFileSync(HOSTS_PATH, "utf8");
  } catch {
    return;
  }

  const regex = new RegExp(
    `(\\r?\\n)?${START_MARKER}[\\s\\S]*?${END_MARKER}(\\r?\\n)?`,
    "g",
  );

  if (!regex.test(content)) return;

  const cleaned = content.replace(regex, os.EOL);
  fs.writeFileSync(HOSTS_PATH, cleaned);
  logger(`[HOSTS] Removed tunnel entries from ${HOSTS_PATH}`);
}

module.exports = { addHosts, removeHosts, HOSTS_PATH };

const fs = require("fs");

const HOSTS_PATH = "/etc/hosts";
const START_MARKER = "# multiplex-tunnel-start";
const END_MARKER = "# multiplex-tunnel-end";

function addHosts(hostnames, logger) {
  removeHosts(logger);

  const entries = hostnames.map((h) => `127.0.0.1 ${h}`).join("\n");
  const block = `\n${START_MARKER}\n${entries}\n${END_MARKER}\n`;

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
    `\\n?${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`,
    "g",
  );

  if (!regex.test(content)) return;

  const cleaned = content.replace(regex, "\n");
  fs.writeFileSync(HOSTS_PATH, cleaned);
  logger(`[HOSTS] Removed tunnel entries from ${HOSTS_PATH}`);
}

module.exports = { addHosts, removeHosts };

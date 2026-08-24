const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { TunnelManager } = require('./tunnel-manager');
const { createSNIProxy } = require('./sni-proxy');
const { addHosts, removeHosts, HOSTS_PATH } = require('./hosts-manager');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

const ELEVATION_HINT =
  process.platform === 'win32'
    ? 'Run from an elevated (Administrator) terminal.'
    : 'Run with sudo.';

// Load config
const configPath = path.join(__dirname, 'config.yaml');
let config;
try {
  config = yaml.load(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error(`Failed to load config from ${configPath}: ${err.message}`);
  process.exit(1);
}

if (!config.ssh || !config.sites || config.sites.length === 0) {
  console.error('Config must have "ssh" settings and at least one entry in "sites".');
  process.exit(1);
}

// Build route map: hostname -> localPort
const routeMap = {};
for (const site of config.sites) {
  routeMap[site.host] = site.localPort;
}

// 1. Add hosts file entries
const hostnames = config.sites.map(s => s.host);
try {
  addHosts(hostnames, log);
} catch (err) {
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    console.error(`Permission denied updating ${HOSTS_PATH}. ${ELEVATION_HINT}`);
    process.exit(1);
  }
  throw err;
}

// 2. Start SSH tunnels
const tunnels = new TunnelManager(config.ssh, config.sites, log);
tunnels.on('error', (err) => {
  log(`[TUNNEL] FATAL: ${err.message}`);
  log('[TUNNEL] Cannot establish tunnels. Cleaning up and exiting.');
  proxy.close();
  tunnels.stopAll();
  removeHosts(log);
  process.exit(1);
});
tunnels.startAll();

// 3. Start SNI proxy on port 443
const proxy = createSNIProxy(routeMap, log);
proxy.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log('[PROXY] ERROR: Port 443 is already in use. Is another tunnel or web server running?');
  } else if (err.code === 'EACCES') {
    log(`[PROXY] ERROR: Permission denied binding port 443. ${ELEVATION_HINT}`);
  } else {
    log(`[PROXY] ERROR: ${err.message}`);
  }
  tunnels.stopAll();
  removeHosts(log);
  process.exit(1);
});

proxy.listen(443, '127.0.0.1', () => {
  log('[PROXY] SNI proxy listening on 127.0.0.1:443');
  log('[PROXY] Routes:');
  for (const [host, port] of Object.entries(routeMap)) {
    log(`[PROXY]   https://${host} -> 127.0.0.1:${port}`);
  }
  log('');
  log('[MAIN] Ready. Press Ctrl+C to stop.');
});

// 4. Graceful shutdown
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  log(`[MAIN] Received ${signal}, shutting down...`);
  proxy.close();
  tunnels.stopAll();
  removeHosts(log);
  log('[MAIN] Cleanup complete.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

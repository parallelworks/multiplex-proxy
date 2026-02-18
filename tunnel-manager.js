const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

class TunnelManager {
  constructor(sshConfig, sites, logger) {
    this.sshConfig = sshConfig;
    this.sites = sites;
    this.logger = logger;
    this.processes = new Map(); // host -> { proc, restartTimer }
    this.stopped = false;
  }

  startAll() {
    for (const site of this.sites) {
      this._startOne(site);
    }
  }

  _resolveHome(filepath) {
    if (!filepath.startsWith('~')) return filepath;
    // Under sudo, ~ expands to root's home. Use SUDO_USER to find the real user.
    const home = process.env.SUDO_USER
      ? path.join(os.homedir().split('/').slice(0, -1).join('/'), process.env.SUDO_USER)
      : os.homedir();
    return filepath.replace('~', home);
  }

  _startOne(site) {
    if (this.stopped) return;

    const identityFile = this._resolveHome(this.sshConfig.identityFile);

    const args = [
      '-i', identityFile,
      '-N',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', `ProxyCommand=${this.sshConfig.proxyCommand}`,
      '-L', `${site.localPort}:${site.host}:${site.port}`,
      `${this.sshConfig.user}@${this.sshConfig.jumpHost}`
    ];

    this.logger(`[TUNNEL] Starting: ssh ${args.join(' ')}`);

    const proc = spawn('ssh', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (d) => {
      this.logger(`[TUNNEL:${site.host}] ${d.toString().trim()}`);
    });

    proc.stderr.on('data', (d) => {
      this.logger(`[TUNNEL:${site.host}] ${d.toString().trim()}`);
    });

    proc.on('exit', (code, signal) => {
      this.logger(`[TUNNEL] ${site.host} exited (code=${code}, signal=${signal})`);
      if (!this.stopped) {
        this.logger(`[TUNNEL] Restarting ${site.host} in 3s...`);
        const timer = setTimeout(() => this._startOne(site), 3000);
        this.processes.set(site.host, { proc: null, restartTimer: timer });
      }
    });

    this.processes.set(site.host, { proc, restartTimer: null });
  }

  stopAll() {
    this.stopped = true;
    for (const [host, entry] of this.processes) {
      if (entry.restartTimer) clearTimeout(entry.restartTimer);
      if (entry.proc) {
        this.logger(`[TUNNEL] Killing ${host} (pid=${entry.proc.pid})`);
        entry.proc.kill('SIGTERM');
      }
    }
    this.processes.clear();
  }
}

module.exports = { TunnelManager };

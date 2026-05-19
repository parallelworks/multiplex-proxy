# pw-multiplex-proxy

Access many HTTPS sites on a [Parallel Works ACTIVATE](https://parallelworks.com/docs/cli) workspace through a single local port (`:443`), routed by SNI.

A companion to the [`pw` CLI](https://parallelworks.com/docs/cli): once you've authenticated with [`pw auth`](https://parallelworks.com/docs/cli/pw/auth), every tunnel this proxy opens runs through [`pw ssh`](https://parallelworks.com/docs/cli/pw/ssh) under your workspace identity, so any internal or access-controlled URL reachable from your ACTIVATE workspace is reachable from your local browser with the same permissions.

## Why

Reaching multiple HTTPS sites from your workspace normally means one SSH tunnel per site, each bound to local port 443 — but only one process can hold a port at a time:

```bash
sudo ssh -L 443:app.example.com:443 -o ProxyCommand="pw ssh --proxy-command %h" user@workspace
sudo ssh -L 443:api.example.com:443 -o ProxyCommand="pw ssh --proxy-command %h" user@workspace
# ^ can't run both
```

This tool runs one SNI-aware proxy on `127.0.0.1:443` and fans out to per-site tunnels on unique local ports, so you can hit any number of workspace-side HTTPS sites at once.

## How it works

```
Browser → /etc/hosts            app.example.com → 127.0.0.1
        → SNI proxy on :443     reads TLS ClientHello SNI
        → unique local port     e.g. :10443
        → pw ssh tunnel         forwards to remote host:443
```

1. Each site gets its own `pw ssh` tunnel on a unique local port (10443, 10444, ...)
2. The SNI proxy on `:443` parses the TLS hostname and routes to the matching tunnel
3. `/etc/hosts` entries are auto-managed so the configured domains resolve to `127.0.0.1`

## Prerequisites

1. **Install the pw CLI** ([docs](https://parallelworks.com/docs/cli)):
   ```bash
   curl -fsSL https://activate.parallel.works/cli/install.sh | bash
   ```
2. **Authenticate** ([docs](https://parallelworks.com/docs/cli/pw/auth)) — pick one:
   ```bash
   pw auth token     # short-term token
   pw auth apikey    # long-lived API key
   ```
   This sets up `~/.ssh/pwcli` and links your workspace identity. Sanity check:
   ```bash
   pw auth whoami
   ```
3. **Node.js** (for this proxy) and **sudo** (for `:443` and `/etc/hosts`).

## Setup

```bash
npm install
cp config.yaml.template config.yaml
# edit config.yaml: your pw username, workspace name, and the sites you want
```

## Configuration

```yaml
ssh:
  identityFile: ~/.ssh/pwcli                  # managed by `pw auth`
  user: YOUR_PW_USERNAME
  jumpHost: workspace                         # short name of your pw workspace
  proxyCommand: "pw ssh --proxy-command %h"   # routes through ACTIVATE

sites:
  - host: app.example.com
    port: 443
    localPort: 10443
  - host: api.example.com
    port: 443
    localPort: 10444
```

Each site needs a unique `localPort`. Because auth flows through `~/.ssh/pwcli`, rotating credentials is a single `pw auth` call — no edits here. `config.yaml` is gitignored.

## Usage

```bash
sudo node index.js
# Ctrl+C cleans up /etc/hosts and kills tunnels
```

Open `https://app.example.com` in your browser — it resolves to `127.0.0.1`, hits the SNI proxy, and is forwarded through your ACTIVATE workspace.

## Using without ACTIVATE

The proxy itself is `ProxyCommand`-agnostic. To use a plain SSH jumpbox instead:

```yaml
ssh:
  identityFile: ~/.ssh/id_rsa
  user: username
  jumpHost: jumpbox
  proxyCommand: "ssh -W %h:%p jumpbox"
```

## Files

- [index.js](index.js) — loads config, starts everything, handles shutdown
- [sni-proxy.js](sni-proxy.js) — TCP server on `:443`, parses TLS SNI to pick a tunnel
- [tunnel-manager.js](tunnel-manager.js) — spawns and monitors per-site SSH processes
- [hosts-manager.js](hosts-manager.js) — manages `/etc/hosts` entries between marker comments

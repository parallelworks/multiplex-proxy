# Parallel Works Multiplex Proxy

SSH tunnel proxy that multiplexes multiple HTTPS sites through a single local port using SNI-based routing.

## Problem

Accessing multiple HTTPS sites through SSH tunnels requires binding each tunnel to local port 443, but only one process can bind to a port at a time:

```bash
sudo ssh -i ~/.ssh/id_rsa -L 443:app.example.com:443 -o ProxyCommand="ssh -W %h:%p jumpbox" user@jumpbox
sudo ssh -i ~/.ssh/id_rsa -L 443:api.example.com:443 -o ProxyCommand="ssh -W %h:%p jumpbox" user@jumpbox
# ^ can't run both simultaneously
```

## Solution

```
Browser -> /etc/hosts (app.example.com -> 127.0.0.1)
        -> SNI Proxy (:443) inspects TLS ClientHello, extracts hostname
        -> Routes to SSH tunnel on unique local port (e.g. :10443)
        -> SSH forwards to remote app.example.com:443
```

1. Each site gets its own SSH tunnel on a unique local port (10443, 10444, ...)
2. An SNI proxy on port 443 reads the TLS hostname and routes to the correct tunnel
3. `/etc/hosts` entries are auto-managed so domains resolve to `127.0.0.1`

## Setup

```bash
npm install
cp config.yaml.template config.yaml
# Edit config.yaml with your SSH settings and sites
```

## Configuration

Edit `config.yaml` to define your SSH connection and sites:

```yaml
ssh:
  identityFile: ~/.ssh/id_rsa
  user: username
  jumpHost: jumpbox
  proxyCommand: "ssh -W %h:%p jumpbox"

sites:
  - host: app.example.com
    port: 443
    localPort: 10443
  - host: api.example.com
    port: 443
    localPort: 10444
```

Each site needs a unique `localPort`. The `config.yaml` file is gitignored to keep credentials out of version control.

## Usage

```bash
# Start (requires sudo for port 443 and /etc/hosts)
sudo node index.js

# Stop: Ctrl+C (cleans up /etc/hosts and kills SSH tunnels)
```

## How It Works

- **index.js** - Loads config, orchestrates startup/shutdown
- **sni-proxy.js** - TCP server on :443 that parses TLS ClientHello SNI extension to route connections
- **tunnel-manager.js** - Spawns and monitors SSH tunnel processes, auto-restarts on failure
- **hosts-manager.js** - Adds/removes `/etc/hosts` entries bracketed by marker comments

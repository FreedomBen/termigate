# Phase 14: Deployment & Release

## Goal
Prepare the application for production deployment: Mix release configuration, systemd service file, Docker support, runtime configuration, and deployment documentation. After this phase, the app can be deployed as a single binary with zero infrastructure dependencies beyond tmux.

## Dependencies
- All previous phases complete

## Steps

### 14.1 Mix Release Configuration

**`server/mix.exs`** release config:
```elixir
def project do
  [
    # ...
    releases: [
      termigate: [
        include_erts: true  # Bundle Erlang runtime
        # Cookie is set via RELEASE_COOKIE env var at runtime, not hardcoded
      ]
    ]
  ]
end
```

### 14.2 Runtime Configuration

**`server/config/runtime.exs`** — all environment-dependent config:
```elixir
import Config

if config_env() == :prod do
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise "SECRET_KEY_BASE not set"

  host = System.get_env("PHX_HOST") || "localhost"
  port = String.to_integer(System.get_env("PORT") || "4000")
  bind_ip = if System.get_env("PHX_BIND") == "0.0.0.0", do: {0, 0, 0, 0}, else: {127, 0, 0, 1}

  config :termigate, TermigateWeb.Endpoint,
    url: [host: host, port: port],
    http: [ip: bind_ip, port: port],
    secret_key_base: secret_key_base,
    server: true

  # Optional auth token for headless setups
  config :termigate,
    auth_token: System.get_env("TERMIGATE_AUTH_TOKEN")

  # Optional tmux socket
  if socket = System.get_env("TERMIGATE_TMUX_SOCKET") do
    config :termigate, tmux_socket: socket
  end
end
```

### 14.3 Asset Build

Production asset pipeline:
```bash
# In CI or build script (run from server/ directory):
cd server
cd assets && npm ci
cd ..
MIX_ENV=prod mix assets.deploy  # Builds + digests JS/CSS
```

Ensure `esbuild` and `tailwind` are configured for production minification.

### 14.4 Build Script

**`bin/build-release.sh`**:
```bash
#!/bin/bash
set -e

export MIX_ENV=prod

cd server

echo "==> Installing dependencies"
mix deps.get --only prod

echo "==> Compiling"
mix compile

echo "==> Building assets"
cd assets && npm ci && cd ..
mix assets.deploy

echo "==> Building release"
mix release

echo "==> Release built at server/_build/prod/rel/termigate/"
```

### 14.5 Systemd Service

**`deploy/termigate.service`**:
```ini
[Unit]
Description=termigate — Remote terminal manager
After=network.target

[Service]
Type=exec
User=ben
Group=ben
WorkingDirectory=/opt/termigate
Environment=HOME=/home/ben
Environment=PORT=4000
Environment=PHX_HOST=localhost
Environment=SECRET_KEY_BASE=generate-a-secret-key-base-here
# Uncomment for remote access:
# Environment=PHX_BIND=0.0.0.0
# Environment=TERMIGATE_AUTH_TOKEN=your-secure-token
ExecStart=/opt/termigate/bin/termigate start
ExecStop=/opt/termigate/bin/termigate stop
Restart=on-failure
RestartSec=5
# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/tmp/termigate /home/ben/.config/termigate
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
```

Installation:
```bash
sudo cp deploy/termigate.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable termigate
sudo systemctl start termigate
```

### 14.6 Docker Support

**`Dockerfile`**:
```dockerfile
# Build stage
FROM elixir:1.17-slim AS build

RUN apt-get update && apt-get install -y git nodejs npm && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV MIX_ENV=prod

COPY server/mix.exs server/mix.lock ./server/
RUN cd server && mix deps.get --only prod && mix deps.compile

COPY server/assets/package.json server/assets/package-lock.json ./server/assets/
RUN cd server/assets && npm ci

COPY server/ ./server/
RUN cd server && mix assets.deploy && mix release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends tmux locales && \
    rm -rf /var/lib/apt/lists/* && \
    sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

COPY --from=build /app/server/_build/prod/rel/termigate /app

EXPOSE 4000

CMD ["/app/bin/termigate", "start"]
```

**Docker deployment modes**:

The Dockerfile installs tmux inside the container, so the default mode runs tmux sessions *inside* the container. To connect to **host** tmux sessions instead, mount the host's tmux socket and set `TERMIGATE_TMUX_SOCKET`.

**UID/GID mapping for host tmux access**: The container must run as the same UID as the host user who owns the tmux socket. Use `--user $(id -u):$(id -g)` when running the container, or set `user:` in docker-compose. The tmux socket is typically at `/tmp/tmux-{UID}/default` and is only readable by the owning user.

**`docker-compose.yml`** (optional, for easy testing):
```yaml
services:
  termigate:
    build: .
    ports:
      - "4000:4000"
    environment:
      - SECRET_KEY_BASE=generate-me
      - PORT=4000
      - PHX_HOST=localhost
      # Uncomment for host tmux access:
      # - TERMIGATE_TMUX_SOCKET=/tmp/tmux-host/default
    # user: "1000:1000"  # Must match host UID:GID for tmux socket access
    # volumes:
      # Uncomment for host tmux access (replace 1000 with your UID):
      # - /tmp/tmux-1000:/tmp/tmux-host
```

### 14.7 Configuration Precedence

When the same setting can be specified in multiple places, the precedence order is:

1. **Environment variables** (highest priority) — e.g., `TERMIGATE_AUTH_TOKEN`, `PORT`, `PHX_HOST`
2. **YAML config file** (`~/.config/termigate/config.yaml`) — quick actions, app settings
3. **`server/config/runtime.exs`** compile-time defaults (lowest priority)

This is enforced in `server/config/runtime.exs` by only reading env vars with `||` fallbacks, and in the `Config` GenServer by merging YAML values over defaults. Environment variables always win because they're read in `runtime.exs` before the Config GenServer starts.

### 14.8 CORS Configuration

For deployments where native clients or external tools access the REST API from a different origin:

- By default, no CORS headers are set (same-origin only)
- If `TERMIGATE_CORS_ORIGIN` env var is set, add CORS headers via a Plug:
  ```elixir
  # In endpoint.ex or a dedicated plug:
  if origin = Application.get_env(:termigate, :cors_origin) do
    plug Corsica, origins: origin, allow_headers: ["authorization", "content-type"]
  end
  ```
- For single-origin deployments: `TERMIGATE_CORS_ORIGIN=https://my-app.example.com`
- For development: `TERMIGATE_CORS_ORIGIN=*`
- Add `{:corsica, "~> 2.0"}` to deps in `server/mix.exs` (Phase 1)

Note: WebSocket connections (LiveView and Channels) are not affected by CORS — they use the `check_origin` setting on the endpoint, which is already configured by Phoenix.

### 14.9 BEAM Distribution Safety

Ensure production release does NOT enable BEAM distribution:
- Default `mix release` config does not start EPMD or distributed Erlang
- Verify: the release should start with `--no-epmd` by default
- If remote debugging is needed, use `--remsh` over SSH, not network distribution

### 14.10 Secret Key Generation

Document how to generate `SECRET_KEY_BASE`:
```bash
cd server && mix phx.gen.secret
# Or:
openssl rand -base64 64
```

### 14.11 HTTPS Configuration Options

Document the three deployment options for remote access:

1. **Reverse proxy (nginx/Caddy)**: App stays HTTP, proxy handles TLS
2. **Phoenix direct TLS**: Configure `:https` in endpoint with cert/key paths
3. **Tailscale/WireGuard**: VPN access, no public exposure, app stays HTTP

Example configs for option 1:

**Caddy** (recommended — automatic HTTPS via Let's Encrypt):
```
termigate.example.com {
  reverse_proxy localhost:4000
}
```

**nginx**:
```nginx
server {
    listen 443 ssl;
    server_name termigate.example.com;

    ssl_certificate /etc/letsencrypt/live/termigate.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/termigate.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;  # WebSocket keep-alive (24h)
    }
}
```

Note: WebSocket support (`Upgrade`/`Connection` headers) is critical — both LiveView and Channels use WebSockets. The `proxy_read_timeout` must be long enough to keep idle WebSocket connections alive.

### 14.12 Health Check Integration

- systemd: use `ExecStartPost` with curl to `/healthz` or `Type=notify` with health checks
- Docker: `HEALTHCHECK CMD curl -f http://localhost:4000/healthz || exit 1`
- Reverse proxy: upstream health check to `/healthz`

### 14.13 Logging

- Ensure meaningful actions are logged (startup, auth events, pane stream lifecycle)
- Production log level: `:info` (configurable via `LOGGER_LEVEL` env var)
- Structured logging format for log aggregation (optional: `logger_json` dependency)
- **Key events to log** (at `:info` level):
  - Application startup (bind address, auth mode, tmux version)
  - Authentication events (login success/failure — log IP, not password)
  - PaneStream lifecycle (start, subscriber count changes, grace period, shutdown)
  - Config file changes (loaded, reloaded, malformed)
- **Warning-level events**: auth disabled on 0.0.0.0, malformed config, rate limit table flush
- **Debug-level events**: individual tmux commands (useful for troubleshooting, noisy in production)

## Files Created/Modified
```
server/mix.exs (release config)
server/config/runtime.exs (production config)
bin/build-release.sh
deploy/termigate.service
Dockerfile
docker-compose.yml (optional)
.dockerignore
```

## Exit Criteria
- `cd server && MIX_ENV=prod mix release` builds a self-contained release
- Release starts with `bin/termigate start` — serves the app
- systemd service file installs and works
- Docker image builds and runs (with tmux inside container)
- Health check endpoint responds correctly in production
- `SECRET_KEY_BASE` required in prod (errors clearly if missing)
- Auth token configurable via env var
- BEAM distribution disabled in production
- App starts cleanly, logs meaningful startup info

## Checklist
- [x] 14.1 Mix Release Configuration
- [x] 14.2 Runtime Configuration
- [x] 14.3 Asset Build
- [x] 14.4 Build Script
- [x] 14.5 Systemd Service
- [x] 14.6 Docker Support
- [x] 14.7 Configuration Precedence
- [x] 14.8 CORS Configuration
- [x] 14.9 BEAM Distribution Safety
- [x] 14.10 Secret Key Generation
- [x] 14.11 HTTPS Configuration Options
- [x] 14.12 Health Check Integration
- [x] 14.13 Logging

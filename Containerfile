# syntax=docker/dockerfile:1.26@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32
# Development container for the browser-only UI, see `compose.yaml`.
#
# Base images are pinned by the digest of their multi-architecture index, so a tag cannot be
# repointed at different content and amd64 and arm64 hosts still build natively. The reference
# stays in `FROM`, which is the only place Dependabot's `docker` ecosystem discovers it.

# The toolchain is copied from the official Rust image instead of piping https://sh.rustup.rs
# into a shell, which executes unverified remote code and pins nothing.
FROM docker.io/library/rust:1.98-bookworm@sha256:82150a52ec202c1b14d7817e14516c392bb7f5cfebd88f1ed531cb37ebd39922 AS rust

FROM docker.io/library/node:26-bookworm-slim@sha256:367679cf9792759492a486e4aa4b421764d71a9546a6dae8aab81a99eb797b3e

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    git \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.1-dev \
    patchelf \
  && rm -rf /var/lib/apt/lists/*

# `CARGO_HOME` is the only writable part of the toolchain and lives in the home directory of
# `node`; the compiler itself stays outside it.
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/home/node/.cargo \
    PATH=/usr/local/cargo/bin:${PATH} \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=rust /usr/local/rustup /usr/local/rustup
COPY --from=rust /usr/local/cargo /usr/local/cargo
# The Rust image leaves both trees world-writable, which would let any process in the
# container replace the compiler. They stay root-owned and read-only for `node`.
RUN chmod -R go-w /usr/local/rustup /usr/local/cargo \
  && install -d -o node -g node /home/node/.cargo /home/node/.cargo/registry \
    /workspace/node_modules /home/node/.local/share

WORKDIR /workspace
RUN chown node:node /workspace

# Everything below runs as the unprivileged `node` user (uid 1000): a compromise of the dev
# server or of a dependency does not start out as root inside the container.
USER node

COPY --chown=node:node package.json package-lock.json ./
# `--ignore-scripts` stops install-time lifecycle scripts of any transitive dependency from
# executing arbitrary code during the build.
RUN npm ci --ignore-scripts

COPY --chown=node:node . .

EXPOSE 1420
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:1420/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# `--host 0.0.0.0` is required to reach the server through the published port; `compose.yaml`
# publishes it on the loopback interface only.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

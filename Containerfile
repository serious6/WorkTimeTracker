# syntax=docker/dockerfile:1
# Development container for the browser-only UI, see `compose.yaml`.
#
# Base images are pinned by digest so that a rebuild is reproducible and a tag cannot be
# repointed at different content; Dependabot's `docker` ecosystem raises the updates.
ARG NODE_IMAGE=docker.io/library/node:26-bookworm-slim@sha256:27f5e13512830beb5d9a574108daa6701a0a0b91528aeaf1ee84ecdcddaeeaae
ARG RUST_IMAGE=docker.io/library/rust:1.98-bookworm@sha256:4e4a7e7939c17991ab35f2b8c2e67593980f771d28f6b1254b1850f860fd0c7f

# The toolchain is copied from the official Rust image instead of piping https://sh.rustup.rs
# into a shell, which executes unverified remote code and pins nothing.
FROM ${RUST_IMAGE} AS rust

FROM ${NODE_IMAGE}

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

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:${PATH} \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=rust --chown=node:node /usr/local/rustup /usr/local/rustup
COPY --from=rust --chown=node:node /usr/local/cargo /usr/local/cargo
# The Rust image leaves both trees world-writable, which would let any process in the
# container replace the compiler.
RUN chmod -R go-w /usr/local/rustup /usr/local/cargo \
  && install -d -o node -g node /usr/local/cargo/registry /workspace/node_modules /home/node/.local/share

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

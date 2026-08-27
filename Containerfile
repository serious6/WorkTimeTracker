FROM node:26-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.1-dev \
    patchelf \
  && rm -rf /var/lib/apt/lists/* \
  && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal

ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

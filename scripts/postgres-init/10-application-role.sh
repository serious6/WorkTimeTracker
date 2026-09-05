#!/bin/sh
# Creates the role the application connects as, once, while the compose
# database initialises its data directory.
#
# `POSTGRES_USER` is the bootstrap role of the cluster and therefore a
# superuser, and a superuser bypasses row level security. The policies in
# `drizzle/0000_init.sql` are only worth anything to a role that cannot, so
# the application gets its own role that may log in, create its schema and
# create the throwaway databases of the test suite, and nothing else.
set -eu

: "${POSTGRES_APP_USER:=worktimetracker_app}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD must be set in .env}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v app_user="$POSTGRES_APP_USER" \
  -v app_password="$POSTGRES_APP_PASSWORD" \
  -v database="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEROLE
  -- The Rust tests create and drop a throwaway database of their own.
  CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE :"database" TO :"app_user";
SQL

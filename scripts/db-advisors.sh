#!/usr/bin/env bash
# Runs the Supabase advisor lints (scripts/sql/splinter.sql) against a database and fails if any
# WARN or ERROR is found. INFO findings (e.g. unused indexes on an empty database) are listed only.
# Usage: pnpm db:advisors            (local Supabase)
#        SUPABASE_DB_URL=... pnpm db:advisors
set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
SPLINTER="$(dirname "$0")/sql/splinter.sql"
# The vendored file starts with 3 comment lines, then a prelude (search_path + one DO block)
# and the lint query itself, which begins at the first line that is exactly "(".
QUERY_START=$(grep -n '^($' "$SPLINTER" | head -1 | cut -d: -f1)

{
  echo "begin;"
  echo "set local pgrst.db_schemas = 'public';"
  head -n $((QUERY_START - 1)) "$SPLINTER"
  echo "create temp table lints on commit drop as"
  tail -n +"$QUERY_START" "$SPLINTER"
  echo ";"
  echo "\\echo"
  echo "select level, name, count(*) as findings from lints group by 1, 2 order by 1, 2;"
  echo "select level || ' ' || name || ': ' || detail as problem from lints"
  echo " where level in ('WARN', 'ERROR') order by 1;"
  echo "select count(*) as blocking from lints where level in ('WARN', 'ERROR') \\gset"
  echo "rollback;"
  echo "\\if :blocking"
  echo "  \\echo 'Advisor found' :blocking 'warning(s) or error(s).'"
  echo "  select 1 / 0 as advisor_failed;"
  echo "\\else"
  echo "  \\echo 'Advisor: no warnings or errors.'"
  echo "\\endif"
} | psql "$DB_URL" -X -q -v ON_ERROR_STOP=1

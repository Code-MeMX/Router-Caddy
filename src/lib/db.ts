/*
  Copyright (C) 2026 Code Me <licences@code-me.club>

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import postgres from "postgres";

const globalForSql = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
  initialized: boolean | undefined;
};

function createPostgresClient() {
  const connectionUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (connectionUrl) {
    return postgres(connectionUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 5,
    });
  }

  const host = process.env.POSTGRES_HOST || process.env.PGHOST || "localhost";
  const port = Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432);
  const database =
    process.env.POSTGRES_DB || process.env.PGDATABASE || "router_caddy";
  const username =
    process.env.POSTGRES_USER || process.env.PGUSER || "postgres";
  const password =
    process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "postgres";
  const ssl =
    process.env.POSTGRES_SSL === "true" || process.env.PGSSLMODE === "require"
      ? "require"
      : false;

  return postgres({
    host,
    port,
    database,
    username,
    password,
    ssl,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
  });
}

export const sql = globalForSql.sql ?? createPostgresClient();

if (process.env.NODE_ENV !== "production") {
  globalForSql.sql = sql;
}

export interface ValidationEndpoint {
  id: number;
  name: string;
  url_template: string;
  http_method: "GET" | "POST";
  headers: Record<string, string>;
  expected_status: number;
  expected_body_contains: string | null;
  expected_json_key: string | null;
  expected_json_value: string | null;
  timeout_ms: number;
  priority: number;
  enabled: boolean;
  created_at: string;
}

export interface ValidationLog {
  id: number;
  domain: string;
  allowed: boolean;
  matched_endpoint_id: number | null;
  matched_endpoint_name: string | null;
  response_status: number | null;
  duration_ms: number;
  details: string | null;
  created_at: string;
}

export async function ensureSchema(): Promise<void> {
  if (globalForSql.initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS validation_endpoints (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url_template TEXT NOT NULL,
      http_method TEXT NOT NULL DEFAULT 'GET',
      headers JSONB NOT NULL DEFAULT '{}'::jsonb,
      expected_status INTEGER NOT NULL DEFAULT 200,
      expected_body_contains TEXT,
      expected_json_key TEXT,
      expected_json_value TEXT,
      timeout_ms INTEGER NOT NULL DEFAULT 3000,
      priority INTEGER NOT NULL DEFAULT 10,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS validation_logs (
      id SERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      allowed BOOLEAN NOT NULL,
      matched_endpoint_id INTEGER REFERENCES validation_endpoints(id) ON DELETE SET NULL,
      matched_endpoint_name TEXT,
      response_status INTEGER,
      duration_ms INTEGER NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_validation_endpoints_priority
    ON validation_endpoints (enabled, priority ASC, id ASC);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_validation_logs_created_at
    ON validation_logs (created_at DESC);
  `;

  globalForSql.initialized = true;
}


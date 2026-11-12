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

import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql, ValidationEndpoint } from "@/lib/db";

export async function GET() {
  try {
    await ensureSchema();
    const endpoints = await sql<ValidationEndpoint[]>`
      SELECT *
      FROM validation_endpoints
      ORDER BY priority ASC, id ASC
    `;
    return NextResponse.json({ endpoints });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Database error",
        message: err instanceof Error ? err.message : "Could not connect to PostgreSQL",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json();

    const name = String(body.name || "").trim();
    const url_template = String(body.url_template || "").trim();
    const http_method = body.http_method === "POST" ? "POST" : "GET";
    const expected_status = Number(body.expected_status) || 200;
    const expected_body_contains = body.expected_body_contains
      ? String(body.expected_body_contains).trim()
      : null;
    const expected_json_key = body.expected_json_key
      ? String(body.expected_json_key).trim()
      : null;
    const expected_json_value = body.expected_json_value
      ? String(body.expected_json_value).trim()
      : null;
    const timeout_ms = Math.min(Math.max(Number(body.timeout_ms) || 3000, 200), 30000);
    const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 10;
    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : true;
    const headers =
      body.headers && typeof body.headers === "object" && !Array.isArray(body.headers)
        ? body.headers
        : {};

    if (!name || !url_template) {
      return NextResponse.json(
        { error: "Nombre y URL son obligatorios" },
        { status: 400 }
      );
    }

    try {
      new URL(
        url_template
          .replaceAll("{dominio}", "example.com")
          .replaceAll("{domain}", "example.com")
      );
    } catch {
      return NextResponse.json(
        { error: "Formato de URL inválido. Incluye http:// o https://" },
        { status: 400 }
      );
    }

    const [created] = await sql<ValidationEndpoint[]>`
      INSERT INTO validation_endpoints (
        name,
        url_template,
        http_method,
        headers,
        expected_status,
        expected_body_contains,
        expected_json_key,
        expected_json_value,
        timeout_ms,
        priority,
        enabled
      ) VALUES (
        ${name},
        ${url_template},
        ${http_method},
        ${sql.json(headers)},
        ${expected_status},
        ${expected_body_contains},
        ${expected_json_key},
        ${expected_json_value},
        ${timeout_ms},
        ${priority},
        ${enabled}
      )
      RETURNING *
    `;

    return NextResponse.json({ endpoint: created }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Error al guardar endpoint",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


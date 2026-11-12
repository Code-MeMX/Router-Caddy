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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema();
    const { id } = await params;
    const endpointId = Number(id);
    if (!Number.isInteger(endpointId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();

    const [existing] = await sql<ValidationEndpoint[]>`
      SELECT * FROM validation_endpoints WHERE id = ${endpointId}
    `;
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    const url_template =
      body.url_template !== undefined
        ? String(body.url_template).trim()
        : existing.url_template;
    const http_method =
      body.http_method !== undefined
        ? body.http_method === "POST"
          ? "POST"
          : "GET"
        : existing.http_method;
    const expected_status =
      body.expected_status !== undefined
        ? Number(body.expected_status)
        : existing.expected_status;
    const expected_body_contains =
      body.expected_body_contains !== undefined
        ? body.expected_body_contains
          ? String(body.expected_body_contains).trim()
          : null
        : existing.expected_body_contains;
    const expected_json_key =
      body.expected_json_key !== undefined
        ? body.expected_json_key
          ? String(body.expected_json_key).trim()
          : null
        : existing.expected_json_key;
    const expected_json_value =
      body.expected_json_value !== undefined
        ? body.expected_json_value
          ? String(body.expected_json_value).trim()
          : null
        : existing.expected_json_value;
    const timeout_ms =
      body.timeout_ms !== undefined
        ? Math.min(Math.max(Number(body.timeout_ms) || 3000, 200), 30000)
        : existing.timeout_ms;
    const priority =
      body.priority !== undefined ? Number(body.priority) : existing.priority;
    const enabled =
      body.enabled !== undefined ? Boolean(body.enabled) : existing.enabled;
    const headers =
      body.headers !== undefined && typeof body.headers === "object"
        ? body.headers
        : existing.headers;

    const [updated] = await sql<ValidationEndpoint[]>`
      UPDATE validation_endpoints
      SET
        name = ${name},
        url_template = ${url_template},
        http_method = ${http_method},
        headers = ${sql.json(headers)},
        expected_status = ${expected_status},
        expected_body_contains = ${expected_body_contains},
        expected_json_key = ${expected_json_key},
        expected_json_value = ${expected_json_value},
        timeout_ms = ${timeout_ms},
        priority = ${priority},
        enabled = ${enabled}
      WHERE id = ${endpointId}
      RETURNING *
    `;

    return NextResponse.json({ endpoint: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Error actualizando endpoint",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema();
    const { id } = await params;
    const endpointId = Number(id);
    if (!Number.isInteger(endpointId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    await sql`DELETE FROM validation_endpoints WHERE id = ${endpointId}`;
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Error eliminando endpoint",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


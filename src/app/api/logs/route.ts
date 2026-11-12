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
import { ensureSchema, sql, ValidationLog } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await ensureSchema();
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 30, 100);
    const logs = await sql<ValidationLog[]>`
      SELECT *
      FROM validation_logs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ logs });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Error cargando logs",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await ensureSchema();
    await sql`TRUNCATE TABLE validation_logs`;
    return NextResponse.json({ cleared: true });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Error limpiando logs",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


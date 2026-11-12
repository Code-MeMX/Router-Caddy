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
import { validateDomainChain } from "@/lib/validator";

const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  const rawDomain =
    request.nextUrl.searchParams.get("dominio") ??
    request.nextUrl.searchParams.get("domain");
  const domain = rawDomain?.trim().toLowerCase();
  const debug = request.nextUrl.searchParams.get("debug") === "1";

  if (!domain) {
    return NextResponse.json(
      { error: "Falta el parámetro 'dominio' (o 'domain')" },
      { status: 400, headers: PUBLIC_CORS_HEADERS }
    );
  }

  // Reject IPs or malformed domains before hitting upstream backends
  if (!DOMAIN_REGEX.test(domain)) {
    return NextResponse.json(
      { error: "Formato de dominio inválido", dominio: domain },
      { status: 400, headers: PUBLIC_CORS_HEADERS }
    );
  }

  try {
    const result = await validateDomainChain(domain, true);

    if (debug) {
      return NextResponse.json(result, {
        status: result.allowed ? 200 : 403,
        headers: PUBLIC_CORS_HEADERS,
      });
    }

    if (result.allowed) {
      return new NextResponse("OK", {
        status: 200,
        headers: {
          ...PUBLIC_CORS_HEADERS,
          "X-Validated-By": result.matchedEndpoint?.name || "router-caddy",
          "X-Validation-Duration-Ms": String(result.totalDurationMs),
        },
      });
    }

    return new NextResponse("Dominio no autorizado", {
      status: 403,
      headers: {
        ...PUBLIC_CORS_HEADERS,
        "X-Validation-Duration-Ms": String(result.totalDurationMs),
      },
    });
  } catch (err: unknown) {
    console.error("Error in /api/preguntame:", err);
    return NextResponse.json(
      {
        error: "Error interno de validación",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500, headers: PUBLIC_CORS_HEADERS }
    );
  }
}


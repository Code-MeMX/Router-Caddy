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

import { ensureSchema, sql, ValidationEndpoint } from "./db";

export interface EndpointAttemptResult {
  endpointId: number;
  endpointName: string;
  targetUrl: string;
  status: number | null;
  matched: boolean;
  reason: string;
  durationMs: number;
}

export interface DomainValidationResult {
  domain: string;
  allowed: boolean;
  matchedEndpoint: ValidationEndpoint | null;
  responseStatus: number | null;
  totalDurationMs: number;
  attempts: EndpointAttemptResult[];
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function buildTargetUrl(urlTemplate: string, domain: string): string {
  const encoded = encodeURIComponent(domain);
  if (urlTemplate.includes("{dominio}") || urlTemplate.includes("{domain}")) {
    return urlTemplate
      .replaceAll("{dominio}", encoded)
      .replaceAll("{domain}", encoded);
  }
  const parsed = new URL(urlTemplate);
  if (!parsed.searchParams.has("dominio") && !parsed.searchParams.has("domain")) {
    parsed.searchParams.set("dominio", domain);
  }
  return parsed.toString();
}

export async function validateSingleEndpoint(
  endpoint: ValidationEndpoint,
  domain: string
): Promise<EndpointAttemptResult> {
  const start = performance.now();
  let targetUrl = endpoint.url_template;

  try {
    targetUrl = buildTargetUrl(endpoint.url_template, domain);
  } catch {
    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      targetUrl,
      status: null,
      matched: false,
      reason: "URL inválida",
      durationMs: Math.round(performance.now() - start),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), endpoint.timeout_ms || 3000);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
    };

    const fetchOptions: RequestInit = {
      method: endpoint.http_method || "GET",
      headers,
      credentials: "omit",
      signal: controller.signal,
    };

    if (endpoint.http_method === "POST") {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      fetchOptions.body = JSON.stringify({ domain });
    }

    const res = await fetch(targetUrl, fetchOptions);
    const durationMs = Math.round(performance.now() - start);
    const bodyText = await res.text();

    if (res.status !== endpoint.expected_status) {
      return {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        targetUrl,
        status: res.status,
        matched: false,
        reason: `HTTP ${res.status} != esperado ${endpoint.expected_status}`,
        durationMs,
      };
    }

    if (endpoint.expected_body_contains && endpoint.expected_body_contains.trim() !== "") {
      if (!bodyText.includes(endpoint.expected_body_contains)) {
        return {
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          targetUrl,
          status: res.status,
          matched: false,
          reason: `Body no contiene "${endpoint.expected_body_contains}"`,
          durationMs,
        };
      }
    }

    if (endpoint.expected_json_key && endpoint.expected_json_key.trim() !== "") {
      try {
        const json = JSON.parse(bodyText);
        const actualVal = getNestedValue(json, endpoint.expected_json_key.trim());
        const expectedVal = endpoint.expected_json_value ?? "true";
        if (String(actualVal) !== String(expectedVal)) {
          return {
            endpointId: endpoint.id,
            endpointName: endpoint.name,
            targetUrl,
            status: res.status,
            matched: false,
            reason: `JSON ${endpoint.expected_json_key}=${String(actualVal)} != ${expectedVal}`,
            durationMs,
          };
        }
      } catch {
        return {
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          targetUrl,
          status: res.status,
          matched: false,
          reason: "Respuesta no es JSON válido",
          durationMs,
        };
      }
    }

    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      targetUrl,
      status: res.status,
      matched: true,
      reason: `OK (HTTP ${res.status})`,
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      targetUrl,
      status: null,
      matched: false,
      reason: isAbort
        ? `Timeout (${endpoint.timeout_ms}ms)`
        : err instanceof Error
          ? err.message
          : "Error de red",
      durationMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateDomainChain(
  domain: string,
  recordLog = true
): Promise<DomainValidationResult> {
  await ensureSchema();
  const totalStart = performance.now();

  const endpoints = await sql<ValidationEndpoint[]>`
    SELECT *
    FROM validation_endpoints
    WHERE enabled = true
    ORDER BY priority ASC, id ASC
  `;

  const attempts: EndpointAttemptResult[] = [];
  let matchedEndpoint: ValidationEndpoint | null = null;
  let finalStatus: number | null = null;

  for (const endpoint of endpoints) {
    const attempt = await validateSingleEndpoint(endpoint, domain);
    attempts.push(attempt);

    if (attempt.matched) {
      matchedEndpoint = endpoint;
      finalStatus = attempt.status;
      break;
    }
  }

  const totalDurationMs = Math.round(performance.now() - totalStart);
  const allowed = matchedEndpoint !== null;

  if (recordLog) {
    const details =
      attempts.length === 0
        ? "Sin endpoints activos configurados"
        : attempts.map((a) => `${a.endpointName}: ${a.reason} (${a.durationMs}ms)`).join(" | ");

    try {
      await sql`
        INSERT INTO validation_logs (
          domain,
          allowed,
          matched_endpoint_id,
          matched_endpoint_name,
          response_status,
          duration_ms,
          details
        ) VALUES (
          ${domain},
          ${allowed},
          ${matchedEndpoint ? matchedEndpoint.id : null},
          ${matchedEndpoint ? matchedEndpoint.name : null},
          ${finalStatus},
          ${totalDurationMs},
          ${details}
        )
      `;
    } catch (e) {
      console.error("Failed to write validation log:", e);
    }
  }

  return {
    domain,
    allowed,
    matchedEndpoint,
    responseStatus: finalStatus,
    totalDurationMs,
    attempts,
  };
}


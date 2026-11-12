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

"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  ArrowUpDown,
  Terminal,
  RefreshCw,
  Power,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";

interface ValidationEndpoint {
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

interface ValidationLog {
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

interface EndpointAttemptResult {
  endpointId: number;
  endpointName: string;
  targetUrl: string;
  status: number | null;
  matched: boolean;
  reason: string;
  durationMs: number;
}

interface SimulationResponse {
  domain: string;
  allowed: boolean;
  matchedEndpoint: ValidationEndpoint | null;
  responseStatus: number | null;
  totalDurationMs: number;
  attempts: EndpointAttemptResult[];
}

export default function HomePage() {
  const [endpoints, setEndpoints] = useState<ValidationEndpoint[]>([]);
  const [logs, setLogs] = useState<ValidationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [urlTemplate, setUrlTemplate] = useState("");
  const [httpMethod, setHttpMethod] = useState<"GET" | "POST">("GET");
  const [expectedStatus, setExpectedStatus] = useState(200);
  const [expectedBodyContains, setExpectedBodyContains] = useState("");
  const [expectedJsonKey, setExpectedJsonKey] = useState("");
  const [expectedJsonValue, setExpectedJsonValue] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(3000);
  const [priority, setPriority] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Simulator state
  const [testDomain, setTestDomain] = useState("cliente1.midominio.com");
  const [testing, setTesting] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResponse | null>(null);
  const [copiedCaddy, setCopiedCaddy] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [epRes, logRes] = await Promise.all([
        fetch("/api/endpoints"),
        fetch("/api/logs?limit=25"),
      ]);

      const epData = await epRes.json();
      if (!epRes.ok) {
        setDbError(epData.message || epData.error || "Error conectando a PostgreSQL");
      } else {
        setDbError(null);
        setEndpoints(epData.endpoints || []);
      }

      if (logRes.ok) {
        const logData = await logRes.json();
        setLogs(logData.logs || []);
      }
    } catch (err: unknown) {
      setDbError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleAddEndpoint(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    try {
      setSubmitting(true);
      const res = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url_template: urlTemplate,
          http_method: httpMethod,
          expected_status: Number(expectedStatus),
          expected_body_contains: expectedBodyContains || null,
          expected_json_key: expectedJsonKey || null,
          expected_json_value: expectedJsonValue || null,
          timeout_ms: Number(timeoutMs),
          priority: Number(priority),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || data.message || "Error al crear URL");
        return;
      }

      setName("");
      setUrlTemplate("");
      setExpectedStatus(200);
      setExpectedBodyContains("");
      setExpectedJsonKey("");
      setExpectedJsonValue("");
      await fetchAll();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleEndpoint(ep: ValidationEndpoint) {
    await fetch(`/api/endpoints/${ep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !ep.enabled }),
    });
    await fetchAll();
  }

  async function handleDeleteEndpoint(id: number) {
    await fetch(`/api/endpoints/${id}`, { method: "DELETE" });
    await fetchAll();
  }

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    if (!testDomain.trim()) return;
    setTesting(true);
    setSimResult(null);
    try {
      const res = await fetch(
        `/api/preguntame?dominio=${encodeURIComponent(testDomain.trim())}&debug=1`
      );
      const data = await res.json();
      setSimResult(data);
      await fetchAll();
    } finally {
      setTesting(false);
    }
  }

  async function handleClearLogs() {
    await fetch("/api/logs", { method: "DELETE" });
    await fetchAll();
  }

  const caddyfileSnippet = `{
  on_demand_tls {
    ask http://localhost:3000/api/preguntame
  }
}

https:// {
  tls {
    on_demand
  }
  reverse_proxy localhost:8080
}`;

  function copySnippet() {
    navigator.clipboard.writeText(caddyfileSnippet);
    setCopiedCaddy(true);
    setTimeout(() => setCopiedCaddy(false), 2000);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Caddy On-Demand TLS Router
            </h1>
            <p className="text-sm text-slate-400">
              Validador multiinquilino en cadena para emisión de certificados SSL (`GET /api/preguntame?dominio=...` o `/preguntame?dominio=...`)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAll}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </header>

      {/* Database warning banner */}
      {dbError && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3 text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-amber-300">
              No se pudo conectar a PostgreSQL
            </p>
            <p className="text-amber-200/80 font-mono text-xs">{dbError}</p>
            <p className="text-xs text-amber-200/70">
              Asegúrate de tener PostgreSQL corriendo y configura{" "}
              <code className="px-1.5 py-0.5 rounded bg-amber-950/60">DATABASE_URL</code> en{" "}
              <code className="px-1.5 py-0.5 rounded bg-amber-950/60">.env</code> (o levanta con{" "}
              <code className="px-1.5 py-0.5 rounded bg-amber-950/60">docker compose up -d</code>).
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Add URL Form + Simulator */}
        <div className="lg:col-span-5 space-y-6">
          {/* Add Endpoint Card */}
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-emerald-400" />
              Agregar URL de Validación
            </h2>

            <form onSubmit={handleAddEndpoint} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Nombre del Servicio / Inquilino
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. SaaS Principal / Plataforma E-commerce"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  URL de Llamada
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://api.miapp.com/domains/verify?dominio={dominio}"
                  value={urlTemplate}
                  onChange={(e) => setUrlTemplate(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Usa <code className="text-emerald-400">{"{dominio}"}</code> (o <code className="text-emerald-400">{"{domain}"}</code>) donde quieras inyectar el dominio, o se añadirá{" "}
                  <code className="text-slate-400">?dominio=</code> automáticamente.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Método HTTP
                  </label>
                  <select
                    value={httpMethod}
                    onChange={(e) => setHttpMethod(e.target.value as "GET" | "POST")}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Status Esperado
                  </label>
                  <input
                    type="number"
                    required
                    min={100}
                    max={599}
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(Number(e.target.value))}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Orden (Prioridad)
                  </label>
                  <input
                    type="number"
                    required
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
              >
                {showAdvanced
                  ? "− Ocultar validación opcional de Body / JSON"
                  : "+ Configurar respuesta esperada en Body / JSON (opcional)"}
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-2 border-t border-slate-800/80">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        JSON Key (opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="ej. data.valid"
                        value={expectedJsonKey}
                        onChange={(e) => setExpectedJsonKey(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        JSON Valor Esperado
                      </label>
                      <input
                        type="text"
                        placeholder="ej. true"
                        value={expectedJsonValue}
                        onChange={(e) => setExpectedJsonValue(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Body contiene texto
                      </label>
                      <input
                        type="text"
                        placeholder="ej. ALLOWED"
                        value={expectedBodyContains}
                        onChange={(e) => setExpectedBodyContains(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Timeout (ms)
                      </label>
                      <input
                        type="number"
                        min={200}
                        max={30000}
                        value={timeoutMs}
                        onChange={(e) => setTimeoutMs(Number(e.target.value))}
                        className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {formError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold py-2.5 text-sm transition"
              >
                <Plus className="w-4 h-4" />
                {submitting ? "Guardando..." : "Guardar URL en la Cadena"}
              </button>
            </form>
          </section>

          {/* Live Domain Simulator */}
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Play className="w-5 h-5 text-sky-400" />
              Probar Validación de Dominio
            </h2>
            <form onSubmit={handleSimulate} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="cliente.midominio.com"
                value={testDomain}
                onChange={(e) => setTestDomain(e.target.value)}
                className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={testing}
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition"
              >
                {testing ? "Probando..." : "Simular /preguntame"}
              </button>
            </form>

            {simResult && (
              <div
                className={`rounded-xl p-4 border text-xs space-y-2 ${
                  simResult.allowed
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-200"
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    {simResult.allowed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    {simResult.allowed
                      ? "200 OK — Certificado Autorizado"
                      : "403 Forbidden — Certificado Denegado"}
                  </span>
                  <span className="font-mono text-slate-400">
                    {simResult.totalDurationMs}ms
                  </span>
                </div>

                {simResult.attempts && simResult.attempts.length > 0 ? (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                    {simResult.attempts.map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 font-mono text-[11px]"
                      >
                        <span className="truncate">
                          #{idx + 1} {a.endpointName}: {a.reason}
                        </span>
                        <span className="text-slate-400 shrink-0">{a.durationMs}ms</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">No hay URLs activas en la cadena.</p>
                )}
              </div>
            )}
          </section>

          {/* Caddyfile config reference */}
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Ejemplo Caddyfile
              </h2>
              <button
                onClick={copySnippet}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
              >
                {copiedCaddy ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </>
                )}
              </button>
            </div>
            <pre className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-xs font-mono text-emerald-300 overflow-x-auto">
              {caddyfileSnippet}
            </pre>
          </section>
        </div>

        {/* Right Column: Chain List + Recent Validation Logs */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Chain List */}
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 text-emerald-400" />
                  Cadena de URLs Configuradas ({endpoints.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Se consultan en orden de prioridad hasta que una devuelva la respuesta esperada.
                </p>
              </div>
            </div>

            {endpoints.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-400 text-sm">
                No hay URLs registradas todavía. Agrega la primera URL en el panel izquierdo.
              </div>
            ) : (
              <div className="space-y-3">
                {endpoints.map((ep, index) => (
                  <div
                    key={ep.id}
                    className={`rounded-xl border p-4 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      ep.enabled
                        ? "bg-slate-950/90 border-slate-800"
                        : "bg-slate-950/40 border-slate-800/50 opacity-60"
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-xs">
                          #{index + 1} (Prio {ep.priority})
                        </span>
                        <span className="font-semibold text-white text-sm">
                          {ep.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-xs">
                          {ep.http_method} → HTTP {ep.expected_status}
                        </span>
                        {ep.expected_json_key && (
                          <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono text-xs">
                            JSON: {ep.expected_json_key}={ep.expected_json_value ?? "true"}
                          </span>
                        )}
                        {ep.expected_body_contains && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-xs">
                            Body: &quot;{ep.expected_body_contains}&quot;
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-slate-400 break-all flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        {ep.url_template}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleEndpoint(ep)}
                        title={ep.enabled ? "Desactivar URL" : "Activar URL"}
                        className={`p-2 rounded-lg border text-xs transition ${
                          ep.enabled
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEndpoint(ep.id)}
                        title="Eliminar URL"
                        className="p-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Validation History */}
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-sky-400" />
                  Historial de Consultas de Caddy
                </h2>
                <p className="text-xs text-slate-400">
                  Últimas solicitudes recibidas en <code className="text-slate-300">/api/preguntame</code> y <code className="text-slate-300">/preguntame</code>
                </p>
              </div>
              {logs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="text-xs text-slate-400 hover:text-rose-400 transition"
                >
                  Limpiar historial
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-500 text-sm">
                Aún no se han registrado consultas de dominios.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 pr-3">Estado</th>
                      <th className="py-2.5 px-3">Dominio</th>
                      <th className="py-2.5 px-3">Autorizado por</th>
                      <th className="py-2.5 px-3">Latencia</th>
                      <th className="py-2.5 pl-3 text-right">Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 pr-3">
                          {log.allowed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">
                              <CheckCircle2 className="w-3 h-3" /> 200 OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 font-mono">
                              <XCircle className="w-3 h-3" /> 403
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-white">
                          {log.domain}
                        </td>
                        <td
                          className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate"
                          title={log.details || ""}
                        >
                          {log.matched_endpoint_name || (
                            <span className="text-slate-500">Ninguno</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {log.duration_ms}ms
                        </td>
                        <td className="py-2.5 pl-3 font-mono text-slate-500 text-right">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Footer / Attribution */}
      <footer className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500">
        Copyright © 2026 <span className="text-slate-300 font-medium">Cesar Ayar</span> — Licenciado bajo{" "}
        <span className="text-emerald-400/90 font-mono">GNU AGPL v3.0</span>
      </footer>
    </div>
  );
}


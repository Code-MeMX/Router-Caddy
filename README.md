# Router Caddy — Validador On-Demand TLS Multiinquilino

Microservicio y panel de administración construido con **Bun + Next.js (TypeScript) + PostgreSQL** para gestionar la validación dinámica de dominios (`on_demand_tls`) en servidores **Caddy**.

Permite que múltiples plataformas o aplicaciones SaaS (multiinquilino / multi-tenant) compartan una misma instancia de Caddy y autoricen la emisión automática de certificados SSL (Let's Encrypt / ZeroSSL) consultando una cadena priorizada de endpoints HTTP sin requerir autenticación.

---

## Tabla de Contenidos

1. [Arquitectura y Flujo de Validación](#arquitectura-y-flujo-de-validación)
2. [Características Principales](#características-principales)
3. [Requisitos Previos](#requisitos-previos)
4. [Variables de Entorno](#variables-de-entorno)
5. [Instalación y Despliegue](#instalación-y-despliegue)
   - [Con Docker Compose (Recomendado)](#con-docker-compose-recomendado)
   - [Desde GitHub Container Registry (GHCR)](#desde-github-container-registry-ghcr)
   - [Entorno de Desarrollo Local con Bun](#entorno-de-desarrollo-local-con-bun)
6. [Configuración en Caddy (`Caddyfile`)](#configuración-en-caddy-caddyfile)
7. [Cómo Configurar URLs y Respuestas Esperadas](#cómo-configurar-urls-y-respuestas-esperadas)
8. [Referencia de la API](#referencia-de-la-api)
9. [Esquema de Base de Datos](#esquema-de-base-de-datos)
10. [CI/CD y Publicación Automática](#cicd-y-publicación-automática)
11. [Autoría y Licencia](#autoría-y-licencia)

---

## Arquitectura y Flujo de Validación

Cuando un usuario visita por primera vez un dominio personalizado (ej. `tienda.cliente.com`) apuntando a Caddy:

```text
[Cliente HTTPS]
      │ 1. TLS Handshake (SNI: tienda.cliente.com)
      ▼
  [Caddy]
      │ 2. GET /api/preguntame?dominio=tienda.cliente.com
      ▼
[Router Caddy] ──► Consulta PostgreSQL (endpoints activos ordenados por prioridad)
      │
      ├──► #1 (Prioridad 1) GET https://saas-a.interno/verify?dominio=tienda.cliente.com
      │       └─► Responde 404 (No coincide con 200 esperado → continúa al siguiente)
      │
      ├──► #2 (Prioridad 2) GET https://saas-b.interno/domains/tienda.cliente.com
      │       └─► Responde 200 OK (¡Coincide!)
      ▼
[Router Caddy] ──► Registra auditoría en PostgreSQL y responde 200 OK a Caddy
      │
      ▼
  [Caddy] ──► Emite certificado SSL para tienda.cliente.com
```

1. **Validación previa de formato**: Antes de consultar cualquier servicio externo, el router verifica que el parámetro `dominio` sea un nombre de dominio válido (rechaza direcciones IP directas o cadenas malformadas con `400 Bad Request`).
2. **Evaluación en cadena (Short-Circuit)**: Recorre los endpoints habilitados de menor a mayor número de `priority`. En cuanto un endpoint cumple las condiciones configuradas, detiene la cadena y responde `200 OK` a Caddy.
3. **Denegación segura**: Si ningún endpoint aprueba el dominio (o si ocurre un timeout), responde `403 Forbidden` y Caddy aborta la emisión del certificado.

---

## Características Principales

- **Evaluación en cadena por prioridad**: Registra múltiples backends (SaaS A, SaaS B, microservicios internos) y define en qué orden se consultan.
- **Inyección flexible del dominio**:
  - Mediante placeholder `{dominio}` o `{domain}` en cualquier parte de la URL (ej. `https://api.miapp.com/v1/domains/{dominio}/check`).
  - O automática como query param `?dominio=ejemplo.com` si la URL no incluye placeholder.
- **Reglas de respuesta esperada configurables**:
  - **Código de estado HTTP** (ej. `200`, `204`).
  - **Coincidencia en JSON** opcional por ruta anidada (ej. `data.valid = true` o `status = active`).
  - **Coincidencia de texto en Body** opcional (ej. `ALLOWED`).
- **Sin fricción de autenticación**: Tanto el endpoint `/preguntame` como las llamadas salientes funcionan sin requerir cabeceras de autenticación y con CORS abierto (`Access-Control-Allow-Origin: *`).
- **Interfaz Web integrada**:
  - Alta, activación/desactivación en caliente y eliminación de URLs.
  - **Simulador en vivo** (`/api/preguntame?dominio=...&debug=1`) que muestra el desglose paso a paso de cada URL consultada y su latencia en milisegundos.
  - **Historial de auditoría** en tiempo real con las últimas consultas realizadas por Caddy.

---

## Requisitos Previos

- **Bun** `>= 1.1` (para ejecución local) o **Docker** + **Docker Compose** (para contenedores).
- **PostgreSQL** `>= 14`.

---

## Variables de Entorno

El archivo `.env` separa las variables del contenedor de PostgreSQL y las del servicio Router:

```env
# Variables del contenedor PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=router_caddy

# Variables del servicio Router
ROUTER_PORT=3000
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/router_caddy
```

| Variable | Descripción | Valor por defecto |
| :--- | :--- | :--- |
| `POSTGRES_URL` | Cadena de conexión completa que utiliza el servicio `router` para conectarse a PostgreSQL. | `postgres://postgres:postgres@localhost:5432/router_caddy` |
| `ROUTER_PORT` | Puerto expuesto en el host para la interfaz web y la API del router. | `3000` |
| `POSTGRES_HOST` | Host de PostgreSQL (usado como fallback si no se define `POSTGRES_URL`). | `localhost` |
| `POSTGRES_PORT` | Puerto de PostgreSQL. | `5432` |
| `POSTGRES_USER` | Usuario de PostgreSQL. | `postgres` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL. | `postgres` |
| `POSTGRES_DB` | Nombre de la base de datos. | `router_caddy` |

---

## Instalación y Despliegue

### Con Docker Compose (Recomendado)

Levanta tanto PostgreSQL como el microservicio Router en un solo paso:

```bash
cp .env.example .env
docker compose up -d --build
```

La interfaz web y los endpoints estarán disponibles en `http://localhost:3000`. Las tablas de PostgreSQL se crean automáticamente al iniciar.

### Desde GitHub Container Registry (GHCR)

Si deseas ejecutar únicamente la imagen publicada en GHCR conectándola a tu propio PostgreSQL:

```bash
docker run -d \
  --name router-caddy \
  -p 3000:3000 \
  -e POSTGRES_URL="postgres://usuario:password@tu-host-postgres:5432/router_caddy" \
  ghcr.io/<organizacion>/<repositorio>:latest
```

### Entorno de Desarrollo Local con Bun

1. Inicia únicamente la base de datos PostgreSQL:
   ```bash
   docker compose up -d postgres
   ```
2. Instala las dependencias e inicializa el esquema:
   ```bash
   bun install
   bun run db:migrate
   ```
3. Inicia el servidor de desarrollo:
   ```bash
   bun run dev
   ```

---

## Configuración en Caddy (`Caddyfile`)

Configura la directiva global `on_demand_tls` en tu `Caddyfile` apuntando a `/api/preguntame` o `/preguntame`:

```caddyfile
{
  on_demand_tls {
    ask http://localhost:3000/api/preguntame
  }
}

https:// {
  tls {
    on_demand
  }
  reverse_proxy localhost:8080
}
```

> **Nota sobre el parámetro query**: Caddy envía automáticamente `?domain=<dominio>` al endpoint `ask`. El router acepta de forma transparente tanto `?dominio=` como `?domain=`, por lo que funciona directamente con Caddy y con llamadas manuales a `/api/preguntame?dominio=ejemplo.com` o `/preguntame?dominio=ejemplo.com`.

---

## Cómo Configurar URLs y Respuestas Esperadas

Desde el panel en `http://localhost:3000` puedes registrar tantas URLs como necesites:

1. **Verificación solo por código HTTP (más común)**:
   - **URL**: `https://api.inquilino1.com/internal/domains/check?dominio={dominio}`
   - **Método**: `GET`
   - **Status Esperado**: `200`
   - Si el backend responde `200`, el certificado se emite; si responde `404`, pasa a la siguiente URL de la cadena.

2. **Verificación por propiedad JSON**:
   - Si tu backend siempre responde `200 OK` pero indica la validez en un JSON como `{"data": {"valid": true}}`:
   - **Status Esperado**: `200`
   - **JSON Key**: `data.valid`
   - **JSON Valor Esperado**: `true`

3. **Verificación por contenido de texto en Body**:
   - **Status Esperado**: `200`
   - **Body contiene texto**: `ACTIVE_DOMAIN`

---

## Referencia de la API

### 1. Validar Dominio (Endpoint de Caddy)

- **Rutas**:
  - `GET /api/preguntame?dominio=<dominio>`
  - `GET /preguntame?dominio=<dominio>`
  - *(Alias compatibles: `GET /api/ask?domain=<dominio>` y `GET /ask?domain=<dominio>`)*
- **Parámetros Query**:
  - `dominio` (o `domain`): Dominio a validar (ej. `app.cliente.com`).
  - `debug=1` *(opcional)*: Devuelve un JSON detallado con cada intento de la cadena y tiempos de respuesta.
- **Respuestas**:
  - `200 OK`: Dominio autorizado (incluye header `X-Validated-By` con el nombre del endpoint que aprobó).
  - `403 Forbidden`: Ningún endpoint autorizó el dominio.
  - `400 Bad Request`: Falta el parámetro o el formato del dominio es inválido.

### 2. Gestión de Endpoints de la Cadena

- **`GET /api/endpoints`**: Lista todos los endpoints ordenados por prioridad.
- **`POST /api/endpoints`**: Crea un nuevo endpoint en la cadena.
  ```json
  {
    "name": "SaaS Principal",
    "url_template": "https://api.misaas.com/verify?dominio={dominio}",
    "http_method": "GET",
    "expected_status": 200,
    "expected_json_key": null,
    "expected_json_value": null,
    "expected_body_contains": null,
    "timeout_ms": 3000,
    "priority": 10
  }
  ```
- **`PATCH /api/endpoints/:id`**: Actualiza cualquier campo o activa/desactiva (`{"enabled": false}`) un endpoint.
- **`DELETE /api/endpoints/:id`**: Elimina un endpoint de la cadena.

### 3. Historial de Consultas

- **`GET /api/logs?limit=30`**: Devuelve los últimos registros de validación.
- **`DELETE /api/logs`**: Limpia la tabla de historial.

### 4. Healthcheck del Contenedor

- **Rutas**: `GET /api/health` y `GET /health`
- **Descripción**: Verifica que el servidor HTTP y la conexión a PostgreSQL estén operativos (`SELECT 1`) y reporta la versión activa.
- **Respuestas**:
  - `200 OK`: `{"status": "ok", "version": "0.1.1", "database": "connected", "latency_ms": 2, "timestamp": "..."}`
  - `503 Service Unavailable`: `{"status": "error", "version": "0.1.1", "database": "disconnected", "error": "...", "timestamp": "..."}`

---

## Esquema de Base de Datos

El servicio crea y mantiene automáticamente dos tablas en PostgreSQL:

- **`validation_endpoints`**: Almacena las URLs configuradas (`id`, `name`, `url_template`, `http_method`, `expected_status`, `expected_body_contains`, `expected_json_key`, `expected_json_value`, `timeout_ms`, `priority`, `enabled`, `created_at`).
- **`validation_logs`**: Registra cada consulta realizada por Caddy (`id`, `domain`, `allowed`, `matched_endpoint_id`, `matched_endpoint_name`, `response_status`, `duration_ms`, `details`, `created_at`).

---

## CI/CD y Publicación Automática

El flujo de GitHub Actions (`.github/workflows/new-realease.yml`) implementa **Versionado Semántico (SemVer) automático**:

1. **Detección por Conventional Commits**:
   - `BREAKING CHANGE`, `feat!:` o `[major]` → incrementa versión **Major** (`1.0.0`).
   - `feat:` o `[minor]` → incrementa versión **Minor** (`0.2.0`).
   - `fix:`, `perf:`, `refactor:` u otros → incrementa versión **Patch** (`0.1.1`).
2. **Actualización y Etiquetado**: Actualiza `package.json`, crea el commit `chore(release): vX.Y.Z [skip ci]` y publica el tag Git `vX.Y.Z`.
3. **Publicación Multi-Arquitectura (`linux/amd64`, `linux/arm64`) en GHCR**: Etiqueta la imagen con `:latest`, `:vX.Y.Z`, `:X.Y.Z`, `:X.Y` y `:X`, y crea el **GitHub Release** con el changelog automático.
4. **Despliegue automático en Coolify**: Como último paso tras publicar el Release, el workflow invoca el webhook de Coolify si están configurados los siguientes **GitHub Secrets** en el repositorio (`Settings → Secrets and variables → Actions`):
   - `COOLIFY_WEBHOOK_URL`: URL del webhook de despliegue de Coolify (ej. `https://coolify.midominio.com/api/v1/deploy?uuid=<uuid>&force=false`).
   - `COOLIFY_TOKEN` *(opcional)*: Token de API de Coolify (`Bearer`) para autenticar la llamada al webhook.
5. **Scripts locales**:
   - `bun run version:auto` (detecta según commits desde el último tag)
   - `bun run version:patch` / `bun run version:minor` / `bun run version:major`

---

## Autoría y Licencia

Desarrollado por **Code Me** (<licencias@code-me.club>).

Copyright © 2026 Code Me.  
Este proyecto está licenciado bajo la **GNU Affero General Public License v3.0 (AGPL-3.0)**. Consulta el archivo [LICENSE](./LICENSE) para más detalles.
  
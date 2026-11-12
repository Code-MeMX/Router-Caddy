# Router Caddy — Validador On-Demand TLS Multiinquilino

Microservicio en **Bun + Next.js (TypeScript) + PostgreSQL** para validar dominios en cadena antes de que Caddy emita certificados SSL (`on_demand_tls`).

## Funcionamiento

1. Caddy recibe una petición HTTPS para un dominio nuevo y consulta `GET /api/preguntame?dominio=cliente.com` o `GET /preguntame?dominio=cliente.com` (también acepta `?domain=`).
2. El router consulta en cadena (por orden de prioridad) cada URL activa registrada en PostgreSQL.
3. Si alguna URL devuelve el código de estado HTTP esperado (y opcionalmente coincide con la clave JSON o texto en body configurado), el router responde `200 OK` a Caddy inmediatamente y autoriza la emisión del certificado SSL.
4. Si ninguna URL aprueba el dominio, responde `403 Forbidden`.

## Uso rápido

### 1. Iniciar PostgreSQL
```bash
docker compose up -d postgres
```

### 2. Ejecutar en desarrollo con Bun
```bash
bun install
bun run db:migrate
bun run dev
```

Abre `http://localhost:3000` para administrar las URLs de validación, definir respuestas esperadas y simular peticiones de Caddy.

## Configuración en `Caddyfile`

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

## Autoría y Licencia

Desarrollado por **Code Me** (<licencias@code-me.club>).

Copyright © 2026 Code Me.  
Este proyecto está licenciado bajo la **GNU Affero General Public License v3.0 (AGPL-3.0)**. Consulta el archivo [LICENSE](./LICENSE) para más detalles.

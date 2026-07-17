import type { FastifyInstance } from "fastify";

const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Factu · API de facturación electrónica CR</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #6d28d9 0%, #4c1d95 35%, #1e1b4b 100%);
    color: #f8fafc; padding: 2rem;
  }
  .card {
    width: 100%; max-width: 720px; background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 20px;
    padding: 2.5rem; backdrop-filter: blur(8px);
    box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  }
  .logo { font-size: 3rem; }
  h1 { margin: .5rem 0 .25rem; font-size: 2rem; letter-spacing: -0.02em; }
  .sub { margin: 0 0 1.75rem; color: #c7d2fe; font-size: 1.05rem; }
  .badges { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1.75rem; }
  .badge {
    font-size: .78rem; padding: .3rem .7rem; border-radius: 999px;
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
  a.tile {
    display: block; text-decoration: none; color: inherit; padding: 1.1rem 1.25rem;
    border-radius: 14px; background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12); transition: transform .12s, background .12s;
  }
  a.tile:hover { transform: translateY(-3px); background: rgba(255,255,255,0.14); }
  a.tile .t { font-weight: 600; font-size: 1.05rem; }
  a.tile .d { font-size: .85rem; color: #c7d2fe; margin-top: .2rem; }
  footer { margin-top: 1.75rem; font-size: .8rem; color: #a5b4fc; }
  a.link { color: #ddd6fe; }
</style>
</head>
<body>
  <main class="card">
    <div class="logo">🧾</div>
    <h1>Factu</h1>
    <p class="sub">API de facturación electrónica para el Ministerio de Hacienda de Costa Rica · v4.4</p>
    <div class="badges">
      <span class="badge">TypeScript</span>
      <span class="badge">Fastify</span>
      <span class="badge">Multi-tenant</span>
      <span class="badge">XAdES</span>
      <span class="badge">OpenAPI</span>
    </div>
    <div class="grid">
      <a class="tile" href="/docs">
        <div class="t">📖 Documentación</div>
        <div class="d">Referencia interactiva (Scalar)</div>
      </a>
      <a class="tile" href="/swagger">
        <div class="t">🧪 Swagger UI</div>
        <div class="d">Explorador clásico</div>
      </a>
      <a class="tile" href="/swagger/json">
        <div class="t">{ } OpenAPI</div>
        <div class="d">Especificación JSON</div>
      </a>
      <a class="tile" href="/health">
        <div class="t">💚 Health</div>
        <div class="d">Estado del servicio</div>
      </a>
    </div>
    <footer>
      Emite Factura, Tiquete, Notas de Crédito/Débito y Mensaje Receptor ·
      <a class="link" href="https://github.com/CRLibre/API_Hacienda">inspirado en CRLibre</a>
    </footer>
  </main>
</body>
</html>`;

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { schema: { hide: true } }, async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(PAGINA);
  });
}

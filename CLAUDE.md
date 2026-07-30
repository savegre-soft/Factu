# CLAUDE.md — Factu

Instrucciones específicas de este proyecto. Se suman a las instrucciones
globales del usuario.

## Documentación viva del proyecto

Este repo mantiene tres documentos que reflejan el estado REAL del código (no
lo deseado), y que se actualizan solos en cada sesión de trabajo, sin que el
usuario tenga que pedirlo:

- **[PROJECT_MAP.md](./PROJECT_MAP.md)** — índice de rutas → servicios →
  dominio/modelos. **Leer este archivo primero**, antes de explorar el código
  con `find`/`grep`, para ubicar dónde vive cada cosa.
- **[REQUIREMENTS.md](./REQUIREMENTS.md)** — tabla de requerimientos por
  categoría de negocio, con Estado (✅ Implementado / 🟡 Parcial /
  ⬜ Pendiente) y Notas.
- **[DOCUMENTATION.md](./DOCUMENTATION.md)** — Parte 1 (qué hace el sistema,
  en lenguaje de negocio) y Parte 2 (stack, cómo correr, arquitectura,
  convenciones).

### Reglas permanentes

- **Cada vez que se completa una tarea/feature/fix/decisión de alcance**:
  actualizar Estado + Notas de la fila correspondiente en `REQUIREMENTS.md`
  en la misma sesión. Si el pedido no tenía fila (fue ad-hoc), agregar una
  con el siguiente ID de su categoría (o crear una categoría nueva si no
  encaja en ninguna existente).
- Las **Notas** deben ser densas y técnicas: qué se pidió textualmente, qué
  decisiones de alcance se tomaron y por qué, qué se verificó en vivo y cómo,
  qué bugs reales aparecieron y cómo se corrigieron, qué datos de prueba se
  crearon/limpiaron — para que una sesión futura sin memoria de esta pueda
  retomar el contexto completo leyendo una sola celda.
- Actualizar **DOCUMENTATION.md** de forma incremental con cada cambio real
  de comportamiento visible (nunca "al final" ni en un batch separado).
- Actualizar **PROJECT_MAP.md** si se agregan, renombran o eliminan archivos,
  exports o rutas.
- Antes de un cambio de alcance grande o ambiguo, **preguntar concretamente**
  en vez de asumir — sobre todo si la redacción literal del pedido podría
  romper un flujo ya construido de otro rol o caso de uso (ej. un cambio en
  `/comprobante/:tipo/enviar` que asuma que el receptor siempre es
  obligatorio rompería el tiquete electrónico).
- **Verificar en vivo** (no solo tipos/lint/tests) los cambios de
  comportamiento visible — llamar el endpoint afectado con `curl` o
  equivalente — y dejar constancia de esa verificación en las Notas de
  `REQUIREMENTS.md`.
- **No dejar datos de prueba reales sin limpiar**, y nunca asumir que un
  registro es "de prueba" solo por su forma (UUID, fecha) sin rastrear su
  procedencia real.
- **Nunca commitear a git salvo pedido explícito** del usuario.

### Convenciones técnicas (ver también DOCUMENTATION.md Parte 2)

- El dominio (`src/domain/**`) es lógica pura: no importa de `services/`,
  `infra/` ni `routes/`.
- Toda entidad/modelo nuevo necesita implementación en **ambos**
  repositorios: `src/infra/repos/memory.ts` y `src/infra/repos/prisma.ts`
  (interfaz común en `src/infra/repos/types.ts`), y su modelo en
  `prisma/schema.prisma`. No agregar solo a uno de los dos.
- Cualquier credencial o secreto (`.p12`, contraseñas SMTP/IMAP, secretos de
  webhook, config de canales de notificación) se guarda cifrado con
  `src/infra/crypto/secretBox.ts` (`SecretoSellado`) — nunca en claro, nunca
  se devuelve en claro por la API.

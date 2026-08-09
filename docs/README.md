# Documentación de Factu

Factu es una API en TypeScript/Node para emitir **comprobantes electrónicos v4.4**
ante el Ministerio de Hacienda de Costa Rica.

## Índice

| Documento | Contenido |
|---|---|
| [Primeros pasos](./primeros-pasos.md) | Instalar, configurar y levantar el proyecto (local o Docker). |
| [Conexión con Hacienda](./conexion-hacienda.md) | **Guía principal**: credenciales, certificado, tokens y flujo completo de emisión. |
| [Configuración](./configuracion.md) | Todas las variables de entorno. |
| [Referencia de la API](./api.md) | Endpoints y cómo usar la documentación interactiva (Swagger). |
| [Despliegue](./despliegue.md) | Docker, docker-compose y notas de producción. |

## ¿Qué hace?

Cubre el ciclo completo de la factura electrónica:

```
Registrar emisor → Subir certificado .p12 → Autenticar (IDP) → Reservar consecutivo →
Generar clave → Generar XML → Firmar (XAdES) → Enviar → Consultar estado →
Entregar al cliente (PDF + XML por correo)
```

Tipos de comprobante soportados: **Factura**, **Tiquete**, **Nota de Crédito**,
**Nota de Débito**, **Factura de Compra**, **Factura de Exportación**,
**Recibo Electrónico de Pago** (REP) y **Mensaje Receptor**.

Alrededor del núcleo: documentos recibidos (buzón IMAP o carga manual) con envío del
mensaje receptor, entrega al cliente con reintentos, estadísticas, webhooks,
notificaciones (SMS/WhatsApp/Slack/Teams/Bitrix24), auditoría y chat interno.

## Estado

El núcleo está completo, incluidos los consecutivos gestionados por el servidor y la
re-consulta de comprobantes sin veredicto (ver el roadmap en el [README raíz](../README.md)
y el detalle fila por fila en [REQUIREMENTS.md](../REQUIREMENTS.md)).

Pendiente para producción: la prueba end-to-end contra el sandbox real de Hacienda, la
validación contra el XSD oficial v4.4, y confirmar que la política de firma configurada
sigue siendo la resolución vigente.

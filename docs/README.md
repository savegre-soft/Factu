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
Registrar emisor → Subir certificado .p12 → Autenticar (IDP) →
Generar clave → Generar XML → Firmar (XAdES) → Enviar → Consultar estado
```

Tipos de comprobante soportados: **Factura**, **Tiquete**, **Nota de Crédito**,
**Nota de Débito** y **Mensaje Receptor**.

## Estado

Los 8 hitos del núcleo están completos (ver el roadmap en el [README raíz](../README.md)).
Pendiente para producción: datos oficiales de la política de firma (XAdES-EPES),
validación contra el XSD oficial y pruebas contra el sandbox real de Hacienda.

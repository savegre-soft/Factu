/** Asunto y cuerpo HTML del correo de entrega del comprobante al cliente. */

export interface DatosCorreo {
  /** Número visible del comprobante (consecutivo). */
  numero: string;
  /** Nombre del cliente (receptor). */
  cliente: string;
  /** Nombre del emisor. */
  emisor: string;
}

export function asuntoFactura(numero: string): string {
  return `Factura electrónica N.º ${numero}`;
}

/** Escapa texto para insertarlo de forma segura en el HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cuerpo HTML profesional y responsivo (compatible con clientes de correo). */
export function cuerpoFacturaHtml(d: DatosCorreo): string {
  const cliente = esc(d.cliente || "Estimado(a) cliente");
  const emisor = esc(d.emisor || "");
  const numero = esc(d.numero);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Segoe UI,Arial,sans-serif;color:#1a2230;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e0e6ef;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="background:#0f6cbd;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:600;">
                🧾 ${emisor || "Factura electrónica"}
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 4px;font-size:20px;color:#1a2230;">Factura electrónica N.º ${numero}</h1>
                <p style="margin:16px 0 8px;font-size:15px;">Estimado(a) <strong>${cliente}</strong>,</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                  Adjuntamos la factura electrónica correspondiente.
                </p>
                <p style="margin:0 0 6px;font-size:15px;font-weight:600;">Documentos adjuntos:</p>
                <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6;">
                  <li>Factura en formato <strong>PDF</strong>.</li>
                  <li><strong>XML</strong> firmado electrónicamente.</li>
                </ul>
                <p style="margin:0;font-size:15px;">Gracias por su preferencia.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f5f7fa;border-top:1px solid #e0e6ef;color:#5f6b7a;font-size:12px;">
                Este es un mensaje automático de facturación electrónica. Si no esperabas este correo, ignóralo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

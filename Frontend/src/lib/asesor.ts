/**
 * Datos compartidos del Asesor IA: los usa el prompt del endpoint
 * (`pages/api/asesor.ts`) y el widget del sitio (`AsesorIA.tsx`).
 *
 * Viven en `lib` y no en la ruta de API porque el widget es una isla que corre
 * en el navegador: importar desde `pages/api/asesor.ts` metería el código del
 * endpoint —y su lectura de `OPENAI_API_KEY`— en el bundle del cliente.
 */

/**
 * Línea de atención personalizada. Es distinta del WhatsApp de ventas: por aquí
 * un asesor humano coordina la visita a domicilio y la asesoría a medida.
 *
 * Se guarda en dos formatos a propósito: `TEL` para el enlace `tel:` del widget
 * y `TEXTO` para que el modelo (y el cliente) lo lean como se marca. OJO: el
 * prompt de WhatsApp del negocio trae otro número para envíos (+57 324 669
 * 2376); si la línea de asesoría cambia, hay que tocarla aquí y también en el
 * prompt del "AI Agent" de n8n.
 */
export const LINEA_ASESOR_TEL = "+573246692370";
export const LINEA_ASESOR_TEXTO = "+57 324 669 2370";

/**
 * Oferta de atención personalizada. El dueño pidió que se ofrezca ANTES de
 * empezar la conversación, así que además de estar en el prompt se pinta como
 * aviso fijo en el widget: si dependiera del modelo, aparecería en unas
 * conversaciones y en otras no.
 */
export const AVISO_ATENCION_PERSONALIZADA =
  "Adicionalmente, contamos con la opción de coordinar una visita a su domicilio o " +
  `brindarle asesoría personalizada a través de la línea ${LINEA_ASESOR_TEXTO}. ` +
  "Uno de nuestros asesores se pondrá en contacto con usted para ofrecerle una atención a medida.";

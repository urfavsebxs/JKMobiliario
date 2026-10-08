# Solicitar acceso avanzado de `pages_messaging` (Messenger)

**Por qué hace falta.** El flujo `OnRMtzFSd6eWdiGM` funciona entero salvo el
envío: Meta lo rechaza con `code 10` — *"No se pueden enviar mensajes a
usuarios que no sean administradores, desarrolladores o evaluadores de la app
antes de que se revise el permiso `pages_messaging` y la app esté disponible
públicamente."*

Está demostrado que la restricción es **tener rol en la app**: la cuenta
`38459641010350299` recibía 88 respuestas, y el día que se le quitó el rol de
desarrollador pasó a ser rechazada con ese mismo error, sin tocar el token, el
flujo ni la página. No hay nada que cambiar en n8n.

**Datos de la app**

| | |
|---|---|
| App | **Jkjunior** — id `906918958913453` |
| Modo | **Publicada** (Live) ✔ |
| Página | **Página: Jkmobiliario** — id `675839012618644` |
| Negocio | `2262006060668590` |

---

## 0. Estado real, leído de la API de Meta (22-sep-2026)

Esto ya no es deducción: sale del MCP oficial *Meta Social Technologies*
(`https://mcp.facebook.com/devtools`, herramientas `devtools_app_review`,
`devtools_compliance`, `devtools_webhook_list`). Ver
`meta-devtools-mcp-como-conectar` en la memoria para volver a conectarlo.

**La causa, confirmada.** `devtools_app_review → privileges` devuelve para
`pages_messaging`:

    access_level = "none"     grant_status = "REJECTED"     is_live = false

`access_level: "none"` es la prueba directa de que **no hay acceso avanzado**.
De los 33 privilegios de la app, el único con `access_level: "advanced"` es
`openid`. Todo lo demás está en `none`.

**Lo que ya está bien y no hay que tocar:**

| Comprobación | Valor |
|---|---|
| `business_verification_passes` | **true** ✔ |
| `has_privacy_policy` | **true** ✔ |
| `devtools_compliance → overall_status` | **compliant**, 0 violaciones, 0 acciones requeridas |
| Webhook `page` → `messages`, `message_deliveries` | **habilitado**, a jkmobiliario.digital ✔ |

**Lo que NO es el problema** (queda descartado): el token (es permanente, con
22 scopes y `pages_messaging` concedido), el modo Live, la verificación del
negocio, el webhook y el flujo de n8n.

**La solicitud ya existe.** No hay que crearla: hay un borrador abierto,
`submission_id 906961578909191`, en estado `UNSUBMITTED`, que ya contiene los
17 privilegios — incluido el bloque entero de Messenger. Por eso
`devtools_app_review → requirements` responde `can_submit: false` con el
motivo *"No es posible enviar una solicitud de revisión de app si ya hay una
en proceso."* Hay que **completar ese borrador**, no empezar otro.

---

## 1. Lo único que falta: tres pasos por permiso

`devtools_app_review → requirements` da el detalle. **El `screencast` está
pendiente en los 17 privilegios: es el cuello de botella universal.**

Para `pages_messaging` en concreto faltan **tres**:

| Paso | Estado | Qué es |
|---|---|---|
| `use_case` | ✔ hecho | El caso de uso ya está declarado |
| `data_use_checkup` | ✔ hecho | La revisión de uso de datos está pasada |
| **`screencast`** | ✘ **falta** | El vídeo continuo mostrando el permiso en uso |
| **`api_precheck`** | ✘ **falta** | Comprobación automática de la API; suele resolverse sola al completar el resto |
| **`test_page`** | ✘ **falta** | Página de prueba para que el revisor reproduzca el flujo |

El bloque completo y su estado:

    pages_show_list                  falta: screencast
    pages_manage_metadata            falta: screencast, api_precheck
    pages_messaging                  falta: screencast, api_precheck, test_page
    pages_read_engagement            falta: screencast, api_precheck
    business_management              falta: screencast, api_precheck
    public_profile                   (nada pendiente)

El resto de la solicitud (`pages_utility_messaging`, los cinco
`instagram_business_*`, `instagram_manage_comments`,
`whatsapp_business_messaging`, `whatsapp_business_management`, `Human Agent`)
también está pendiente solo de `screencast` y `api_precheck`. **Si el objetivo
es Messenger, valorar si conviene dejar la solicitud con esos 17 o reducirla a
los cinco de Messenger: menos permisos, revisión más rápida.** Quitar
privilegios del borrador es reversible; enviarlo con todo y que lo rechacen por
un permiso de Instagram que no se usa, no.

### 1.1 Reducir el borrador a los seis de Messenger

**Esto es manual: no hay API.** Comprobado el 22-sep-2026 con el MCP conectado:
`devtools_app_review` solo expone `status | history | privileges |
requirements` — las cuatro de lectura — y lo único escribible de todo el
servidor son los webhooks. La única forma es el panel.

**Dónde está el control:** en **Revisar → Revisión de la app** → botón
**Edit**, cada permiso que la app no use se quita con el **icono de papelera
(trashcan)**. En la misma pantalla se marcan los que sí, se acepta la casilla
de uso y se pulsa **Submit for Review** abajo a la derecha.

**Los seis que se quedan:**

| Permiso | Por qué |
|---|---|
| `pages_messaging` | El envío de mensajes. Es el objetivo |
| `pages_show_list` | Requerido por el caso de uso |
| `pages_manage_metadata` | Requerido por el caso de uso (webhook de la página) |
| `pages_read_engagement` | Dependencia de `pages_show_list` |
| `business_management` | Dependencia documentada de `pages_messaging` |
| `public_profile` | **Requerido por el caso de uso y NO se puede quitar** |

`public_profile` no aparece en la lista de cinco que se suele citar, pero el
caso de uso de Messenger lo marca como requerido y **no tiene papelera**. No
hay que pelearse con él: no tiene ningún paso pendiente, así que no cuesta
trabajo.

**Los diez que se quitan** (papelera), todos ajenos a Messenger:

    pages_utility_messaging
    Human Agent
    instagram_business_basic
    instagram_business_manage_messages
    instagram_business_manage_comments
    instagram_business_manage_insights
    instagram_business_content_publish
    instagram_manage_comments
    whatsapp_business_messaging
    whatsapp_business_management

**Los casos de uso NO se pueden borrar** una vez creada la app (lo dice Meta:
*"Use cases cannot be removed after you create your app"*). Lo que se quita son
los **permisos** de dentro de la solicitud, que es lo que cuenta para la
revisión. El caso de uso de Instagram se queda en la app; simplemente deja de
pedirse su permiso.

**Ojo con `pages_utility_messaging`.** No hace falta para el flujo actual
—el bot solo responde a quien escribe primero, dentro de la ventana de 24
horas— pero es el permiso que permite escribir **fuera** de esa ventana. Si
algún día se quiere avisar a un cliente sin que haya escrito antes, habrá que
volver a pedirlo. Quitarlo hoy no rompe nada de lo que hay.

**Por qué conviene reducir:** Meta es explícita — *"Any requested permission or
feature missing a screen recording will not be approved."* Con 16 permisos
dentro, cada uno pide su propio `screencast`. Con seis, el trabajo del vídeo se
concentra en lo que sí se usa.

Se completa en **Revisar → Revisión de la app** →
`developers.facebook.com/apps/906918958913453/app-review/`

---

## 2. Los permisos que se piden juntos

Meta pide este conjunto como un bloque, no `pages_messaging` suelto:

```
pages_show_list
pages_manage_metadata
pages_messaging
pages_read_engagement
business_management
```

`business_management` **es una dependencia** de `pages_messaging`. La propia doc
dice que hay que **decirlo expresamente en la solicitud**, o la rechazan por no
justificarlo.

---

## 3. Texto para pegar en la descripción

> We are JKMobiliario, a furniture retailer based in Colombia. We use the
> `pages_messaging` permission to run an automated customer-service assistant
> for our own Facebook Page ("Página: Jkmobiliario", ID 675839012618644).
>
> When a customer sends a message to our Page's Messenger inbox, our server
> receives the webhook event and replies with product information, a photo
> gallery, and a link to our catalogue and our WhatsApp line. **Every message
> is sent from our own Page to a person who messaged us first.** We never
> initiate conversations, and we never message anyone who has not contacted
> us.
>
> The permission is used exclusively through the Send API
> (`POST /675839012618644/messages`) on our own Page.
>
> `business_management` is requested because it is a documented dependency of
> `pages_messaging`. Our app does not use it for any other purpose.

---

## 4. El vídeo (screencast) — es lo que bloquea todo

Un solo plano continuo, **sin cortes**, mostrando el permiso *en uso*. Meta
rechaza los montajes. Como el `screencast` está pendiente en los 17 permisos,
un mismo vídeo puede servir para varios **si muestra cada permiso en uso**;
para Messenger basta con que se vea el envío del mensaje.

**Duración objetivo: 90 segundos.** Ni 10 (no cabe) ni 10 minutos (el revisor
lo abandona). Si algo sale mal, se para y se empieza de cero: no se recorta.

### El montaje de pantalla (antes de darle a grabar)

Dos ventanas en la **misma pantalla**, lado a lado:

| Zona | Qué se abre |
|---|---|
| Izquierda, ~55 % | Bandeja de entrada de la Página — `business.facebook.com/latest/inbox`, con **Página: Jkmobiliario** seleccionada y la conversación abierta |
| Derecha, ~45 % | n8n → flujo `OnRMtzFSd6eWdiGM` → pestaña **Ejecuciones** |

Los dos a la vez es deliberado: cuando llegue el mensaje se verá **en el mismo
fotograma** el mensaje entrando en la bandeja y el flujo disparándose. Eso es
lo que no se puede fingir.

El móvil se queda fuera de la grabación: solo sirve para **enviar** (paso 2).
Antes de grabar, subir el zoom del navegador (Ctrl + `+` un par de veces) para
que el texto se lea sin ampliar.

### El guion, cronometrado

| Tiempo | Qué se hace | Qué demuestra |
|---|---|---|
| 0:00–0:10 | Mover el ratón despacio sobre el nombre **Página: Jkmobiliario** en la bandeja, y luego sobre el nombre del flujo en n8n. Nada más. | Sobre qué página y qué flujo es la demo |
| 0:10–0:25 | Desde el móvil, enviar: *«Hola, quiero cotizar un sofá»*. Dejar que aparezca en la bandeja. **No tocar el ratón ni el teclado.** | El permiso recibe el mensaje de entrada |
| 0:25–0:45 | La respuesta aparece **sola** en esa conversación, con el enlace del catálogo y el WhatsApp. Seguir sin tocar nada. | Que contesta la app, no una persona |
| 0:45–1:10 | Pasar a n8n, abrir **esa** ejecución: webhook en verde, nodo de IA en verde y `HTTP Request` con la URL `graph.facebook.com/v26.0/675839012618644/messages` y estado 200. | El permiso **en uso**: la llamada real a la API |
| 1:10–1:25 | Volver a la bandeja: es la conversación de quien escribió primero, y no hay ningún mensaje saliente a nadie que no haya escrito. | Solo se responde a quien escribió primero |
| 1:25 | Parar. | |

**Los 20 segundos del paso 3 son el corazón del vídeo.** El ratón quieto es la
prueba: si el revisor ve el cursor parado y el mensaje apareciendo, sabe que lo
mandó el servidor.

**Variante que lo refuerza** (si el equipo aguanta tres ventanas): añadir a la
derecha una tercera con el Messenger de la cuenta de demostración
(`messenger.com`), y escribir desde ahí en vez de desde el móvil. Así se ve el
recorrido entero en un solo fotograma: el cliente escribe, la Página recibe,
la app contesta.

La cuenta de demostración tiene que ser una con rol (tú, o un evaluador). Es
normal en una demo: para eso existen los evaluadores.

**Nada de narración obligatoria.** Meta no pide audio; si se añade, que sea en
inglés y explicando los pasos, pero es más fácil que sobre que falte. Lo que sí
importa: cerrar correo, otras conversaciones de clientes y notificaciones antes
de grabar.

---

### 4.1 Cómo grabarlo (herramientas ya listas)

**Un solo vídeo cubre los cinco permisos.** No hacen falta cinco grabaciones:
el flujo de Messenger ejercita `pages_messaging`, `pages_show_list`,
`pages_manage_metadata`, `pages_read_engagement` y `business_management` a la
vez. `public_profile` no pide screencast.

El equipo es **Hyprland sobre Wayland**, sin ningún grabador instalado
(`wf-recorder`, `obs`, `gpu-screen-recorder`, `kooha`: ninguno). Y `x11grab` de
ffmpeg **no sirve**: grabaría negro, porque las ventanas son Wayland nativas.
No hace falta instalar nada ni usar sudo:

1. Abrir `ops/grabar-screencast.html` en el navegador. Graba con
   `getDisplayMedia` + `MediaRecorder`, y el vídeo **no sale de la máquina**.
   Al parar, se descarga como `screencast-messenger.webm`.
2. Convertir a MP4 (que es lo que Meta acepta sin sorpresas):

       ./ops/screencast-a-mp4.sh

   Sin argumentos coge el `.webm` más reciente de Descargas o Vídeos; también
   acepta una ruta.

Al elegir qué compartir, escoger **la ventana**, no «toda la pantalla»: así la
pestaña del grabador no aparece en el vídeo.

### 4.2 El fallo que arruina la toma

**La cuenta que escriba en la demo tiene que tener rol en la app.** Si no lo
tiene, el bot le contesta con el mismo `code 10` y **grabas el fallo en vez del
éxito**. Comprobado el 22-sep-2026 sobre la ejecución 1858, en vivo: el flujo
corre entero —webhook, `Extraer Mensaje`, memoria, Gemini, AI Agent, todos
`success`— y muere solo en `HTTP Request`, con el remitente
`26784674631230898` (que no tiene rol). La IA sí había generado la respuesta
buena; nadie la recibió.

Antes de grabar: añadir la cuenta a **Roles de la app → Evaluadores** y
**esperar a que acepte la invitación**. Sin ese paso, la toma sale fallando.

**El fallo quedó grabado, sin buscarlo.** El vídeo `~/Vídeos/Video.mp4`
(21-sep-2026, 22:53 hora local = 03:53 UTC) contiene las dos caras del
experimento: un `Hola.` que se queda **sin respuesta** —enviado mientras la
cuenta no tenía rol— y otro `Hola.` que **sí recibe contestación**, enviado
después de devolvérselo. Es la misma cuenta, el mismo flujo y el mismo token:
lo único que cambió fue el rol. Sirve como prueba interna de que la causa es
esa y de que **la cuenta ya está en condiciones de grabar la demo buena**.

### 4.3 Antes de darle a grabar

- [ ] La cuenta de la demo tiene rol y aceptó la invitación
- [ ] La bandeja de Messenger abierta, con la conversación sin responder
- [ ] n8n → Ejecuciones del flujo `OnRMtzFSd6eWdiGM` en otra pestaña
- [ ] Cerrado lo que no deba verse (otros clientes, correos, chats). Si no se
      puede —el buzón tiene demasiadas conversaciones para vaciarlo—, **recortar
      el encuadre después** (§4.5)
- [ ] **Sin pulsar ningún enlace de la conversación.** Un clic en el `wa.me` saca
      el navegador de la bandeja, pasa por el redireccionador de Facebook en
      blanco y levanta un diálogo del sistema *«No hay aplicaciones
      disponibles»*. Quitarlo después sería un corte, y un corte es un montaje.
- [ ] **Sin haber probado a ritmo alto ese día.** La capa gratuita de Gemini son
      **500 peticiones por día** por proyecto y modelo (no 15 por minuto: eso fue
      un error de lectura del error de Google). Si la cuota del día está gastada,
      el `AI Agent` da 429 en **todos** los mensajes y el revisor no recibe nada;
      la solicitud se rechaza por un motivo que no tiene nada que ver con el
      permiso. Ver [[n8n-gemini-cuota-gratuita-429]].
- [ ] **El flujo responde 200 a Meta aunque la IA falle.** Si no, Meta reentrega
      el mismo mensaje hasta 31 veces y cada reentrega vuelve a llamar a Gemini:
      el propio bucle agota la cuota. Ver [[n8n-webhook-ack-antes-que-la-ia]].

### 4.4 Grabar desde el móvil NO sirve

Grabar la pantalla del teléfono con la app de Messenger del cliente **no vale
como screencast**, aunque la respuesta llegue:

1. **Enseña el lado equivocado.** Se ve la app *de Meta* en el móvil del
   cliente, no la tuya. El revisor tiene que ver el permiso **usado por tu
   aplicación**; una respuesta que aparece en el móvil es indistinguible de una
   persona escribiendo a mano en la bandeja.
2. **No hay prueba de que sea automático.** Sin la ejecución de n8n a la vista
   (webhook → IA → `HTTP Request` a `graph.facebook.com/…/messages`) no hay
   nada que demuestre que el mensaje lo mandó un programa.
3. **No se ve la bandeja de la Página**, que es donde el revisor comprueba que
   se responde **a quien escribió primero** y solo a esa persona.
4. **El intercambio es «Hola.» → saludo genérico.** No demuestra el caso de
   uso, que es contestar a lo que el cliente pregunta.

La toma tiene que ser de **escritorio**, con los cinco momentos de §4 en una
sola pasada. El móvil solo hace falta para el paso 2 —escribir desde la otra
cuenta—, y esa cuenta ya está lista.

### 4.5 Recortar la lista de clientes antes de subir

La bandeja lleva a la izquierda **todas las conversaciones**, con nombres reales
de clientes. Eso no puede ir a un revisor de Meta. No hace falta vaciar el buzón:
se recorta el encuadre, que **no quita ni un fotograma** y por tanto sigue siendo
un plano continuo:

    ffmpeg -i screencast-messenger.webm \
      -vf "crop=1260:1080:660:0" \
      -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p \
      -profile:v high -level 4.0 -movflags +faststart -an \
      screencast-messenger-recortado.mp4

Las cifras salen de la geometría de la bandeja: en 1920 de ancho, la lista de
conversaciones llega hasta x≈660 y la conversación empieza justo ahí. El recorte
**conserva lo que prueba el permiso**:

- en la barra de direcciones, `…/inbox/all/?…&asset_id=675839012618644`, que es el
  identificador de la Página;
- en n8n, el encabezado de la ejecución
  (`Succeeded in 1.467s | 43KB | ID#2115 | Version 989a3a60`) y el grafo entero en
  verde, con el `HTTP Request` a `graph.facebook.com`.

Se pierde la *lista* de ejecuciones de la izquierda, que es prescindible: lo que
demuestra el permiso en uso es la ejecución abierta.

**Un aviso sobre la toma:** la bandeja de Facebook **repinta en bloque**, no
mensaje a mensaje. Medido fotograma a fotograma, la conversación puede quedarse
congelada diez segundos y cambiar de golpe, apareciendo el mensaje entrante y la
respuesta del bot **en el mismo fotograma**. No cuentes con que se vea «llega el
mensaje y luego contesta» como dos eventos separados: lo que sostiene que es
automático es la ejecución de n8n, así que conviene tener **la bandeja y n8n en
el mismo fotograma**, no en pestañas distintas.

## 5. Instrucciones de prueba

> Send any message to the Messenger inbox of our Facebook Page
> ("Página: Jkmobiliario", ID 675839012618644). Our assistant replies
> automatically within a few seconds with our catalogue link and WhatsApp
> line. No credentials or setup are required from the reviewer.

---

## 6. Mientras Meta responde

- **Evaluadores.** Añadir a alguien como evaluador en *Roles de la app* le da
  rol, y a quien tiene rol **sí** se le responde. Sirve para tres personas, no
  para los clientes.
- **Contestar a mano** desde la bandeja de la página: la restricción es sobre
  la *app*, no sobre una persona escribiendo en la bandeja.

## 7. Si la revisión se rechaza

Los motivos típicos son: no se ve el permiso en uso en el vídeo, falta la
justificación de `business_management`, o el revisor no consigue probar el
flujo. Se corrige y se reenvía — se puede repetir cuantas veces haga falta, sin
límite de intentos.

---

## 8. Cómo volver a comprobar el estado sin abrir el panel

Con el MCP de Meta conectado (ver memoria `meta-devtools-mcp-como-conectar`)
y el cliente de `ops/meta-mcp.py`:

    python3 ops/meta-mcp.py call devtools_app_review '{"action":"privileges","app_id":"906918958913453"}'
    python3 ops/meta-mcp.py call devtools_app_review '{"action":"requirements","app_id":"906918958913453"}'

Lo que hay que ver para saber que ya está: `pages_messaging` con
`access_level: "advanced"`. Mientras diga `"none"`, el bot seguirá sin poder
escribirle a los clientes.

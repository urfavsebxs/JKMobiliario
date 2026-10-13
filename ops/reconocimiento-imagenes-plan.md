# Plan: que el bot reconozca los muebles de las fotos

**Estado: las fases 1 y 2 están APLICADAS y publicadas (2026-10-09).** Queda pendiente la parte
de tiempos (el acuse inmediato) y una decisión sobre `maxTries`. Ver "Lo que se aplicó" al
final.

## Lo que pasó (con la evidencia)

La clienta del teléfono terminado en **1465** mandó un pantallazo de un anuncio de Instagram
donde sale un **sofá modular gris** y escribió "Qué precio tiene este mueble". La conversación,
tal como quedó guardada, es esta:

| # | Quién | Qué dijo |
|---|---|---|
| 2 | Cliente | "Qué precio tiene este mueble" *(la foto llegó aparte)* |
| 3 | Mobi | "Veo que preguntas por un mueble, pero **no me adjuntaste la foto** ni me dijiste cuál es" |
| 4 | Cliente | "Esta es a foto me apareció una publicidad de ustedes y este fue el pantallazo" |
| 5 | Mobi | "¡Ah, con que era la **Cama Vela**!" *(el sofá era un sofá; el bot inventó una cama)* |
| 6 | Cliente | "No no es ninguna cama" |
| 7 | Mobi | "discúlpame por la confusión… ¿es un sofá, un comedor, un centro de TV o una poltrona?" |
| 8 | Cliente | "Es un sofá" |

Ejecuciones que lo muestran, en `Whatsapp` (`gdRNtswXAQ5QMfvy`):

- **4028** (19:32:53): llegó la **imagen**. El flujo la bajó, la subió al bucket
  (`comprobantes/573127761465/1791574417454-5c8730985536.jpg`, 22,6 KB) y la pasó por el
  analizador de comprobantes: 43,5 s para concluir `motivo: "no_es_comprobante"`. La respuesta
  fue el texto fijo "¡Gracias por la foto! … dime cuál es".
- **4030** (19:33:18): llegó el **texto** "Qué precio tiene este mueble", por la rama de texto,
  y el agente —que no tenía ni idea de que había una foto— contestó "no me adjuntaste la foto".

La foto se verificó abriéndola desde el bucket: es un sofá seccional claro, no una cama.

## Por qué pasa (tres causas, en orden de importancia)

1. **Ningún nodo mira la imagen para saber qué mueble es.** El único que la mira es el
   analizador de comprobantes, y su prompt dice explícitamente lo contrario: el campo
   `producto` tiene que salir **de la conversación**, no de la imagen ("el nombre del comercio
   o de la pasarela NO es un producto"). Para una foto de un mueble ese análisis solo contesta
   `es_comprobante_pago: false` y se descarta el resto. **El bot nunca vio el sofá.**
2. **Los turnos de imagen no entran en la memoria de conversación.** La memoria
   (`MongoDB Chat Memory`) solo se escribe cuando corre el `AI Agent`, y las imágenes van por
   una rama paralela que no pasa por él. Por eso el agente dijo "no me adjuntaste la foto" y
   por eso el historial del panel se ve incompleto: **falta la foto y falta la respuesta que el
   bot sí dio** ("¡Gracias por la foto!").
3. **Sin datos, el agente rellena el hueco.** Al preguntarle por "este mueble" sin foto ni
   nombre, inventó "Cama Vela" (un producto del catálogo) en vez de decir que no lo sabía.

Un cuarto detalle menor: `Preparar Entrada` solo lee `messages[0].text.body`, así que **el
texto que el cliente escribe junto a la foto (`image.caption`) se pierde**.

## Los tiempos de espera: qué se midió (2026-10-09)

El dueño dijo que las esperas son largas. Se midió la **misma llamada** con el mismo prompt y la
misma imagen, fuera de n8n:

| Dónde se llamó | Modelo | Tiempo |
|---|---|---|
| Desde el portátil | `gemini-3.5-flash` | **6,3 s** |
| Desde el portátil | `gemini-3.5-flash-lite` | **1,4 s** |
| **Desde el propio servidor** (dentro del contenedor de n8n) | `gemini-3.5-flash` | **6,0 s** y **9,0 s** |
| **Desde el propio servidor** | `gemini-3.5-flash-lite` | **1,3 s** |

La red del servidor y la clave no son el problema: **el modelo contesta en segundos**. Entonces,
¿de dónde salen los 167 s de la ejecución 3998?

**De los reintentos.** En `workflow-execute.js` de n8n, `taskStartedData` se crea **antes** del
bucle de intentos y el tiempo del nodo se calcula contra esa marca
(`executionTime: Date.now() - taskStartedData.startTime`). Es decir: **el tiempo que se ve en la
ejecución incluye todos los intentos y las esperas entre ellos**, no la llamada que por fin
funcionó. El nodo tiene `retryOnFail`, `maxTries: 3` y `waitBetweenTries: 2000` (se le pusieron el
2026-10-08 justo porque Gemini devolvía 503). Los 167 s son, entonces: dos intentos que se
quedaron colgados y fallaron + 2 esperas de 2 s + el intento bueno de ~6 s.

**Y los reintentos no se ven en los registros** (n8n los escribe a nivel `debug`, y el contenedor
está en `info`), por eso el nodo parecía tardar 167 s en una sola llamada.

Lo que esto cambia en el plan:

1. **Cambiar el modelo no basta, pero ayuda**: `flash-lite` (1,3 s medidos) reduce la ventana en
   la que Google puede devolver 503, así que habrá menos reintentos. Para *describir un mueble*
   es de sobra; para leer el monto de un comprobante conviene quedarse en `flash`, porque ahí un
   dígito mal leído cuesta una revisión manual.
2. **Contestar primero y analizar después** es lo que de verdad quita la espera: el cliente debe
   recibir el acuse ("recibí tu foto, la estoy mirando") en segundos, y la respuesta con los
   parecidos llegar cuando el análisis termine. Así da igual que un reintento tarde dos minutos.
3. **Bajar `maxTries` a 2** acorta el peor caso (queda en ~1 reintento), aunque sube el riesgo de
   que un comprobante se registre sin datos si los dos intentos fallan.

## Plan propuesto

### Fase 1 — Que el análisis devuelva qué se ve (una sola llamada, sin nodos nuevos)

Se amplía el prompt de `Analizar Comprobante` en `JK - Analizar Comprobante`
(`TBQmiqNMLvBaxXNF`) para que, cuando `es_comprobante_pago` sea `false`, además describa lo
que ve. Campos nuevos en el mismo JSON:

```json
{
  "es_comprobante_pago": false,
  "tipo_imagen": "mueble | captura_de_publicacion | persona | meme | otra",
  "descripcion_mueble": "sofá modular de 5 puestos, tapizado claro, con chaise, sobre piso de mármol",
  "categoria_probable": "Sofás Modernos | … | null",
  "palabras_clave": ["sofa modular", "sofa gris", "seccional"]
}
```

Reglas del prompt: si no es un mueble, `descripcion_mueble` va vacío; **no se inventa** el
nombre del modelo (eso lo decide la búsqueda, no el modelo); `categoria_probable` solo entre
las categorías reales del catálogo.

**Por qué así:** es la misma llamada que ya se hace, así que no añade otra espera. Se paga un
poco más de pensamiento y listo.

**El modelo sigue siendo `flash`**, no `flash-lite`: lo que se lee aquí son montos de dinero y
un dígito mal leído cuesta una revisión manual (o peor). La velocidad se gana por el otro lado
(el acuse inmediato, abajo), no bajando la calidad donde más duele.

**Y para que la espera no se note**, el acuse sale primero:

1. Apenas llega la imagen, el bot contesta algo corto y honesto ("Recibí tu foto, dame un
   momentico que la miro 👀").
2. El análisis sigue por detrás, como hoy.
3. Cuando termina, sale la respuesta buena (los parecidos del catálogo o el acuse del
   comprobante).

Es la única forma de que un reintento de dos minutos deje de ser un cliente esperando en
silencio: ya recibió algo. Y de paso, si Gemini contesta en 6 s (lo normal), el cliente ve dos
mensajes seguidos y no pasa nada.

### Fase 2 — Reconocer el mueble primero; si no hay coincidencia, que elija el cliente

Con la descripción de la Fase 1, los turnos de imagen que **no** son comprobante pasan por el
`AI Agent` en vez de recibir el texto fijo:

1. **Primero, reconocer.** El agente recibe la descripción del análisis
   (`descripcion_mueble`, `categoria_probable`, `palabras_clave`) y busca en el catálogo con
   `Consultar Catálogo`.
2. **Si hay coincidencia clara**, responde con ese mueble y su precio (es lo que el cliente
   pidió).
3. **Si no hay ninguna coincidencia**, o hay varias y no está claro, **le manda al cliente las
   fotos de los candidatos** (con `Enviar Galería de Fotos`) y le pregunta cuál es el más
   parecido. El cliente elige y ahí sí sale el precio.
4. Nunca inventa un modelo: si la búsqueda no devuelve nada, se dice y se ofrecen categorías.

**El ramal del comprobante no se toca**: un comprobante se sigue contestando con el texto fijo
y nunca lo "lee" el agente (regla 13: el bot no confirma pagos).

**Efecto secundario que es medio arreglo:** al correr el agente, el turno entra en la memoria de
conversación, así que se acaban el "no me adjuntaste la foto" y el historial incompleto del
panel. Y si además se lee el `caption` (una línea en `Preparar Entrada`), la memoria guarda lo
que el cliente escribió de verdad.

### Fase 3 — Guardar las fotos de WhatsApp (solo WhatsApp)

**Ya está hecho** para WhatsApp desde el 2026-10-09: el subflujo sube **todas** las imágenes al
bucket privado `comprobantes`, bajo `comprobantes/<telefono>/`, y el panel las muestra en la
conversación. No hay que crear ningún bucket nuevo —al revés, se acaban de borrar los dos que
sobraban— ni tocar los flujos de Instagram y Messenger.

Lo único que quedaría de esta fase, y es opcional: guardar **la descripción** que devuelve el
análisis junto a la foto, para poder buscar "las fotos de sofás grises" en el panel. Hoy la
descripción se usa para responder y se pierde.

**Instagram y Messenger quedan fuera a propósito** (decisión del dueño): en esos flujos la
imagen ni se descarga, y no se va a cambiar.

## Lo que se aplicó (2026-10-09)

Los dos flujos quedaron editados **y publicados** (un cambio en n8n no hace nada hasta que se
publica). Respaldo previo en el servidor: `/root/respaldos/<id>-antes-de-reconocer-muebles-*.json`.

**`JK - Analizar Comprobante` (`TBQmiqNMLvBaxXNF`)**

| Nodo | Qué cambió |
|---|---|
| `Analizar Comprobante` (visión) | El prompt devuelve además `tipo_imagen`, `descripcion_mueble`, `categoria_probable` y `palabras_clave`, y se le prohíbe escribir nombres de modelos del catálogo |
| `Extraer Campos` | Pasa esos campos al flujo padre cuando la imagen no es un comprobante |
| `No Es Comprobante` | Pasa de devolver solo `motivo` y `telefono` a `includeOtherFields: true`: así la descripción viaja sin enumerar campo por campo |

**`Whatsapp` (`gdRNtswXAQ5QMfvy`)**

| Nodo | Qué cambió |
|---|---|
| `Preparar Entrada` | Lee también `image.caption`: el texto que el cliente escribe con la foto ya no se pierde |
| **`Es Foto de Mueble`** (nuevo IF) | Separa "no es comprobante" (→ asesor) de "comprobante o fallo" (→ texto fijo, como antes) |
| `AI Agent` | Su entrada para una foto lleva la descripción de la visión y la instrucción de buscar en el catálogo y, si no hay coincidencia clara, mandar las fotos de los candidatos para que el cliente elija |

**Verificado:**
- El enrutado del IF es el correcto (ver el diff de versiones del flujo).
- El prompt nuevo, probado contra **la foto real del panel de TV** que mandó un cliente:
  devolvió `tipo_imagen: mueble`, `categoria_probable: Centro De TV` y una descripción útil
  ("centro de TV flotante… repisas con iluminación LED y vitrina lateral"), **sin inventarse
  ningún modelo**. El mismo prompt sigue leyendo bien un comprobante real (Global66, $35.000).

**Lo que hay que probar desde WhatsApp:** mandarle al número de la tienda la foto de un mueble
con un texto (por ejemplo "¿cuánto vale este?"). Se espera: acuse del asesor hablando del mueble
que ve y, si hay candidatos, las fotos con sus precios.

## Pendiente de decisión (tiempos)

1. **El acuse inmediato**: hoy, si el análisis entra en reintentos, el cliente espera en
   silencio. Con el acuse primero, ya recibe algo en segundos.
2. **`maxTries` de 3 a 2**: el peor caso pasa de ~3 min a ~1.

## Aviso para el dueño: la categoría "Centro De TV" está vacía

El cliente preguntaba por un centro de TV y el bot ya lo reconoce bien, pero el catálogo **no
tiene ni un producto en la categoría `Centro De TV`** (existe, con 11 categorías cargadas, pero
sin muebles). Tampoco hay Espejos ni Poltronas, aunque el prompt del asesor los nombre. Si la
tienda vende esos muebles, hay que cargarlos: mientras no estén, el bot dirá con razón que no
los encuentra.

## Lo que ya quedó hecho antes (2026-10-09, sin tocar n8n)
**Las fotos del cliente ya se ven en el panel**: en `/admin/conversaciones`, arriba de la
conversación, con su fecha, y se abren en grande. Se listan del bucket `comprobantes/<telefono>/`,
que es donde ya están **todas** las fotos de WhatsApp —incluidas las que no eran un pago, que
hasta ahora quedaban huérfanas y no se veían en ningún sitio—. En la conversación del sofá ya
aparece el pantallazo.

**El bucket quedó limpio.** Se borraron `product-images` y `jkmobiliario-products`: estaban
**vacíos** (0 objetos) y ningún producto los referenciaba. Los que quedan son los dos que se
usan de verdad: `product-images-test` (el catálogo: 144 productos apuntan ahí, 164 objetos) y
`comprobantes` (las imágenes de WhatsApp).

## Decisiones que hacen falta

Ya resueltas por el dueño (2026-10-09): se reconocen los muebles y, si no hay coincidencia, se le
mandan al cliente las fotos para que elija el más parecido; y las fotos se guardan solo de
WhatsApp.

Quedan tres, todas de la parte de tiempos:

1. **El acuse inmediato** (Fase 1): el cliente recibiría dos mensajes —el "ya la estoy mirando" y
   luego la respuesta—. ¿Se hace? Es lo que de verdad quita la espera.
2. **Bajar `maxTries` de 3 a 2**: el peor caso pasa de ~3 minutos a ~1. Si se hace, un comprobante
   cuyos dos intentos fallen se registraría sin datos (quedaría marcado para revisar).
3. **Guardar la descripción** del mueble junto a la foto (Fase 3, opcional): permitiría buscar
   "las fotos de sofás grises" en el panel.

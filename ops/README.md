# ops

Scripts de operación del servidor. No son código de la aplicación: se ejecutan a mano o
desde cron, y tocan los datos que produce n8n.

## `limpiar-volcados-memoria.{sh,js}`

Quita de la memoria de chat del asesor (`n8n_data.n8n_memory` y sus hermanas) la fontanería
que n8n guarda cuando el agente usa una herramienta: la observación cruda de la herramienta
(la respuesta de envío de Meta, hasta 4 KB) y el mensaje del modelo que solo sirve para
invocarla.

**Por qué hace falta.** Esos dos mensajes no son conversación, pero ocupan 2 de las 15
ranuras de `contextWindowLength` por cada llamada a herramienta. En una conversación real de
8 turnos con dos llamadas, la memoria guardaba 20 mensajes: la ventana solo veía los últimos
15, así que se perdían los 5 primeros —incluido lo que el cliente había pedido al principio—.
Limpiando, esos mismos 8 turnos caben en 16 mensajes.

**Qué NO se pierde.** El script solo borra mensajes **sin texto**. Ni un mensaje del cliente
ni una respuesta del asesor se tocan: eso es todo lo que el agente necesita recordar (el
nombre, un reclamo, lo último que compró). Los volcados nunca contuvieron nada de eso.

**Por qué no vive dentro de n8n.** No se puede: el nodo de MongoDB solo construye `$set` a
partir de `fields` (no hace `$pull`), y un Code node no puede cargar el driver porque la
instancia no define `NODE_FUNCTION_ALLOW_EXTERNAL`. De ahí el cron.

**Instalación** (en el servidor, como root):

```sh
crontab -l | grep -v limpiar-volcados-memoria | { cat; \
  echo '*/5 * * * * /root/home/JKMobiliario/ops/limpiar-volcados-memoria.sh'; } | crontab -
```

**Comprobarlo:**

```sh
DRY=1 /root/home/JKMobiliario/ops/limpiar-volcados-memoria.sh
cat /var/log/limpiar-volcados-memoria.log
```

El log recibe **una línea por ejecución**, pase lo que pase:

```
2026-09-21T01:24:01+00:00 TOTAL: documentos afectados=0  mensajes=0  bytes=0  modificados=0
```

Cuando además hay algo que limpiar, debajo va el informe por colección. Así se distinguen
tres estados que antes se veían igual:

| Lo que hay en el log | Qué significa |
|---|---|
| Una línea `TOTAL:` cada 5 minutos | Todo bien; no había nada que limpiar |
| Una línea `TOTAL:` con informe debajo | Se limpió algo (normal si hubo conversación) |
| **Un hueco de más de 5 minutos** | El cron dejó de correr |
| Una línea `ERROR:` | La ejecución falló; debajo va la salida cruda |

El log rota solo a `.1` al pasar de 1 MB (unos tres meses de ejecuciones).

**Aviso al editar la línea del crontab:** cron trata el `%` como fin de comando y manda el
resto como stdin. Un `printf '%s'` suelto ahí parte la línea en dos y el trabajo no corre.
Por eso el crontab solo lleva la ruta del script, y dentro del script se usa `echo`.

**Quitarlo:**

```sh
crontab -l | grep -v limpiar-volcados-memoria | crontab -
```

**Antes de tocarlo, respaldar** (borrar un documento de memoria borra la conversación entera
de ese cliente):

```sh
docker exec mongodb mongodump --uri="<uri con /n8n_data>" --collection=n8n_memory --archive=/tmp/bk.archive
```

**Aviso:** el cron apunta a este repo. Si se borra o se mueve `ops/`, el script lo detecta y
lo escribe en el log en vez de fallar en silencio.

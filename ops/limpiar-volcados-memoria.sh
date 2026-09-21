#!/bin/sh
# Limpia los volcados de herramientas de la memoria de chat del asesor.
#
# Lo llama cron cada 5 minutos. El por que y el detalle estan en
# limpiar-volcados-memoria.js, en esta misma carpeta.
#
# A mano:
#   ./limpiar-volcados-memoria.sh          -> limpia y deja una linea en el log
#   DRY=1 ./limpiar-volcados-memoria.sh    -> no toca nada, deja el informe entero
#
# El log recibe SIEMPRE una linea por ejecucion. Un hueco en el log significa
# que el cron dejo de correr, que es justo lo que hay que poder ver: si solo se
# escribiera al limpiar algo, un cron muerto y un cron sano dejarian el mismo
# log vacio.
set -u

REPO=/root/home/JKMobiliario
ENV_FILE="$REPO/Backend/.env"
JS="$REPO/ops/limpiar-volcados-memoria.js"
LOG=/var/log/limpiar-volcados-memoria.log
DRY=${DRY:-0}
# Tope del log: a ~200 bytes por ejecucion y 288 ejecuciones al dia, 1 MB son
# unos tres meses. Al pasarse se rota a .1 (una sola generacion, a proposito:
# esto no es una auditoria, es un aviso de que algo pasa).
LOG_MAX=1048576

# Anota una linea, pase lo que pase. `date` en formato ISO para poder ordenar.
anota() { printf '%s %s\n' "$(date -Is)" "$1" >> "$LOG"; }

rota() {
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt "$LOG_MAX" ]; then
    mv -f "$LOG" "$LOG.1"
  fi
}

# Si el script desaparece (por ejemplo un `git clean` en el repo), hay que
# enterarse: un cron que falla en silencio es peor que no tener cron.
if [ ! -f "$JS" ]; then
  anota "ERROR: no existe $JS. ¿Se movio o se borro el repo?"
  exit 1
fi

URI=$(grep -m1 '^MONGODB_URI=' "$ENV_FILE" | cut -d= -f2-)
if [ -z "$URI" ]; then
  anota "ERROR: no se pudo leer MONGODB_URI de $ENV_FILE"
  exit 1
fi

# La memoria vive en otra base que la del backend: se cambia en la propia cadena.
N8N=$(echo "$URI" | sed 's#/web?#/n8n_data?#')

# La cadena de conexion se pasa por entorno y no como argumento, para que no
# quede a la vista en el `ps` del host.
#
# `--file /dev/stdin` no es decorativo: sin el, mongosh lee la tuberia en modo
# interactivo y mete el prompt y basura de `| | |` en cada linea del log.
#
# `echo` y no `printf`: cron trata el `%` como fin de comando y manda el resto
# como stdin. Un `%s` suelto en la linea del crontab la parte en dos.
rota

if ! salida=$(MONGODB_URI="$N8N" docker exec -i -e MONGODB_URI -e DRY="$DRY" mongodb \
                sh -c 'mongosh "$MONGODB_URI" --quiet --file /dev/stdin' < "$JS" 2>&1); then
  anota "ERROR: la limpieza fallo (exit != 0):"
  printf '%s\n' "$salida" >> "$LOG"
  echo >> "$LOG"
  exit 1
fi

# El script siempre cierra con una linea TOTAL. Si no esta, no es que no hubiera
# nada que limpiar: es que no se llego a ejecutar la consulta. Distinguir esas
# dos cosas es el motivo de que exista esta comprobacion.
resumen=$(printf '%s\n' "$salida" | grep -E '^TOTAL:' | tail -1)
if [ -z "$resumen" ]; then
  anota "ERROR: la salida no trae linea TOTAL; mongosh no llego a informar:"
  printf '%s\n' "$salida" >> "$LOG"
  echo >> "$LOG"
  exit 1
fi

anota "$resumen"

# El detalle solo cuando hubo algo que contar.
if printf '%s\n' "$salida" | grep -qE 'afectados=[1-9]|modificados=[1-9]|AVISO'; then
  printf '%s\n' "$salida" | grep -E 'MODO|===|documentos|aplicado|TOTAL|AVISO' >> "$LOG"
  echo >> "$LOG"
fi

exit 0

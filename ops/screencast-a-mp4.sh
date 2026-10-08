#!/usr/bin/env bash
# Convierte el WebM que descarga ops/grabar-screencast.html a MP4 (H.264),
# que es lo que Meta acepta sin sorpresas.
#
#   ./ops/screencast-a-mp4.sh                       # busca el más reciente
#   ./ops/screencast-a-mp4.sh ruta/al/video.webm    # uno concreto
#
# Por qué cada cosa: el navegador graba en VP8/VP9 dentro de WebM. Meta acepta
# MP4/MOV, así que hay que transcodificar a H.264. `-pix_fmt yuv420p` es lo que
# hace que se reproduzca en cualquier reproductor; sin eso, algunos lo ven negro.
# `+faststart` mueve el índice al principio para que se pueda ver en streaming.
# `-an` quita el audio: no hace falta y el revisor no lo necesita.

set -euo pipefail

ENTRADA="${1:-}"

if [[ -z "$ENTRADA" ]]; then
  ENTRADA="$(find "$HOME/Descargas" "$HOME/Downloads" "$HOME/Vídeos" "$HOME/Videos" \
    -maxdepth 2 -name 'screencast-*.webm' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)"
fi

if [[ -z "${ENTRADA:-}" || ! -f "$ENTRADA" ]]; then
  echo "No encontré ningún screencast-*.webm." >&2
  echo "Graba primero con ops/grabar-screencast.html, o pásame la ruta:" >&2
  echo "  $0 /ruta/al/video.webm" >&2
  exit 1
fi

SALIDA="${ENTRADA%.webm}.mp4"

echo "Entrada: $ENTRADA"
echo "  $(du -h "$ENTRADA" | cut -f1), $(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$ENTRADA")"

ffmpeg -hide_banner -loglevel error -stats \
  -i "$ENTRADA" \
  -c:v libx264 -preset medium -crf 22 \
  -pix_fmt yuv420p -profile:v high -level 4.0 \
  -movflags +faststart -an \
  "$SALIDA"

echo
echo "Listo: $SALIDA"
echo "  $(du -h "$SALIDA" | cut -f1)"
echo
echo "Comprueba antes de subirlo que se ve y se oye lo que tiene que verse:"
echo "  xdg-open \"$SALIDA\""

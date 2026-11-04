#!/bin/sh
# Transmission › "script-torrent-done": avisa o PugotiCine que um download terminou, para ele organizar em
# Filmes/Séries/Animes (via Radarr/Sonarr) os downloads colados à mão. Os do Radarr (radarr/), do Sonarr
# (tv-sonarr/) e de música ficam como estão. O token fica em pugoticine-organizador.token (só leitura do dono).
DIR_SCRIPT=$(dirname "$0")
URL=${PUGOTICINE_ORGANIZADOR_URL:-http://172.17.0.1:3012/api/organizador/concluido}
TOKEN=$(cat "$DIR_SCRIPT/pugoticine-organizador.token" 2>/dev/null)
[ -n "$TOKEN" ] || exit 0
case "$TR_TORRENT_DIR" in */radarr|*/radarr/*|*/tv-sonarr|*/tv-sonarr/*|*/music|*/music/*) exit 0 ;; esac
# JSON: escapa \ e " do nome.
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
CORPO=$(printf '{"pasta":"%s/%s","hash":"%s","nome":"%s"}' "$(esc "$TR_TORRENT_DIR")" "$(esc "$TR_TORRENT_NAME")" "$(esc "$TR_TORRENT_HASH")" "$(esc "$TR_TORRENT_NAME")")
curl -s -m 15 -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" --data "$CORPO" "$URL" >/dev/null 2>&1 || true
exit 0

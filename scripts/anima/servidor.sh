#!/usr/bin/env bash
# Fork Ânima — operação do stack num servidor Ânima (AGENTS.anima.md §8 e §9).
#
# Quem chama é o Makefile (`make <alvo>`); ninguém precisa decorar isto. Roda na
# raiz do checkout do fork (/srv/stacks/deskcomm no servidor) e reaproveita o
# kit do upstream (hostgator-setup-kit/): funções do _common.sh e os scripts
# backup.sh, restore.sh, healthcheck.sh e marca-emails.sh. O update.sh do kit
# NUNCA é chamado: ele regrava APP_IMAGE com a imagem oficial.
#
# Tudo mora dentro de funções e o despacho é a última linha: o `deploy` troca o
# checkout (git checkout <tag>), e o bash lê o script aos pedaços — sem isto, a
# versão nova deste arquivo seria lida no meio da execução da antiga.

raiz() { cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd; }
RAIZ="$(raiz)"
KIT_DIR="$RAIZ/hostgator-setup-kit"
COMPOSE_ANIMA="docker-compose.anima.yml"
ENV_SEMENTE=".env.anima.example"

# ── Ajudantes ────────────────────────────────────────────────────────────────

carregar_kit() {
  # shellcheck source=../../hostgator-setup-kit/_common.sh
  source "$KIT_DIR/_common.sh"
  cd "$RAIZ"
}

# O .env vence o padrão; o ambiente de quem chamou não entra (o load_env do kit
# exporta o .env por cima). Sem .env, valem os padrões da semente.
padroes() {
  : "${COMPOSE_PROJECT_NAME:=deskcomm}"
  : "${APPDATA_DIR:=/srv/appdata/$COMPOSE_PROJECT_NAME}"
  : "${STORAGE_DIR:=/srv/storage/$COMPOSE_PROJECT_NAME}"
  : "${BACKUP_DIR:=/srv/backups/$COMPOSE_PROJECT_NAME}"
  : "${PROXY_NETWORK_NAME:=anima_proxymanager_shared_network}"
  : "${ANIMA_IMAGE:=anima-hub}"
  : "${ANIMA_BUILD_HEAP_MB:=6144}"
  : "${NPM_TOKEN_FILE:=$RAIZ/.runtime/npm-token}"
  export COMPOSE_PROJECT_NAME APPDATA_DIR STORAGE_DIR BACKUP_DIR
}

entrar() {
  carregar_kit
  enter_project
  padroes
}

# Lista de -f: a mesma do kit (dc_files: prod + single-server + npm + overlays
# do Supabase) e o override Ânima por último.
arquivos() { printf '%s -f %s' "$(dc_files)" "$COMPOSE_ANIMA"; }

# shellcheck disable=SC2046 # a lista de -f é separada por espaço de propósito
dca() { docker compose -p "$COMPOSE_PROJECT_NAME" $(arquivos) --env-file .env "$@"; }

confirmar() {
  [ "${YES:-0}" = "1" ] && return 0
  local r
  read -r -p "$1 Digite 'sim' para continuar: " r || r=""
  [ "$r" = "sim" ] || die "Cancelado."
}

versao_base() { tr -d '[:space:]' < "$RAIZ/.anima-upstream"; }

exigir_tag() {
  [ -n "${TAG:-}" ] || die "Informe a versão: TAG=AAAA.MM.N (ex.: TAG=2026.11.1)."
  [[ "$TAG" =~ ^[0-9]{4}\.[0-9]{1,2}\.[0-9]+$ ]] || die "TAG '$TAG' fora do formato ANO.MES.SEQUENCIAL (ex.: 2026.11.1)."
}

gravar_env() { set_env_var "$RAIZ/.env" "$1" "$2"; export "$1=$2"; }

# ── setup ────────────────────────────────────────────────────────────────────

criar_volume() {  # criar_volume <volume do compose> <pasta>
  local nome="${COMPOSE_PROJECT_NAME}_$1" pasta="$2" atual
  mkdir -p "$pasta" 2>/dev/null \
    || die "Não consegui criar $pasta. Crie as pastas com: sudo mkdir -p $pasta && sudo chown -R \"\$USER\" ${pasta%/*}"
  if docker volume inspect "$nome" >/dev/null 2>&1; then
    atual="$(docker volume inspect -f '{{index .Options "device"}}' "$nome")"
    if [ "$atual" = "$pasta" ]; then
      c_dim "  volume $nome → $pasta (já existia)"
    else
      c_ylw "⚠ o volume $nome já existe e aponta para '${atual:-volume comum do Docker}', não para $pasta."
      c_ylw "  Não mexi nele (tem dados). Para migrar: make down, copie os dados, docker volume rm $nome, make setup."
    fi
    return 0
  fi
  docker volume create --driver local \
    --opt type=none --opt o=bind --opt "device=$pasta" "$nome" >/dev/null
  c_grn "  volume $nome → $pasta"
}

cmd_setup() {
  carregar_kit
  if [ ! -f .env ]; then
    cp "$ENV_SEMENTE" .env
    chmod 600 .env
    c_grn "✓ .env criado a partir de $ENV_SEMENTE — revise DOMAIN, PROXY_NETWORK_APP_IP e Resend antes de seguir."
  else
    c_dim "  .env já existe (não sobrescrevi)"
  fi
  load_env .env
  padroes

  step "Pastas em /srv"
  local d
  for d in "$APPDATA_DIR" "$STORAGE_DIR" "$BACKUP_DIR"; do
    mkdir -p "$d" 2>/dev/null \
      || die "Não consegui criar $d. Rode uma vez: sudo mkdir -p $d && sudo chown -R \"\$USER\" $d"
  done
  chmod 700 "$BACKUP_DIR" 2>/dev/null || true
  c_grn "✓ $APPDATA_DIR, $STORAGE_DIR, $BACKUP_DIR"

  step "Volumes ligados às pastas"
  criar_volume waha-data     "$APPDATA_DIR/waha/sessions"
  criar_volume waha-media    "$STORAGE_DIR/waha-media"
  criar_volume wacalls-data  "$APPDATA_DIR/wacalls"
  criar_volume asterisk-data "$APPDATA_DIR/asterisk/data"
  criar_volume asterisk-logs "$APPDATA_DIR/asterisk/logs"

  step "Rede do Nginx Proxy Manager"
  if docker network inspect "$PROXY_NETWORK_NAME" >/dev/null 2>&1; then
    c_grn "✓ rede $PROXY_NETWORK_NAME existe"
    c_dim "  sub-rede: $(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$PROXY_NETWORK_NAME")— PROXY_NETWORK_APP_IP=${PROXY_NETWORK_APP_IP:-?}"
  else
    c_ylw "⚠ a rede $PROXY_NETWORK_NAME não existe. Ela é do Nginx Proxy Manager: suba o NPM antes de 'make up'."
  fi

  step "Token do design system (para o build)"
  mkdir -p "$(dirname "$NPM_TOKEN_FILE")"
  if [ ! -s "$NPM_TOKEN_FILE" ]; then
    (umask 077 && : > "$NPM_TOKEN_FILE")
    c_ylw "⚠ $NPM_TOKEN_FILE está vazio: cole nele um PAT do GitHub com read:packages (uma linha, sem espaços)."
  else
    chmod 600 "$NPM_TOKEN_FILE"
    c_grn "✓ $NPM_TOKEN_FILE preenchido"
  fi
}

# ── Instalação inicial (Supabase no servidor + banco + dono) ─────────────────

cmd_server_install() {
  entrar
  [ "${REVERSE_PROXY:-}" = "npm" ] || die "REVERSE_PROXY precisa ser npm no .env (rode make setup)."
  [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "crm.exemplo.com.br" ] || die "Preencha DOMAIN no .env."
  docker network inspect "$PROXY_NETWORK_NAME" >/dev/null 2>&1 \
    || die "A rede $PROXY_NETWORK_NAME não existe: suba o Nginx Proxy Manager primeiro."

  # O install.sh grava a MESMA tag para app, worker e scheduler. A instalação
  # nasce com as três imagens OFICIAIS da versão base do fork (todas
  # publicadas), cria banco, segredos e dono; o `make deploy` troca só o app
  # pela imagem Ânima. Sem isto, ele pegaria a última versão do upstream, que
  # pode ser mais nova que o código do fork.
  if [ -z "${APP_IMAGE:-}" ]; then
    gravar_env APP_IMAGE "${IMG_APP}:$(versao_base)"
  fi

  # Com o Caddy do kit, o app chega ao Supabase pelo apelido DOMAIN na rede
  # interna. Com o NPM, o Caddy não sobe e o apelido some: sem esta variável o
  # servidor do app chama https://DOMAIN, que não resolve por dentro, e todo
  # login vira `fetch failed`. O apelido supabase-envoy é do
  # hostgator-setup-kit/supabase-single-server.override.yml. Gravar ANTES do
  # instalador faz o app nascer já com ela (o install.sh preserva o que não é dele).
  gravar_supabase_server_url

  step "Instalador do kit (Supabase no servidor + CRM)"
  REVERSE_PROXY=npm bash "$KIT_DIR/install-single-server.sh" --domain "$DOMAIN"

  # O instalador grava APP_NAME=DeskcommCRM; a semente Ânima volta.
  load_env .env
  gravar_env APP_NAME "Ânima Hub"
  gravar_supabase_server_url
  cmd_supabase_proxy

  # A organização real já nasce completa quando o arquivo está no lugar (seção 3.2 do README).
  if [ -f "${ANIMA_SEED_FILE:-$RAIZ/.runtime/anima.seed.json}" ]; then
    cmd_seeds_anima
  else
    c_ylw "• sem .runtime/anima.seed.json: a organização Ânima Hub fica para depois (make seeds-anima)."
  fi
  c_grn "✓ instalação base pronta. Próximo passo: make deploy TAG=<versão do fork>"
}

SUPABASE_URL_INTERNA="http://supabase-envoy:8000"
gravar_supabase_server_url() {
  [ -n "${SUPABASE_SERVER_URL:-}" ] && return 0
  gravar_env SUPABASE_SERVER_URL "$SUPABASE_URL_INTERNA"
  c_grn "✓ SUPABASE_SERVER_URL=$SUPABASE_URL_INTERNA (o app fala com o Supabase pela rede interna)"
}

# O gateway do Supabase (envoy) atende /auth/v1, /rest/v1… Com o Caddy do kit
# fora, quem roteia esses caminhos é o NPM, e para isso o gateway precisa estar
# na rede dele. Recriar o Supabase tira a conexão: o `up` e o `deploy` refazem.
cmd_supabase_proxy() {
  [ "${SINGLE_SERVER:-0}" = "1" ] || return 0
  local gw alias="${COMPOSE_PROJECT_NAME}-supabase-gw"
  gw="$(docker ps -q --filter "label=com.docker.compose.project=$(projeto_do_supabase)" \
        --filter label=com.docker.compose.service=api-gw | head -1)"
  [ -n "$gw" ] || { c_ylw "⚠ gateway do Supabase não está no ar (projeto $(projeto_do_supabase))."; return 0; }
  if docker inspect -f '{{json .NetworkSettings.Networks}}' "$gw" | grep -q "\"$PROXY_NETWORK_NAME\""; then
    c_dim "  gateway do Supabase já está na rede do NPM ($alias:8000)"
  else
    docker network connect --alias "$alias" "$PROXY_NETWORK_NAME" "$gw"
    c_grn "✓ gateway do Supabase ligado à rede do NPM como $alias:8000"
  fi
}

# ── Build da imagem Ânima ────────────────────────────────────────────────────

cmd_build() {
  entrar
  exigir_tag
  [ -s "$NPM_TOKEN_FILE" ] || die "Sem token do design system em $NPM_TOKEN_FILE (make setup explica)."
  if [ "${ALLOW_DIRTY:-0}" != "1" ]; then
    [ -z "$(git status --porcelain --untracked-files=no)" ] || die "Há mudanças não commitadas no checkout. Commit/descarte, ou ALLOW_DIRTY=1."
    [ "$(git rev-parse HEAD)" = "$(git rev-parse "$TAG^{commit}" 2>/dev/null)" ] \
      || die "O checkout não está na tag $TAG (git checkout $TAG, ou ALLOW_DIRTY=1 para construir o que está aqui)."
  fi
  # O token vira header HTTP no pnpm: uma quebra de linha no fim do arquivo (o
  # editor põe sozinho) reprova o build com ERR_INVALID_CHAR. O build lê uma
  # cópia limpa, 600, apagada ao sair; o arquivo original não é tocado.
  _SEGREDO_NPM="$(umask 077 && mktemp)"
  trap 'rm -f "${_SEGREDO_NPM:-}"' EXIT
  tr -d '\r\n\t ' < "$NPM_TOKEN_FILE" > "$_SEGREDO_NPM"
  [ -s "$_SEGREDO_NPM" ] || die "O token em $NPM_TOKEN_FILE só tem espaços ou quebras de linha."
  step "Construindo ${ANIMA_IMAGE}:${TAG} (~10 min, ~8 GB de RAM livres)"
  DOCKER_BUILDKIT=1 docker build \
    --secret "id=npm_token,src=$_SEGREDO_NPM" \
    --build-arg "APP_VERSION=$TAG" \
    --build-arg "NODE_HEAP_MB=$ANIMA_BUILD_HEAP_MB" \
    -t "${ANIMA_IMAGE}:${TAG}" .
  rm -f "$_SEGREDO_NPM"
  c_grn "✓ imagem ${ANIMA_IMAGE}:${TAG}"
}

# ── Subida e estado ──────────────────────────────────────────────────────────

cmd_up() {
  entrar
  [ "${APP_IMAGE:-}" != "" ] || die "APP_IMAGE vazio no .env: rode make server-install e make deploy."
  dca up -d --remove-orphans
  cmd_supabase_proxy
}
cmd_down()    { entrar; dca down; }
cmd_restart() { entrar; dca restart ${SERVICE:-}; }
cmd_ps()      { entrar; dca ps; }
cmd_logs()    { entrar; dca logs --tail="${TAIL:-200}" -f ${SERVICE:-}; }
cmd_shell()   { entrar; dca exec "${SERVICE:-app}" sh; }
cmd_config()  { entrar; dca config; }

cmd_down_v() {
  entrar
  confirmar "Isto derruba o stack e apaga os volumes NÃO externos do projeto. Os dados em $APPDATA_DIR e $STORAGE_DIR ficam."
  dca down -v
}

# ── Saúde ────────────────────────────────────────────────────────────────────

# Sonda pública: `/` responde 200 e `/app` 307 (redireciona para o login). O 200
# sozinho não prova que é o app (CLAUDE.md, Deploy em produção).
sonda_publica() {
  local raiz_codigo app_codigo
  raiz_codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/" || true)"
  app_codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/app" || true)"
  if [ "$raiz_codigo" = "200" ] && [ "$app_codigo" = "307" ]; then
    c_grn "✓ https://$DOMAIN: / → 200, /app → 307"
    return 0
  fi
  c_red "⛔ https://$DOMAIN: / → $raiz_codigo (esperado 200), /app → $app_codigo (esperado 307)"
  c_red "  Confira o Proxy Host do NPM (docs/anima/README.md §4)."
  return 1
}

cmd_health() {
  entrar
  local rc=0
  bash "$KIT_DIR/healthcheck.sh" || rc=1
  # Só avisa: a variável é do operador, e o `make health` não regrava o .env.
  if [ "${SINGLE_SERVER:-0}" = "1" ] && [ -z "${SUPABASE_SERVER_URL:-}" ]; then
    c_red "⛔ SUPABASE_SERVER_URL vazio: com o NPM o app não alcança o Supabase (login com fetch failed)."
    c_red "  Acrescente SUPABASE_SERVER_URL=$SUPABASE_URL_INTERNA ao .env e rode make up."
    rc=1
  fi
  [ "${SKIP_PUBLIC:-0}" = "1" ] || sonda_publica || rc=1
  return "$rc"
}

# ── Backup e restauração ─────────────────────────────────────────────────────

cmd_backup() {
  entrar
  BACKUP_DIR="$BACKUP_DIR" bash "$KIT_DIR/backup.sh"
  local ts; ts="$(date +%Y%m%d-%H%M%S)"
  (umask 077 && cp .env "$BACKUP_DIR/env-$ts")
  if [ "${SINGLE_SERVER:-0}" = "1" ] && [ -f "$(dir_do_supabase)/.env" ]; then
    (umask 077 && cp "$(dir_do_supabase)/.env" "$BACKUP_DIR/supabase-env-$ts")
  fi
  podar_backups "$BACKUP_DIR" "${BACKUP_KEEP:-14}"
  c_grn "✓ .env guardado em $BACKUP_DIR/env-$ts"
}

cmd_restore() {
  entrar
  [ -n "${FILE:-}" ] || die "Informe o dump: FILE=$BACKUP_DIR/db-AAAAMMDD-HHMMSS.sql.gz (ls $BACKUP_DIR)."
  confirmar "Restaurar $FILE no banco (só funciona num banco VAZIO; o kit recusa se já houver tabelas)."
  bash "$KIT_DIR/restore.sh" "$FILE"
}

# ── Deploy, update e rollback ────────────────────────────────────────────────

aplicar_banco() {
  step "Atualizando o banco (supabase/baseline.sql da versão $TAG)"
  if reaplicar_baseline "$RAIZ/supabase/baseline.sql" "$BACKUP_DIR/banco-$TAG.log"; then
    c_grn "✓ banco atualizado"
  else
    c_red "⛔ o baseline não terminou limpo:"
    printf '%s\n' "$BASELINE_INESPERADO"
    die "Parei antes de trocar a imagem. Log: $BACKUP_DIR/banco-$TAG.log"
  fi
}

trocar_imagem() {  # trocar_imagem <imagem do app>
  local base; base="$(versao_base)"
  gravar_env APP_IMAGE "$1"
  gravar_env APP_PULL_POLICY never
  gravar_env WORKER_IMAGE "${IMG_WORKER}:${base}"
  gravar_env WORKER_PULL_POLICY missing
  gravar_env SCHEDULER_IMAGE "${IMG_SCHEDULER}:${base}"
  gravar_env SCHEDULER_PULL_POLICY missing
}

subir_e_conferir() {
  step "Subindo o stack"
  dca pull worker scheduler
  dca up -d --remove-orphans
  cmd_supabase_proxy
  step "Conferindo a saúde"
  wait_app_healthy 40 3 >/dev/null || return 1
  [ "${SKIP_PUBLIC:-0}" = "1" ] || sonda_publica || return 1
}

cmd_deploy() {
  entrar
  exigir_tag
  local anterior="${APP_IMAGE:-}" ref_anterior
  ref_anterior="$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)"

  step "Código da versão $TAG"
  git fetch --tags origin
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || die "A tag $TAG não existe no fork."
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "Há mudanças não commitadas no checkout; o deploy não as apaga."
  git -c advice.detachedHead=false checkout "$TAG"

  step "Backup antes de mexer"
  cmd_backup

  cmd_build
  aplicar_banco

  if [ -n "$anterior" ] && [ "$anterior" != "${ANIMA_IMAGE}:${TAG}" ]; then
    gravar_env ANIMA_PREVIOUS_IMAGE "$anterior"
    gravar_env ANIMA_PREVIOUS_REF "$ref_anterior"
  fi
  trocar_imagem "${ANIMA_IMAGE}:${TAG}"
  gravar_env ANIMA_VERSION "$TAG"

  if subir_e_conferir; then
    c_grn "✓ versão $TAG no ar (anterior: ${anterior:-nenhuma})"
    return 0
  fi

  c_red "⛔ a versão $TAG não ficou saudável."
  if [ -z "$anterior" ]; then
    die "Não há versão anterior para voltar. Logs: make logs SERVICE=app"
  fi
  c_ylw "→ voltando para $anterior (rollback automático; o banco NÃO volta, ele é só para frente)"
  YES=1 cmd_rollback_para "$anterior" "$ref_anterior"
  die "Deploy de $TAG desfeito. Investigue com: make logs SERVICE=app"
}

cmd_rollback_para() {  # imagem [ref do código]
  local imagem="$1" ref="${2:-}"
  docker image inspect "$imagem" >/dev/null 2>&1 \
    || [[ "$imagem" == ghcr.io/* ]] \
    || die "A imagem $imagem não existe mais neste servidor."
  local atual="${APP_IMAGE:-}"
  if [ -n "$ref" ] && git rev-parse -q --verify "$ref^{commit}" >/dev/null; then
    git -c advice.detachedHead=false checkout "$ref"
  fi
  gravar_env APP_IMAGE "$imagem"
  case "$imagem" in ghcr.io/*) gravar_env APP_PULL_POLICY missing ;; *) gravar_env APP_PULL_POLICY never ;; esac
  gravar_env ANIMA_PREVIOUS_IMAGE "$atual"
  gravar_env ANIMA_VERSION "${imagem##*:}"
  dca up -d app
  wait_app_healthy 40 3 >/dev/null && c_grn "✓ app de volta em $imagem" || c_red "⛔ $imagem também não ficou saudável: make logs SERVICE=app"
}

cmd_rollback() {
  entrar
  [ -n "${ANIMA_PREVIOUS_IMAGE:-}" ] || die "Não há versão anterior registrada (ANIMA_PREVIOUS_IMAGE no .env)."
  confirmar "Voltar o app de ${APP_IMAGE:-?} para $ANIMA_PREVIOUS_IMAGE (o banco não volta)."
  cmd_rollback_para "$ANIMA_PREVIOUS_IMAGE" "${ANIMA_PREVIOUS_REF:-}"
}

# ── Marca ────────────────────────────────────────────────────────────────────

cmd_brand_emails() {
  entrar
  bash "$KIT_DIR/marca-emails.sh"
  if [ "${SINGLE_SERVER:-0}" = "1" ]; then
    c_dim "  Supabase no servidor: o marca-emails.sh grava no .env do Supabase; recriando o auth para reler."
    dc_supabase up -d --no-deps auth
    cmd_supabase_proxy
  fi
}

# ── Seeds ────────────────────────────────────────────────────────────────────

# Roda um seed de scripts/anima/seeds NO SERVIDOR. O servidor não tem Node nem node_modules,
# e a imagem do app não leva scripts/anima (.dockerignore): roda num contêiner node
# descartável, na rede interna do Supabase, que instala só o cliente do Supabase, o zod e o
# tsx nas versões do package.json. Os seeds só aceitam o gateway interno (`supabase-envoy`),
# que não existe fora desta rede. Segredos vão por variável herdada (-e NOME, sem valor):
# não aparecem na linha de comando.
#   rodar_seed <arquivo.ts> [opções do docker...] -- [argumentos do seed...]
rodar_seed() {
  local script="$1"; shift
  local docker_extra=()
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do docker_extra+=("$1"); shift; done
  [ "${1:-}" = "--" ] && shift
  [ "${SINGLE_SERVER:-0}" = "1" ] || die "Os seeds no servidor pedem o Supabase no próprio servidor (SINGLE_SERVER=1)."
  [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || die "SUPABASE_SERVICE_ROLE_KEY vazio no .env."
  [ -n "${SINGLE_SERVER_NETWORK:-}" ] || die "SINGLE_SERVER_NETWORK vazio no .env."
  NEXT_PUBLIC_SUPABASE_URL="http://supabase-envoy:8000" \
  NEXT_PUBLIC_APP_URL="https://$DOMAIN" \
  docker run --rm --network "$SINGLE_SERVER_NETWORK" \
    -e NEXT_PUBLIC_SUPABASE_URL -e NEXT_PUBLIC_APP_URL -e SUPABASE_SERVICE_ROLE_KEY \
    -v "$RAIZ/scripts:/src/scripts:ro" -v "$RAIZ/package.json:/src/package.json:ro" \
    "${docker_extra[@]}" \
    node:22-alpine sh -euc '
      script="$1"; shift
      mkdir -p /w && cp -r /src/scripts /w/ && cd /w
      versao() { node -p "const p=require(\"/src/package.json\");(p.dependencies||{})[\"$1\"]||p.devDependencies[\"$1\"]"; }
      echo "{\"private\":true}" > package.json
      npm install --no-audit --no-fund --loglevel=error \
        "@supabase/supabase-js@$(versao @supabase/supabase-js)" "zod@$(versao zod)" "tsx@$(versao tsx)" >/dev/null
      exec node_modules/.bin/tsx "scripts/anima/seeds/$script" "$@"
    ' seed "$script" "$@"
}

# Organização de demonstração (scripts/anima/seeds/demo-agencia.ts).
cmd_seeds_demo() {
  entrar
  local args=()
  [ "${RECRIAR:-0}" = "1" ] && args+=(--recriar)
  [ -n "${EMAIL:-}" ] && args+=("--email=$EMAIL")
  [ -n "${IA_PROVEDOR:-}" ] && args+=("--provedor=$IA_PROVEDOR")
  [ -n "${IA_MODELO:-}" ] && args+=("--modelo=$IA_MODELO")
  step "Semeando a organização de demonstração em https://$DOMAIN"
  # DEMONSTRADOR/SENHA (do make) vencem DEMO_DEMONSTRADOR/DEMO_SENHA (.env).
  DEMO_DEMONSTRADOR="${DEMONSTRADOR:-${DEMO_DEMONSTRADOR:-}}" \
  DEMO_SENHA="${SENHA:-${DEMO_SENHA:-}}" \
  rodar_seed demo-agencia.ts -e DEMO_DEMONSTRADOR -e DEMO_SENHA -- "${args[@]}"
}

# Organização REAL da Ânima Hub (scripts/anima/seeds/anima-hub.ts). O arquivo com e-mails,
# razão social e IA fica fora do git: ANIMA_SEED_FILE (padrão .runtime/anima.seed.json).
cmd_seeds_anima() {
  entrar
  local arquivo="${ANIMA_SEED_FILE:-$RAIZ/.runtime/anima.seed.json}"
  if [ ! -f "$arquivo" ]; then
    die "Sem $arquivo. Copie scripts/anima/seeds/anima.seed.example.json para lá (chmod 600) e preencha."
  fi
  step "Aplicando a organização Ânima Hub em https://$DOMAIN"
  rodar_seed anima-hub.ts -v "$arquivo:/run/anima.seed.json:ro" -- --config=/run/anima.seed.json
}

# ── Despacho ─────────────────────────────────────────────────────────────────

main() {
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    setup) cmd_setup ;;
    server-install) cmd_server_install ;;
    supabase-proxy) entrar; cmd_supabase_proxy ;;
    build) cmd_build ;;
    up) cmd_up ;;
    down) cmd_down ;;
    down-v) cmd_down_v ;;
    restart) cmd_restart ;;
    ps) cmd_ps ;;
    logs) cmd_logs ;;
    shell) cmd_shell ;;
    config) cmd_config ;;
    health) cmd_health ;;
    backup) cmd_backup ;;
    restore) cmd_restore ;;
    deploy|update) cmd_deploy ;;
    rollback) cmd_rollback ;;
    brand-emails) cmd_brand_emails ;;
    seeds-demo) cmd_seeds_demo ;;
    seeds-anima) cmd_seeds_anima ;;
    *) echo "uso: $0 <comando> (veja: make help)" >&2; exit 2 ;;
  esac
}

main "$@"

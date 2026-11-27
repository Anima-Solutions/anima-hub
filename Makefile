# Fork Ânima — interface única de desenvolvimento, deploy e operação
# (AGENTS.anima.md §9). `make` sozinho lista os alvos.
#
# A configuração do servidor mora no .env (semente: .env.anima.example); quem a
# lê é scripts/anima/servidor.sh, com o mesmo leitor do kit do upstream. O
# Makefile não faz `include .env`: segredos com `$` seriam expandidos pelo make.
#
# Variáveis de linha de comando:
#   TAG=2026.11.1   versão do fork (ANO.MES.SEQUENCIAL) em build/deploy/update/tag
#   TAG=v1.127.0    tag do upstream em sync-upstream
#   SERVICE=app     serviço em logs/shell/restart
#   FILE=...        dump do banco em restore
#   YES=1           pula a confirmação de down-v, restore e rollback

SHELL := /usr/bin/env bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help

SERVIDOR := bash scripts/anima/servidor.sh
env_get = $(shell sed -n 's/^$(1)=//p' .env 2>/dev/null | tail -1)

APP         := $(or $(call env_get,COMPOSE_PROJECT_NAME),deskcomm)
STACK_DIR   := $(or $(call env_get,STACK_DIR),/srv/stacks/$(APP))
APPDATA_DIR := $(or $(call env_get,APPDATA_DIR),/srv/appdata/$(APP))
STORAGE_DIR := $(or $(call env_get,STORAGE_DIR),/srv/storage/$(APP))
BACKUP_DIR  := $(or $(call env_get,BACKUP_DIR),/srv/backups/$(APP))
IMAGE       := $(or $(call env_get,ANIMA_IMAGE),anima-hub)
UPSTREAM    := $(shell tr -d '[:space:]' < .anima-upstream 2>/dev/null)

TAG     ?=
SERVICE ?=
FILE    ?=
YES     ?= 0
export TAG SERVICE FILE YES

# ── Ajuda ────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Lista os alvos
	@printf 'Ânima Hub — make <alvo>\n\n'
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[1m%-24s\033[0m %s\n", $$1, $$2} /^# ── / {sub(/^# ── /, ""); sub(/ [^ ]+$$/, ""); printf "\n%s\n", $$0}' $(MAKEFILE_LIST)
	@printf '\nConfiguração: app=%s imagem=%s base upstream=%s\n' '$(APP)' '$(IMAGE)' '$(UPSTREAM)'
	@printf '  stack=%s appdata=%s storage=%s backups=%s\n' '$(STACK_DIR)' '$(APPDATA_DIR)' '$(STORAGE_DIR)' '$(BACKUP_DIR)'

# ── Desenvolvimento ──────────────────────────────────────────────────────────

.PHONY: install dev check e2e ds-update seeds-check seeds-demo
install: ## Instala as dependências (pnpm, com o .npmrc do design system)
	@[ -n "$${NPM_TOKEN:-$${NODE_AUTH_TOKEN:-}}" ] || { echo "✖ defina NPM_TOKEN (PAT com read:packages)"; exit 1; }
	NPM_TOKEN="$${NPM_TOKEN:-$${NODE_AUTH_TOKEN:-}}" pnpm install

dev: ## Sobe o WAHA local e o Next em modo dev
	docker compose up -d
	pnpm dev

check: ## Gates: typecheck, lint e testes unitários
	pnpm typecheck
	pnpm lint
	pnpm test:unit

e2e: ## Testes e2e (Playwright; precisa do app no ar)
	pnpm test:e2e

seeds-check: ## Typecheck e testes dos seeds de demonstração (o pnpm typecheck não cobre scripts/)
	pnpm exec tsc -p scripts/anima/seeds/tsconfig.json
	pnpm exec vitest run scripts/anima/seeds

seeds-demo: ## Organização de demonstração (local ou no servidor; RECRIAR=1, EMAIL=, IA_PROVEDOR=, IA_MODELO=)
	@if [ -f .env ] && grep -q '^SINGLE_SERVER=1' .env; then \
	  RECRIAR="$(RECRIAR)" EMAIL="$(EMAIL)" IA_PROVEDOR="$(IA_PROVEDOR)" IA_MODELO="$(IA_MODELO)" bash scripts/anima/servidor.sh seeds-demo; \
	else \
	  pnpm exec tsx scripts/anima/seeds/demo-agencia.ts $(if $(RECRIAR),--recriar) $(if $(EMAIL),--email=$(EMAIL)) $(if $(IA_PROVEDOR),--provedor=$(IA_PROVEDOR)) $(if $(IA_MODELO),--modelo=$(IA_MODELO)); \
	fi

ds-update: ## Atualiza o design system para a última versão e roda check
	@atual="$$(node -p "require('./package.json').dependencies['@anima-solutions/design-system']")"; \
	 nova="$$(NPM_TOKEN="$${NPM_TOKEN:-$${NODE_AUTH_TOKEN:-}}" pnpm view @anima-solutions/design-system version)"; \
	 echo "design system: $$atual → $$nova"; \
	 if [ "$${atual%%.*}" != "$${nova%%.*}" ] && [ "$${ALLOW_MAJOR:-0}" != 1 ]; then \
	   echo "✖ mudança de major ($$atual → $$nova): pede aprovação (AGENTS.anima.md §10). Aprovado? ALLOW_MAJOR=1 make ds-update"; exit 1; fi; \
	 NPM_TOKEN="$${NPM_TOKEN:-$${NODE_AUTH_TOKEN:-}}" pnpm add --save-exact "@anima-solutions/design-system@$$nova"
	pnpm exec tsx scripts/anima/gerar-tokens-ds.ts
	$(MAKE) check

# ── Servidor: instalação ─────────────────────────────────────────────────────

.PHONY: setup server-install supabase-proxy
setup: ## Cria as pastas /srv, os volumes, confere a rede do NPM e cria o .env
	$(SERVIDOR) setup

server-install: ## Primeira instalação: Supabase no servidor, banco, segredos e dono (kit)
	$(SERVIDOR) server-install

supabase-proxy: ## Liga o gateway do Supabase à rede do NPM (/auth/v1, /rest/v1…)
	$(SERVIDOR) supabase-proxy

# ── Servidor: versão ─────────────────────────────────────────────────────────

.PHONY: tag build deploy update rollback
tag: ## Cria e envia a tag de versão do fork no commit atual (TAG=2026.11.1)
	@[[ "$(TAG)" =~ ^[0-9]{4}\.[0-9]{1,2}\.[0-9]+$$ ]] || { echo "✖ TAG=ANO.MES.SEQUENCIAL (ex.: 2026.11.1)"; exit 1; }
	@[ -z "$$(git status --porcelain --untracked-files=no)" ] || { echo "✖ há mudanças não commitadas"; exit 1; }
	git tag -a "$(TAG)" -m "Ânima Hub $(TAG) (base upstream $(UPSTREAM))"
	git push origin "$(TAG)"

build: ## Constrói a imagem Ânima neste servidor (TAG=; ALLOW_DIRTY=1 para o checkout atual)
	$(SERVIDOR) build

deploy: ## Backup → build da TAG → banco → pull worker/scheduler → up → saúde → rollback se falhar
	$(SERVIDOR) deploy

update: ## Mesmo fluxo do deploy para uma versão nova, registrando a anterior
	$(SERVIDOR) update

rollback: ## Volta o app para a imagem anterior registrada (pede confirmação)
	$(SERVIDOR) rollback

# ── Servidor: operação ───────────────────────────────────────────────────────

.PHONY: up down down-v restart ps logs shell config health backup restore brand-emails
up: ## Sobe o stack (prod + single-server + npm + anima)
	$(SERVIDOR) up

down: ## Para o stack (dados preservados)
	$(SERVIDOR) down

down-v: ## Para o stack e apaga volumes não externos (pede confirmação)
	$(SERVIDOR) down-v

restart: ## Reinicia o stack, ou um serviço (SERVICE=)
	$(SERVIDOR) restart

ps: ## Estado dos contêineres
	$(SERVIDOR) ps

logs: ## Logs ao vivo (SERVICE= opcional, TAIL=200)
	$(SERVIDOR) logs

shell: ## Shell num contêiner (SERVICE=app)
	$(SERVIDOR) shell

config: ## Mostra o compose final, já combinado
	$(SERVIDOR) config

health: ## Saúde do app e dos serviços, mais a sonda pública (/ 200, /app 307)
	$(SERVIDOR) health

backup: ## Backup do banco, sessões do WhatsApp, anexos e .env em BACKUP_DIR
	$(SERVIDOR) backup

restore: ## Restaura um dump num banco vazio (FILE=; pede confirmação)
	$(SERVIDOR) restore

brand-emails: ## Reaplica a marca nos e-mails de acesso (marca-emails.sh)
	$(SERVIDOR) brand-emails

# ── Upstream ─────────────────────────────────────────────────────────────────

.PHONY: sync-upstream
sync-upstream: ## Cria sync/vX.Y.Z a partir da main e faz merge da tag (TAG=vX.Y.Z)
	@[[ "$(TAG)" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$$ ]] || { echo "✖ TAG=vX.Y.Z (tag de release do upstream)"; exit 1; }
	@[ -z "$$(git status --porcelain --untracked-files=no)" ] || { echo "✖ há mudanças não commitadas"; exit 1; }
	git remote get-url upstream >/dev/null 2>&1 || git remote add upstream https://github.com/melgarafael/DeskcommCRM.git
	git fetch upstream --tags
	git fetch origin main
	@echo "── Requer atenção entre v$(UPSTREAM) e $(TAG) (CHANGELOG.md) ──"
	@git show "$(TAG):CHANGELOG.md" | awk '/^## \[?v?$(UPSTREAM)[] ]/{exit} /^### .*Requer atenção/{p=1} /^## /{v=$$0} p&&/^### /&&!/Requer atenção/{p=0} p{if(v!=pv){print "\n" v; pv=v} print}'
	git switch -c "sync/$(TAG)" origin/main
	git merge --no-ff --no-edit "$(TAG)" || { echo "✖ conflitos: resolva preservando a camada Ânima (docs/anima/PATCHES.md), depois: make sync-upstream-concluir TAG=$(TAG)"; exit 1; }
	$(MAKE) sync-upstream-concluir TAG="$(TAG)"

.PHONY: sync-upstream-concluir
sync-upstream-concluir: ## Depois do merge: grava a nova base em .anima-upstream e commita
	printf '%s\n' "$(patsubst v%,%,$(TAG))" > .anima-upstream
	git add .anima-upstream
	git commit -m "chore(anima): base do upstream em $(TAG)"
	@echo "✓ sync/$(TAG) pronto. Agora: make check, make e2e, telas nos dois temas e PR (docs/anima/README.md §6)."

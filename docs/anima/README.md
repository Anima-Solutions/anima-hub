# Ânima Hub — fork Ânima do DeskcommCRM

> Documentação de operação do fork. As regras para agentes de código estão em
> [`AGENTS.anima.md`](../../AGENTS.anima.md). As divergências em relação ao upstream estão em
> [`PATCHES.md`](PATCHES.md).
>
> **Legenda de estado:** ✅ existe e foi verificado · 🚧 planejado, ainda não existe no repositório ·
> ❓ decisão pendente.

## 1. Visão geral

O Ânima Hub é o [DeskcommCRM](https://github.com/melgarafael/DeskcommCRM) com a identidade visual
da Ânima. O fork vive em `Anima-Solutions/anima-hub` e recebe o upstream por tags de release
(seção 6).

**Nível de customização atual: Nível 1 (tokens do design system).** Muda apenas a pele:

| Muda | Não muda |
|---|---|
| Paleta clara e escura do DS mapeada nos tokens de `app/globals.css` | Componentes de `components/ui/` |
| Tema escuro como padrão | Layout, telas, fluxos, textos e rotas |
| Tipografia Inter (local) | Backend, API, banco e migrations |
| Ícones Phosphor em peso bold | Worker, scheduler e integrações |
| Raios e sombras do DS | |
| Logo e nome Ânima Hub (pelo `/admin/marca`, no banco) | |

**Estado em 2026-11-26:** Nível 1 aplicado e verificado na tela (PR #1; evidência em
[`evidencias/nivel-1/`](evidencias/nivel-1/README.md)). Operação do servidor pelo `Makefile`
(seções 4, 5 e 12), ainda não exercitada num servidor real.

**Decisões tomadas (2026-11-26):** imagem do app **construída no próprio servidor** (`make build`), sem
registro; worker e scheduler
com as imagens oficiais do upstream; Supabase self-hosted no mesmo servidor; tema escuro como
padrão (com patch aprovado em `lib/theme.tsx`).

**Ponto de partida do fork:** o commit `7ef344257` da `main` do upstream. Ele difere da **v1.126.0**
só pelo corte da versão (`CHANGELOG.md` e `.changes/`, nenhum código), então a base registrada em
`.anima-upstream` é `1.126.0`: é a versão das imagens de worker e scheduler.

**Futuro:** está previsto um front próprio (Nível 4) sobre a API `/api/v1`. Por isso, o mapeamento
de tokens é mantido como uma camada isolada e reaproveitável.

## 2. Pré-requisitos

| Item | Versão / origem | Estado |
|---|---|---|
| Node | `22` (arquivo `.nvmrc`; use `nvm use`) | ✅ |
| pnpm | `9.15.9` (`packageManager` do `package.json`; `corepack enable`) | ✅ |
| Docker + Compose v2 | para o stack local e o servidor | ✅ |
| Acesso ao pacote do DS | `@anima-solutions/design-system` no **GitHub Packages** (`npm.pkg.github.com`) | ✅ verificado: `2026.11.2` |
| `NPM_TOKEN` | token do GitHub com `read:packages` na org `Anima-Solutions` | ✅ |
| MCP do Storybook | servidor `anima-ds` → `https://designsystem.animahub.ai/mcp` | ✅ |
| `ANIMA_DS_MCP_TOKEN` | Bearer do MCP. **Não** serve para o pacote npm | ✅ |

> ⚠️ São dois tokens diferentes. Com o `ANIMA_DS_MCP_TOKEN`, o GitHub Packages responde `401`. O
> pacote só aceita token do GitHub (`NPM_TOKEN`).

## 3. Instalação local

```bash
git clone git@github.com:Anima-Solutions/anima-hub.git
cd anima-hub
git remote add upstream https://github.com/melgarafael/DeskcommCRM.git
git fetch upstream --tags

export NPM_TOKEN=ghp_...            # read:packages; nunca commite
nvm use && corepack enable
cp .env.example .env.local          # preencha (ver README.md do upstream)
make install                        # pnpm install com o token do DS
make dev                            # docker compose up -d (WAHA) && pnpm dev
```

Para o stack local completo (Supabase local, app, worker, scheduler, WAHA e Redis), rode uma vez
`./ubuntu-local-installer.sh` e depois use `pnpm local:up | local:down | local:status | local:logs`.

### 3.1 Dados de demonstração

`make seeds-demo` cria a organização **Vértice Digital (demonstração)**, uma agência de marketing
e tecnologia fictícia. É feita para **demo comercial**: cada tela abre preenchida.

| Área | O que nasce |
|---|---|
| Equipe | 5 pessoas (gestora, 3 vendedores, 1 leitora). Todo administrador da plataforma entra como admin, e a primeira conta recebe parte da carteira, para as abas "Minhas" não abrirem vazias |
| CRM | 120 contatos, ~115 oportunidades nos funis "Comercial" e "Renovação e upsell", com notas na linha do tempo, valores pontuais e mensais, ganhos e perdidos com motivo |
| Inbox | 45 conversas no **chat do site** (~185 mensagens): passadas para uma pessoa (aba Fila), com a Lia (Automático), com a equipe, pendentes e resolvidas |
| Agenda | 4 tipos de reunião, jornada seg–sex da equipe, ~50 reuniões passadas e futuras e 60 tarefas, algumas vencidas |
| IA | A **Lia** publicada no chat do site, com a base de perguntas frequentes e casos ligados; o "Sol" em rascunho; 3 regras de automação e 1 follow-up desligados |

**Não há WhatsApp na demo.** O canal é o chat do site, que é real: a Lia atende quem abrir o link
impresso no fim do comando. O histórico entra como importado e não acorda nenhum agente nem
automação. Para a Lia responder de verdade:

1. Ligue o módulo **Chat no site** em `/admin/sistema` (uma vez, para a instalação). Sem ele o
   link do chat responde 404.
2. Na organização da demo, cadastre a chave de IA em **IA › Credenciais** e defina o teto mensal em
   **IA › Uso de IA**. O par provedor/modelo da Lia precisa casar com a chave
   (`IA_PROVEDOR=`/`IA_MODELO=`; padrão `anthropic`/`claude-sonnet-4-6`).
3. Para a FAQ valer, uma chave de embedding (OpenAI, OpenRouter ou Google) e **Preparar tudo de
   novo** em IA › Conhecimento.

```bash
make seeds-demo                     # cria; se já existe, para e avisa
make seeds-demo RECRIAR=1           # apaga a organização de demonstração e cria de novo
make seeds-demo EMAIL=voce@...      # dá acesso de admin a mais uma conta existente
make seeds-check                    # typecheck e testes dos seeds (o pnpm typecheck exclui scripts/)
```

`RECRIAR=1` apaga tudo da organização de demonstração, **inclusive a chave de IA** cadastrada nela.

**Onde roda.** Na sua máquina, contra o Supabase local (loopback ou IP privado). **No servidor**,
o mesmo `make seeds-demo` roda num contêiner `node:22-alpine` descartável, na rede interna do
Supabase (o servidor não tem Node e a imagem do app não leva `scripts/anima/`). O script recusa,
sem opção de forçar, qualquer outro destino: da sua máquina, a produção nunca é alvo. Os dados são
fixos, e um PR que só mexe em `scripts/anima/seeds/` pula o e2e e o build da imagem.

O `.npmrc` do projeto tem somente:

```ini
@anima-solutions:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

## 4. Instalação em servidor

O ponto de partida é o kit do upstream (`hostgator-setup-kit/`), operado pelo `Makefile`
(`scripts/anima/servidor.sh`). As diferenças em relação à instalação oficial:

1. **Imagem do app construída no servidor** (`make build`), a partir do fork, em vez de puxar
   `ghcr.io/melgarafael/deskcommcrm` (decidido em 2026-11-26). Ver a seção 4.3.
2. **Worker e scheduler usam as imagens oficiais** do upstream (`ghcr.io/melgarafael/deskcomm-worker`
   e `deskcomm-scheduler`) na versão em que o fork se baseia, gravada em **`.anima-upstream`**
   (hoje `1.126.0`; o `make sync-upstream` a atualiza). O Nível 1 não altera nada que eles executam.
3. **Proxy e pastas:** o Caddy do projeto não sobe. Na frente fica o **Nginx Proxy Manager**, na
   rede `anima_proxymanager_shared_network`, e os dados vão para `/srv/...` (seção 11).
4. **Supabase self-hosted no mesmo servidor**, pelo instalador do kit (seção 4.1).
5. **Versão do fork:** tag git `ANO.MES.SEQUENCIAL` (ex.: `2026.11.1`, sem `v`, para não se
   misturar às tags `vX.Y.Z` do upstream). A imagem sai como `anima-hub:<versão>`.

Comando de subida (é o que o `make up` roda; `make config` mostra o resultado combinado):

```bash
docker compose -p deskcomm \
  -f docker-compose.prod.yml -f docker-compose.single-server.yml \
  -f docker-compose.npm.yml -f docker-compose.anima.yml \
  --env-file .env up -d
```

### Passo a passo da primeira instalação

Pré-requisitos no servidor: Docker com Compose v2, `git`, `make`, `curl`, `jq`, `openssl`, o NPM
no ar (ele cria a rede `anima_proxymanager_shared_network`) e o DNS do domínio apontando para o
servidor.

```bash
# 1. Código: clone do fork com uma deploy key só de leitura
#    (GitHub › anima-hub › Settings › Deploy keys › Add, sem "Allow write access")
sudo mkdir -p /srv/stacks && sudo chown "$USER" /srv/stacks
ssh-keygen -t ed25519 -f ~/.ssh/anima-hub-deploy -N '' -C 'deploy anima-hub'
cat ~/.ssh/anima-hub-deploy.pub      # cole em Deploy keys
git clone -c core.sshCommand='ssh -i ~/.ssh/anima-hub-deploy' \
  git@github.com:Anima-Solutions/anima-hub.git /srv/stacks/deskcomm
cd /srv/stacks/deskcomm

# 2. Pastas, volumes, .env e arquivo do token
sudo mkdir -p /srv/appdata/deskcomm /srv/storage/deskcomm /srv/backups/deskcomm
sudo chown -R "$USER" /srv/appdata/deskcomm /srv/storage/deskcomm /srv/backups/deskcomm
make setup
#    edite o .env: DOMAIN, PROXY_NETWORK_APP_IP (livre na sub-rede que o setup mostra),
#    RESEND_API_KEY, RESEND_FROM_EMAIL
#    cole o PAT (read:packages) em .runtime/npm-token

# 3. NPM: crie o Proxy Host do domínio ANTES do passo 4 (tabela abaixo)

# 4. Supabase no servidor, banco, segredos e dono (instalador do kit, sem perguntas)
make server-install
#    o usuário e a senha iniciais ficam em .runtime/admin-credentials (600)

# 5. Versão Ânima: build no servidor, banco, troca da imagem, saúde
make deploy TAG=2026.11.1
```

O `make server-install` grava `SUPABASE_SERVER_URL=http://supabase-envoy:8000` no `.env` quando
ela está vazia. Com o NPM o Caddy do kit não sobe, e sem ela o app procura o Supabase pelo domínio
público, que não resolve por dentro do contêiner (`fetch failed` no login).

O `make server-install` sobe primeiro as **imagens oficiais** da versão de `.anima-upstream`: o
`install.sh` do kit grava a mesma tag para app, worker e scheduler, e só essas três existem
publicadas juntas. Ele cria o banco, os segredos e o dono. O `make deploy` troca em seguida só o app
pela imagem Ânima.

**Proxy Host no NPM** (um só, para o domínio, com SSL e *Websockets Support* ligado):

| Caminho (*Custom locations*) | Encaminhar para |
|---|---|
| `/` (o Proxy Host em si) | `http://deskcomm-app:3000` (ou `PROXY_NETWORK_APP_IP:3000`) |
| `/auth/v1`, `/rest/v1`, `/realtime/v1`, `/storage/v1`, `/functions/v1`, `/graphql/v1` | `http://deskcomm-supabase-gw:8000` |
| `/api/v1/webhooks/waha` | nenhum: aba *Advanced* da location com `return 403;` |

O 403 reproduz o `Caddyfile.single-server` do kit: o webhook global do WAHA só pode chegar pela
rede interna. O gateway do Supabase entra na rede do NPM pelo `make supabase-proxy` (o `up` e o
`deploy` o repetem, porque recriar o Supabase desfaz a ligação).

**Verificação depois de qualquer deploy** (o `make health` e o `make deploy` fazem): `/` responde
`200` e `/app` responde `307` (redireciona para o login). Um `200` sozinho não prova que quem
respondeu foi o app.

### 4.1 Supabase self-hosted

O `make server-install` chama `hostgator-setup-kit/install-single-server.sh` com
`REVERSE_PROXY=npm`. Ele roda o instalador oficial do Supabase (versão fixa em `SUPABASE_REF`,
com checagem SHA-256) em `.runtime/supabase/` e liga o CRM e o Supabase por uma rede privada
(`deskcomm_supabase`).

Onde ficam os dados do Supabase (**diverge do AGENTS.anima.md §8**; divergência aceita pelo responsável
pelo fork em 2026-11-26):

| Dado | Pasta |
|---|---|
| Postgres | `/srv/stacks/deskcomm/.runtime/supabase/volumes/db/data` |
| Storage (bucket `whatsapp-media` e demais) | `/srv/stacks/deskcomm/.runtime/supabase/volumes/storage` |
| Chaves geradas (`.runtime/supabase/.env`, `admin-credentials`) | `/srv/stacks/deskcomm/.runtime/` (permissão `700`) |

O instalador oficial do Supabase recusa uma pasta de projeto que já exista (nem um link simbólico
serve), e o kit lê esses caminhos fixos no backup e no restore. Movê-los para `/srv/appdata` e
`/srv/storage` exigiria mudar o kit do upstream. O `make backup` leva o banco, os anexos e os dois
`.env` para `/srv/backups/deskcomm/`.

### 4.2 Recursos

O instalador do upstream recusa servidor com menos de **4 GB de RAM** e recomenda **8 GB** para o
CRM com o Supabase no mesmo servidor. O build da imagem pede ~8 GB livres na hora (seção 4.3).
❓ O consumo real do stack Ânima será medido no primeiro deploy e registrado aqui.

### 4.3 Como a imagem Ânima é gerada

A imagem do app é **construída no próprio servidor**, a partir do código do fork, e não é publicada
em registro nenhum (decidido em 2026-11-26). O CI só prova, em todo PR, que ela constrói
(`.github/workflows/anima-imagem.yml`, sem publicar).

```bash
make build TAG=2026.11.1    # exige o checkout na tag; ALLOW_DIRTY=1 constrói o que estiver aqui
# equivale a:
docker build --secret id=npm_token,src=.runtime/npm-token \
  --build-arg APP_VERSION=2026.11.1 --build-arg NODE_HEAP_MB=6144 \
  -t anima-hub:2026.11.1 .
```

- **Token no servidor:** PAT do GitHub só com `read:packages`, no arquivo `NPM_TOKEN_FILE`
  (padrão `.runtime/npm-token`, permissão `600`). **Não vai no `.env`:** o `.env` inteiro entra no
  contêiner do app (`env_file`), e o token acabaria no ambiente dele. No build ele entra como
  secret do BuildKit e não fica em nenhuma camada.
- **Memória:** o `next build` precisa de ~6 GB de heap (com 4 GB, medido, falta memória). Reserve
  ~8 GB livres na hora do build, ou o build cai ou aperta o app em produção.
- **Tempo:** ~10 min de CPU cheia por versão. O app atual segue no ar durante o build: o `up -d`
  só troca o contêiner depois da imagem pronta.
- **Rollback:** a imagem só existe naquele disco. Cada versão fica como `anima-hub:<versão>`; o
  `.env` guarda a anterior em `ANIMA_PREVIOUS_IMAGE` e o `make rollback` volta para ela.
- **Worker e scheduler** continuam sendo puxados do upstream (`ghcr.io/melgarafael/…`), na versão
  de `.anima-upstream`.

**Acesso ao pacote do DS no CI.** Os testes do PR (`ci.yml`, `e2e.yml`) e o `anima-imagem.yml`
instalam o DS com o `GITHUB_TOKEN` do workflow, sem PAT. Para funcionar, uma vez: pacote
`@anima-solutions/design-system` › *Package settings* › *Manage Actions access* › adicionar
`anima-hub` com papel *Read*. Os workflows pedem `packages: read` (ver `PATCHES.md`).

**PR só de operação ou de seeds é curto.** `Makefile`, `docker-compose.anima.yml`,
`.env.anima.example`, `.anima-upstream` e `scripts/anima/**` não mudam o produto: um PR que só
mexe neles pula o e2e e o build da imagem (os jobs terminam verdes, com o motivo no log) e roda
só o `verify`, ~12 min. Basta um arquivo do produto no PR para tudo voltar a rodar.

**Workflows do upstream desabilitados no fork** (GitHub › Actions › *Disable workflow*, sem mudar
arquivo): `publish-image.yml` (publica imagens do upstream; o fork não usa registro),
`release.yml` (corte de versão do upstream), `acolhida.yml`, `relogio.yml` e
`vigia-de-colisao.yml` (automação de PR do repositório upstream). Depois de cada sync, confira se
continuam desabilitados.

## 5. Atualização (update)

> ⚠️ **Não rode `hostgator-setup-kit/update.sh` do upstream numa instalação Ânima.** Ele monta as
> imagens a partir de `IMG_NS="ghcr.io/melgarafael"` (`hostgator-setup-kit/_common.sh`) e regrava
> `APP_IMAGE`, `WORKER_IMAGE`, `SCHEDULER_IMAGE` e `VOICE_AGENT_IMAGE` no `.env`. A instalação
> voltaria para a imagem oficial, sem a identidade Ânima.

Lançar uma versão (na máquina de quem desenvolve, com a `main` do fork aprovada):

```bash
git switch main && git pull
make tag TAG=2026.12.1     # tag anotada no commit atual + push
```

No servidor, `make update TAG=2026.12.1` (o mesmo fluxo do `make deploy`):

1. `git fetch --tags` e checkout da tag (recusa se o checkout tiver mudança não commitada).
2. Backup (`make backup`): banco, sessões do WhatsApp, anexos do Storage e os dois `.env`.
3. `make build` da tag. Até aqui, nada mudou no que está no ar.
4. Banco: aplica o `supabase/baseline.sql` da versão nova (`reaplicar_baseline` do kit, o mesmo do
   `update.sh`). Se não terminar limpo, para antes de trocar a imagem.
5. Grava no `.env` o `APP_IMAGE` novo e, em `ANIMA_PREVIOUS_IMAGE` e `ANIMA_PREVIOUS_REF`, a imagem
   e o código anteriores.
6. `pull` do worker e do scheduler (versão de `.anima-upstream`) e `up -d`.
7. Saúde: `/api/v1/health` por dentro e `/` = 200, `/app` = 307 por fora. Se falhar, **rollback
   automático** para a imagem e o código anteriores.

`make rollback` faz o mesmo retorno à mão (pede confirmação, a menos que `YES=1`). **O banco não
volta:** o baseline só anda para frente, como no upstream (o `agent.sh` também reverte só a
imagem).

O que o `update.sh` do upstream faz e o `make update` **não** faz: preflight de disco, atualização
do próprio Supabase (`atualizar_supabase_single_server`) e sincronização do SMTP com o GoTrue. Se
um sync trouxer versão nova do Supabase (`SUPABASE_REF`) ou o "Requer atenção" pedir, trate à mão
nesse dia.

## 6. Sync com o upstream

Cadência **mensal**, sempre para uma **tag de release** (`vX.Y.Z`), nunca para a `main`.

1. Ler no `CHANGELOG.md` as seções **"⚠️ Requer atenção"** de todas as versões do intervalo.
2. `make sync-upstream TAG=vX.Y.Z`: busca o upstream, imprime os "Requer atenção" desde a versão de
   `.anima-upstream`, cria `sync/vX.Y.Z` a partir da `main` do fork e faz o merge da tag. Sem
   conflito, já grava a nova base em `.anima-upstream` e commita. Com conflito, resolva (passo 3),
   commite o merge e rode `make sync-upstream-concluir TAG=vX.Y.Z`.
3. Resolver os conflitos preservando a camada Ânima. Conferir cada linha do [`PATCHES.md`](PATCHES.md).
4. Rodar os gates (`make check`, `make e2e`), capturar as telas principais nos dois temas e listar
   as cores cruas (`bg-red-500`…) e os controles crus (`<button>`, `<input>`, `<select>`) que
   entraram no intervalo:
   ```bash
   git diff <tag-anterior>..vX.Y.Z -- app components | grep -E '^\+.*(bg|text|border)-(red|blue|green|gray|slate|zinc)-[0-9]'
   git diff <tag-anterior>..vX.Y.Z -- app components | grep -E '^\+.*<(button|input|select)[ >]'
   ```
5. Abrir um PR com: versão de/para, itens "Requer atenção", conflitos resolvidos e vazamentos
   visuais encontrados.

Se o intervalo trouxer mudança estrutural (Tailwind, Next, React ou reestruturação do
`globals.css`), **pare e consulte o responsável** antes de seguir.

## 7. Design system

- **Pacote:** `@anima-solutions/design-system`, versão em uso: **2026.11.2** (✅ dependência do
  projeto). O pacote pede Node ≥ 24 (`engines`); o projeto usa 22, e o pnpm só avisa.
- **Atualizar:** `make ds-update`, que instala a última versão (exata), roda o gerador e depois
  `make check`. Se o primeiro número da versão mudar, ele para e pede `ALLOW_MAJOR=1` (aprovação
  antes, `AGENTS.anima.md` §10).
- **Mapeamento de tokens (✅):** `scripts/anima/gerar-tokens-ds.ts` lê os `tokens/*.json` do pacote e
  reescreve **só os valores** das propriedades que já existem nos blocos `:root`,
  `[data-theme="light"]` e `[data-theme="dark"]` do `app/globals.css`. Depois regenera
  `lib/branding/regua-do-produto.ts`. Os valores entram como hex literal, e não como `var()`; o
  motivo e a tabela de derivações estão no [`PATCHES.md`](PATCHES.md).
  ```bash
  pnpm exec tsx scripts/anima/gerar-tokens-ds.ts            # aplica
  pnpm exec prettier --write lib/branding/regua-do-produto.ts
  pnpm exec tsx scripts/anima/gerar-tokens-ds.ts --conferir # exit 1 se o CSS divergir do pacote
  ```
- **Cor de destaque:** no escuro é o limão do DS (`#c5fe59`, texto preto). No claro, o limão sólido
  não passa 4,5:1, então o destaque é o verde `#506f00` (texto branco). Ele é derivado do limão
  com a escada de luminosidade do upstream, e é o primeiro grau que passa em todos os pisos que o
  upstream mede.
- **Raios:** botões e campos 12px (`--radius-sm`), cards e diálogos 28px (`--radius-lg`).
- **Fonte:** Inter variável, servida do próprio pacote (`dist/fonts`) por `next/font/local`.
- **Ícones:** Phosphor em `bold`, via `patches/@phosphor-icons__react@2.1.10.patch`: o padrão e o
  `regular` declarado pelo upstream desenham bold. `fill` e `duotone` ficam como estão.
- **Tema padrão:** escuro, quando o usuário nunca escolheu. "Sistema" continua seguindo o SO.
- **Contraste:** os testes `lib/branding/contraste.ts`, `lib/channels/marca-do-canal.test.ts` e
  `lib/aparencia/aparencia.test.ts` medem os tokens contra a WCAG. Se falharem, o token está
  errado; o teste não se altera.
- **MCP do Storybook (`anima-ds`):** use `docs-list` para descobrir os componentes e tokens e
  `docs-show` para ver as propriedades. Nunca use nome de token ou propriedade que não esteja
  documentado.
- **O DS não tem algo de que precisamos?** Não crie token local. Registre o que falta e leve à
  governança do DS.

## 8. Marca

A marca mora **no banco**, não na imagem. O `.env` é só a semente:

- **Instalação:** `/admin/marca` (nome "Ânima Hub" e logo). Grava em `platform_branding`.
  O campo de cor fica escondido: o tema é fixo (abaixo). Arquivos usados (entregáveis de marca,
  pastas `[Ânima] Logo Soluções/PNG` e `[Ânima] Logo/PNG`; a tela só aceita PNG ou JPG de até 512 KB):

  | Campo em `/admin/marca` | Arquivo |
  |---|---|
  | Nome do sistema | `Ânima Hub` |
  | Logo | `[Ânima] Logo Soluções/PNG/Hub - Logotipo Preto@240.png` |
  | Logo para o tema escuro | `[Ânima] Logo Soluções/PNG/Hub - Logotipo Branco@240.png` |
  | Ícone do aplicativo e do navegador | `[Ânima] Logo/PNG/Simbolo Preto@512.png` (o Hub não tem símbolo próprio) |
- **Organização:** Configurações › Marca (`/app/settings/marca`). Grava em
  `organizations.settings.branding`.
- **Semente no `.env`:** `APP_NAME`, `APP_LOGO_URL` e `APP_ACCENT_HEX`. Valem só até alguém salvar
  pela tela, e servem de piso no rollback.
- **E-mails de acesso** (criar conta e recuperar senha) são renderizados pelo Supabase Auth, fora
  do app. Para aplicar a marca a eles: `make brand-emails`, que chama
  `hostgator-setup-kit/marca-emails.sh` (lê o `.env`) e recria o `auth` do Supabase do servidor.
- **Tema fixo** (`lib/anima/tema-fixo.ts`, `TEMA_FIXO = true`): nenhuma organização nem a
  instalação troca a cor ou a aparência. A cor gravada no banco ou em `APP_ACCENT_HEX` é ignorada
  na tela, nos e-mails e no ícone. A tela **Aparência** sai do menu e redireciona para Marca, e o
  tema de extensão por organização não se aplica. Em `/admin/marca`, o seletor "Tema da plataforma"
  também sai, e um tema de plataforma escolhido antes deixa de ser aplicado. Nome e logo continuam livres. Nada do banco é
  apagado; com `TEMA_FIXO = false` volta o comportamento do upstream.

## 9. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `401 Unauthorized` no `pnpm install` (npm.pkg.github.com) | `NPM_TOKEN` ausente, ou é o token do MCP | Exportar um token do GitHub com `read:packages` |
| `404` para `@anima-solutions/design-system` | O escopo não está apontando para o GitHub Packages | Conferir o `.npmrc` (seção 3) |
| `next build` morre com `heap out of memory` | Heap de 4 GB (padrão do `Dockerfile`) | `--build-arg NODE_HEAP_MB=6144` e ~8 GB livres (seção 4.3) |
| Build da imagem falha com `401` ao instalar o DS | Token ausente ou vencido, ou o pacote não libera o repositório | Servidor: PAT válido em `.runtime/npm-token` (`make build` usa o arquivo). CI: liberar o acesso de Actions no pacote (seção 4.3) |
| Tela ilegível depois de um CSS personalizado | CSS do administrador sobrescrevendo tokens | Abrir a página com `?sem_css=1` para desligá-lo e corrigir em `/admin/marca` |
| `network anima_proxymanager_shared_network declared as external, but could not be found` | O stack do NPM não criou a rede, ou ela tem outro nome | `docker network ls`; ajustar `PROXY_NETWORK_NAME` |
| Domínio responde `502` depois de um deploy | `PROXY_NETWORK_APP_IP` diferente do IP do Proxy Host | Alinhar o `.env` com o Proxy Host do NPM |
| `external volume "deskcomm_waha-data" not found` | `make setup` não rodou | `make setup` (cria os volumes ligados às pastas) |
| Serviços não sobem com bind em `/srv/...` | Pasta ausente ou dono errado | `make setup`; conferir `ls -ld /srv/appdata/deskcomm/*` |
| Login não entra e o log do app mostra `TypeError: fetch failed` | `SUPABASE_SERVER_URL` ausente no `.env` (instalação anterior a esta correção) | Acrescentar `SUPABASE_SERVER_URL=http://supabase-envoy:8000` e `make up`. O `make health` acusa |
| Build falha com `ERR_INVALID_CHAR` no header `authorization` | Quebra de linha ou espaço no arquivo do token | O `make build` já limpa; em versão antiga, regravar `.runtime/npm-token` numa linha só |
| `/auth/v1` responde `502`, login não entra | Gateway do Supabase fora da rede do NPM (Supabase recriado) | `make supabase-proxy` |
| `make deploy` recusa "mudanças não commitadas" | Arquivo do repositório editado no servidor | `git status`; o servidor não guarda mudança de código |
| Depois de um update o app perdeu a cara Ânima | Rodaram o `update.sh` do upstream | `make update TAG=<versão>` ou `make rollback` (seção 5) |

## 10. Registro de divergências

Todo arquivo do upstream alterado fora da superfície permitida (`AGENTS.anima.md` §3) é registrado
em [`PATCHES.md`](PATCHES.md), com o motivo e a forma de reaplicar depois de um sync.

## 11. Estrutura no servidor

Nome do app = `COMPOSE_PROJECT_NAME` = **`deskcomm`**. Todos os caminhos, a rede e os nomes vêm do
`.env`, com padrão no [`.env.anima.example`](../../.env.anima.example).

| Pasta | Conteúdo |
|---|---|
| `/srv/stacks/deskcomm/` | Checkout do fork: compose files, `Makefile`, `.env`, `.runtime/` (Supabase, token do DS, credenciais iniciais) |
| `/srv/storage/deskcomm/` | Arquivos: mídias do WAHA (`waha-media/`) |
| `/srv/appdata/deskcomm/<serviço>/` | Dados de cada serviço que não são arquivo |
| `/srv/backups/deskcomm/` | Backups: `db-*.sql.gz`, `waha-*.tgz`, `storage-*.tgz`, `env-*`, `supabase-env-*` |

Mapa de volumes. Os nomes vêm do `docker-compose.prod.yml` do upstream; o `make setup` cria cada um
como volume local com bind para a pasta (`<projeto>_<volume>`), e o `docker-compose.anima.yml` os
declara `external`. Assim o compose com o override e os scripts do kit (que rodam sem ele) usam os
mesmos dados.

| Volume | Pasta |
|---|---|
| `waha-data` (sessões pareadas) | `/srv/appdata/deskcomm/waha/sessions` |
| `waha-media` | `/srv/storage/deskcomm/waha-media` |
| `wacalls-data` (perfil `voz`) | `/srv/appdata/deskcomm/wacalls` |
| `asterisk-data`, `asterisk-logs` (perfil `telefonia`) | `/srv/appdata/deskcomm/asterisk/{data,logs}` |
| `redis` | sem volume: a fila é efêmera de propósito no upstream |
| `caddy-data`, `caddy-config` | não usados (o Caddy não sobe com o NPM) |
| Supabase (Postgres e Storage) | em `.runtime/supabase/volumes/` (seção 4.1) |

Containers: `container_name: ${COMPOSE_PROJECT_NAME}-<serviço>` (`deskcomm-app`, `deskcomm-worker`,
`deskcomm-waha`…). O Supabase é o projeto `deskcomm-supabase`, e o gateway dele entra na rede do
NPM como `deskcomm-supabase-gw`.

## 12. Comandos rápidos

Interface única do fork: `Makefile` na raiz, que chama `scripts/anima/servidor.sh` (servidor) ou
os scripts do `pnpm` (desenvolvimento). Os alvos destrutivos pedem confirmação, a menos que
`YES=1`.

| Alvo | O que faz |
|---|---|
| `make help` | Lista os alvos e a configuração em uso (padrão) |
| `make install` | `pnpm install` com o token do DS (`NPM_TOKEN`) |
| `make dev` | WAHA local (`docker compose up -d`) e `pnpm dev` |
| `make check` | `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` |
| `make e2e` | `pnpm test:e2e` |
| `make seeds-demo` | Organização de demonstração, local ou no servidor (`RECRIAR=1`, `EMAIL=`, `IA_PROVEDOR=`, `IA_MODELO=`; seção 3.1) |
| `make seeds-check` | Typecheck e testes dos seeds de demonstração |
| `make ds-update` | Atualiza o DS, roda o gerador de tokens e `check` (major pede `ALLOW_MAJOR=1`) |
| `make setup` | Pastas `/srv`, volumes ligados a elas, rede do NPM, `.env` e arquivo do token |
| `make server-install` | Primeira instalação pelo kit: Supabase no servidor, banco, segredos e dono |
| `make supabase-proxy` | Liga o gateway do Supabase à rede do NPM |
| `make tag TAG=2026.11.1` | Cria e envia a tag de versão do fork |
| `make build TAG=…` | Constrói `anima-hub:<TAG>` no servidor (DS via secret) |
| `make deploy TAG=…` | Backup → build → banco → pull (worker/scheduler) → `up -d` → saúde → rollback se falhar |
| `make update TAG=…` | Igual ao deploy, registrando a versão anterior |
| `make rollback` | Volta o app para a imagem anterior registrada |
| `make up` / `down` / `restart [SERVICE=…]` | Stack com os quatro compose files |
| `make down-v` | Derruba e apaga os volumes não externos (os de `/srv` ficam) |
| `make ps` / `logs [SERVICE=…]` / `config` | Estado, logs e o compose combinado |
| `make shell [SERVICE=app]` | Shell no contêiner |
| `make health` | `healthcheck.sh` do kit e a sonda pública (`/` 200, `/app` 307) |
| `make backup` / `restore FILE=…` | Backup em `/srv/backups/deskcomm/`; restore num banco vazio |
| `make brand-emails` | Reaplica a marca nos e-mails de acesso |
| `make sync-upstream TAG=vX.Y.Z` | Cria `sync/vX.Y.Z`, faz o merge da tag e atualiza `.anima-upstream` |

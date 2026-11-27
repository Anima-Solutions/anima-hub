/**
 * Fork Ânima — seed de DEMONSTRAÇÃO com volume: uma agência de serviços inteira.
 *
 * Cria a organização "Vértice Digital (demonstração)" com equipe, dois funis, ~120 contatos,
 * ~110 oportunidades, histórico na linha do tempo, ~45 conversas no CHAT DO SITE, agenda com
 * reuniões passadas e futuras, tarefas, dois agentes de IA, base de conhecimento, regras de
 * automação e um fluxo de follow-up. É feita para demo comercial: cada tela abre preenchida.
 *
 * ─── O canal e a IA ─────────────────────────────────────────────────────────
 *
 * Não há WhatsApp na demo: o canal é o chat do site (`provider = 'webchat'`), criado como a
 * tela cria. A Lia nasce PUBLICADA nele e atende visitantes de verdade, desde que a instalação
 * tenha o módulo ligado (/admin/sistema) e a organização tenha chave de IA (IA › Credenciais).
 * O histórico não acorda ninguém: as mensagens são `historico_importado` (o gatilho não emite
 * `message.received`) e os pedidos de roteamento das conversas sem dono são dados por
 * concluídos. Os outros agentes, as regras e o follow-up nascem DESLIGADOS, e os tipos de
 * reunião não mandam lembrete.
 *
 * ─── Onde grava ─────────────────────────────────────────────────────────────
 *
 * Usa as credenciais de `scripts/lib/env-de-teste.ts` (ambiente, depois `.env.local`) e
 * RECUSA, sem opção de forçar, um Supabase que não seja desta máquina, da rede local, ou o
 * gateway interno do servidor (`supabase-envoy`, que só resolve de dentro da VPS). Da sua
 * máquina, a produção nunca é alvo; na VPS quem roda é `make seeds-demo`, no próprio servidor.
 *
 * ─── Idempotência ───────────────────────────────────────────────────────────
 *
 * A organização é a unidade: se ela já existe, o script para e explica. `--recriar` apaga a
 * organização de demonstração (e só ela, pelo slug fixo) e semeia de novo — inclusive a chave
 * de IA cadastrada nela, que precisa ser cadastrada de novo. As contas da equipe são
 * reaproveitadas por e-mail.
 *
 * Acesso: todo administrador da plataforma entra como admin da organização; `--email=<conta>`
 * acrescenta uma conta existente. `--provedor=` e `--modelo=` escolhem o modelo da Lia
 * (padrão anthropic / claude-sonnet-4-6), que precisa casar com a chave cadastrada.
 *
 * Run: make seeds-demo   (ou: pnpm exec tsx scripts/anima/seeds/demo-agencia.ts [--recriar] [--email=...])
 */

import { randomBytes, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../lib/env-de-teste";
import { regrasDeDemonstracao } from "../../lib/automacoes-de-demonstracao";
import { PONTEIRO_DE_DEMONSTRACAO } from "../../lib/followups-de-demonstracao";
import { GRAFO_DE_DEMONSTRACAO } from "../../lib/grafo-de-demonstracao";
import {
  AGENTES,
  EQUIPE,
  FUNIS,
  MOTIVOS_DE_PERDA,
  NOTAS,
  ORGANIZACAO,
  PERGUNTAS_FREQUENTES,
  ROTEIROS,
  SERVICOS,
  TAREFAS,
  TIPOS_DE_REUNIAO,
  VENDEDORES,
  VOCABULARIO,
  emailDaEquipe,
  pessoas,
  preencher,
  sorteador,
  type Pessoa,
} from "./dados-agencia";

const MARCA = "seed-demo-agencia";
const MOTIVOS_DE_PASSAGEM = [
  "Cliente pediu para falar com uma pessoa",
  "Pedido de desconto fora da tabela",
  "Dúvida técnica sobre integração",
];
const HORA = 3_600_000;
const DIA = 24 * HORA;

// ── Destino ──────────────────────────────────────────────────────────────────

/**
 * Loopback, IPv4 privado (RFC 1918) LITERAL, ou o apelido interno do gateway do Supabase no
 * servidor. Nenhum outro nome de DNS passa: pode resolver para qualquer lugar.
 */
export function destinoDaDemoEhLocal(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "[::1]" || host === "host.docker.internal") return true;
  // O gateway do Supabase na rede interna do servidor (apelido do kit,
  // hostgator-setup-kit/supabase-single-server.override.yml). Só resolve de DENTRO dessa rede
  // Docker: é por ele que o `make seeds-demo` da VPS escreve, e de fora ele não existe.
  if (host === "supabase-envoy") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([m[1], m[2], m[3], m[4]].some((o) => Number(o) > 255)) return false;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

// ── Ajudantes ────────────────────────────────────────────────────────────────

const quando = (msAtras: number): string => new Date(Date.now() - msAtras).toISOString();

async function inserir<T extends Record<string, unknown>>(
  db: SupabaseClient,
  tabela: string,
  linhas: T[],
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await db
      .from(tabela)
      .insert(linhas.slice(i, i + 200) as never)
      .select("id");
    if (error) throw new Error(`${tabela}: ${error.message}`);
    ids.push(...((data ?? []) as { id: string }[]).map((d) => d.id));
  }
  return ids;
}

async function idDe(
  db: SupabaseClient,
  tabela: string,
  linha: Record<string, unknown>,
): Promise<string> {
  const [id] = await inserir(db, tabela, [linha]);
  return id!;
}

// ── Organização e equipe ─────────────────────────────────────────────────────

async function prepararOrganizacao(db: SupabaseClient, recriar: boolean): Promise<string> {
  const { data: existente } = await db
    .from("organizations")
    .select("id")
    .eq("slug", ORGANIZACAO.slug)
    .maybeSingle();
  if (existente) {
    if (!recriar) {
      console.error(
        `[${MARCA}] a organização "${ORGANIZACAO.nome}" já existe. ` +
          "Rode de novo com --recriar para apagá-la e semear do zero.",
      );
      process.exit(3);
    }
    const { error } = await db
      .from("organizations")
      .delete()
      .eq("id", (existente as { id: string }).id);
    if (error) throw new Error(`apagar a organização anterior: ${error.message}`);
    console.info(`[${MARCA}] organização anterior apagada`);
  }
  return idDe(db, "organizations", {
    slug: ORGANIZACAO.slug,
    display_name: ORGANIZACAO.nome,
    legal_name: "Vértice Digital Marketing Ltda. (fictícia)",
    timezone: "America/Sao_Paulo",
    locale: "pt-BR",
    onboarded_at: new Date().toISOString(),
  });
}

async function garantirConta(db: SupabaseClient, email: string, nome: string): Promise<string> {
  for (let pagina = 1; pagina < 50; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(`listar contas: ${error.message}`);
    const achada = data.users.find((u) => u.email === email);
    if (achada) return achada.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    // Senha que ninguém conhece: a conta existe para dar dono às coisas, não para entrar.
    password: `${crypto.randomUUID()}Aa1!`,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });
  if (error || !data.user) throw new Error(`criar ${email}: ${error?.message}`);
  return data.user.id;
}

async function idPorEmail(db: SupabaseClient, email: string): Promise<string | null> {
  for (let pagina = 1; pagina < 50; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(`listar contas: ${error.message}`);
    const achada = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (achada) return achada.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Senha fácil de digitar numa demo: duas palavras curtas e dois dígitos (ex.: `mar-cafe-42`). */
export function senhaFacil(sorteio: () => number = Math.random): string {
  const palavras = ["sol", "mar", "lua", "rio", "cafe", "mel", "pao", "ceu", "flor", "bola"];
  const um = () => palavras[Math.floor(sorteio() * palavras.length)]!;
  return `${um()}-${um()}-${String(10 + Math.floor(sorteio() * 90))}`;
}

export interface Demonstrador {
  id: string;
  email: string;
  /** A senha definida NESTA rodada, para mostrar uma vez; `null` = a conta manteve a dela. */
  senhaNova: string | null;
  aviso: string | null;
}

/**
 * A conta de quem APRESENTA a demo: entra só nesta organização, como admin, e é dona de parte
 * da carteira. A senha é fácil de digitar porque a conta não abre nada além da demo — e por
 * isso mesmo o seed NUNCA mexe na senha de uma conta que tem outra vida na instalação
 * (administrador da plataforma ou membro de outra organização): pôr senha fácil ali abriria
 * dados reais. Nesse caso a conta entra na demo com a senha que já tem.
 *
 * Nem o e-mail nem a senha moram no repositório (ele é público): vêm de `--demonstrador=` e
 * `--senha=` (no servidor, de DEMO_DEMONSTRADOR e DEMO_SENHA no .env). Sem `--senha`, uma conta
 * nova ganha senha gerada, mostrada uma vez; uma conta existente mantém a dela.
 */
async function garantirDemonstrador(
  db: SupabaseClient,
  orgId: string,
  email: string,
  senha: string | null,
): Promise<Demonstrador> {
  const id = await idPorEmail(db, email);
  if (!id) {
    const senhaNova = senha ?? senhaFacil();
    const nome = email.split("@")[0]!.replace(/[._-]+/g, " ");
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: senhaNova,
      email_confirm: true,
      user_metadata: { full_name: nome.charAt(0).toUpperCase() + nome.slice(1) },
    });
    if (error || !data.user) throw new Error(`criar ${email}: ${error?.message}`);
    return { id: data.user.id, email, senhaNova, aviso: null };
  }

  const [{ data: admin }, { data: outras }] = await Promise.all([
    db.from("platform_admins").select("user_id").eq("user_id", id).maybeSingle(),
    db
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", id)
      .neq("organization_id", orgId)
      .is("revoked_at", null)
      .limit(1),
  ]);
  const temOutraVida = admin !== null || (outras ?? []).length > 0;
  if (temOutraVida) {
    return {
      id,
      email,
      senhaNova: null,
      aviso:
        `${email} também é administrador da plataforma ou membro de outra organização: ` +
        "a senha dela NÃO foi trocada (senha fácil ali abriria dados reais). Entra com a senha atual.",
    };
  }
  if (!senha) return { id, email, senhaNova: null, aviso: null };
  const { error } = await db.auth.admin.updateUserById(id, { password: senha });
  if (error) throw new Error(`senha de ${email}: ${error.message}`);
  return { id, email, senhaNova: senha, aviso: null };
}

async function semearEquipe(
  db: SupabaseClient,
  orgId: string,
  emailExtra: string | null,
  demonstrador: Demonstrador | null,
): Promise<{ equipe: Record<string, string>; acesso: string[] }> {
  const equipe: Record<string, string> = {};
  const vinculos: Array<{ user_id: string; role: string }> = [];
  for (const m of EQUIPE) {
    equipe[m.chave] = await garantirConta(db, emailDaEquipe(m.chave), m.nome);
    vinculos.push({ user_id: equipe[m.chave]!, role: m.papel });
  }

  // O demonstrador vem PRIMEIRO: é ele quem recebe a carteira ("Minhas").
  const { data: admins } = await db.from("platform_admins").select("user_id");
  const acesso = new Set<string>(demonstrador ? [demonstrador.id] : []);
  for (const a of (admins ?? []) as { user_id: string }[]) acesso.add(a.user_id);
  if (emailExtra) {
    const id = await idPorEmail(db, emailExtra);
    if (!id) throw new Error(`--email: nenhuma conta com ${emailExtra}`);
    acesso.add(id);
  }
  for (const id of acesso) {
    if (!vinculos.some((v) => v.user_id === id)) vinculos.push({ user_id: id, role: "admin" });
  }

  await inserir(
    db,
    "user_organizations",
    vinculos.map((v) => ({
      ...v,
      organization_id: orgId,
      accepted_at: new Date().toISOString(),
      // A senha da demo é escolhida de propósito: sem a troca obrigatória no primeiro acesso.
      senha_provisoria: false,
    })),
  );
  // Jornada de atendimento (seg–sex, 9h–12h e 13h–18h): sem ela a Agenda não calcula
  // horários livres e mostra erro para cada tipo de reunião.
  const jornada = {
    timezone: "America/Sao_Paulo",
    windows: [1, 2, 3, 4, 5].flatMap((dow) => [
      { dow, start: "09:00", end: "12:00" },
      { dow, start: "13:00", end: "18:00" },
    ]),
  };
  const { error: erroJornada } = await db.from("attendant_availability").upsert(
    vinculos.map((v) => ({
      organization_id: orgId,
      user_id: v.user_id,
      is_available: true,
      capacity: 10,
      schedule: jornada,
    })) as never,
    { onConflict: "organization_id,user_id" },
  );
  if (erroJornada) throw new Error(`jornada da equipe: ${erroJornada.message}`);
  return { equipe, acesso: [...acesso] };
}

// ── CRM ──────────────────────────────────────────────────────────────────────

/**
 * A organização nova nasce com moldes de gatilho (`fn_seed_default_pipeline_for_org`,
 * `fn_semear_tipos_de_agendamento_na_org_nova`): o funil "Pedidos", vazio, e tipos de
 * agendamento genéricos. A agência tem os dela: o funil sai e os tipos molde desligam.
 */
async function limparMoldes(db: SupabaseClient, orgId: string): Promise<void> {
  const { error } = await db.from("crm_pipelines").delete().eq("organization_id", orgId);
  if (error) throw new Error(`apagar o funil molde: ${error.message}`);
  const { error: erroTipos } = await db
    .from("calendar_event_types")
    .update({ is_active: false } as never)
    .eq("organization_id", orgId)
    .in("slug", ["consulta", "atendimento", "reuniao"]);
  if (erroTipos) throw new Error(`desligar tipos molde: ${erroTipos.message}`);
}

async function semearFunis(db: SupabaseClient, orgId: string) {
  await limparMoldes(db, orgId);
  const funis: Record<string, { id: string; etapas: Record<string, string> }> = {};
  let posicao = 1000;
  for (const f of FUNIS) {
    const id = await idDe(db, "crm_pipelines", {
      organization_id: orgId,
      name: f.nome,
      slug: f.slug,
      description: f.descricao,
      is_default: f.padrao,
      position: posicao,
      vocabulary: VOCABULARIO,
      settings: {
        fields: [],
        canonical_tags: SERVICOS.map((s) => s.tag),
        lost_reasons: MOTIVOS_DE_PERDA,
      },
    });
    posicao += 1000;
    const ids = await inserir(
      db,
      "crm_stages",
      f.etapas.map((e, i) => ({
        organization_id: orgId,
        pipeline_id: id,
        name: e.nome,
        slug: e.slug,
        position: (i + 1) * 1000,
        expected_duration_hours: e.horas,
        win_probability: e.probabilidade,
        is_won: e.ganho ?? false,
        is_lost: e.perdido ?? false,
      })),
    );
    funis[f.slug] = { id, etapas: Object.fromEntries(f.etapas.map((e, i) => [e.slug, ids[i]!])) };
  }
  return funis;
}

async function semearContatos(db: SupabaseClient, orgId: string, gente: Pessoa[]) {
  return inserir(
    db,
    "contacts",
    gente.map((p, i) => ({
      organization_id: orgId,
      name: p.nome,
      display_name: p.nome,
      phone_number: p.telefone,
      email: p.email,
      tags: p.tags,
      custom_fields: { empresa: p.empresa, cidade: p.cidade, origem: p.origem },
      created_at: quando((120 - i) * DIA * 0.9),
    })),
  );
}

export interface Oportunidade {
  contato: number;
  funil: string;
  etapa: string;
  servico: (typeof SERVICOS)[number];
  dono: string;
  status: "open" | "won" | "lost";
  idadeDias: number;
  paradoHoras: number;
  valorCents: number;
  motivo: string | null;
}

export function planejarOportunidades(
  r: ReturnType<typeof sorteador>,
  quantosContatos: number,
): Oportunidade[] {
  // Distribuição do funil comercial: muitos no topo, poucos no fundo, e um histórico fechado.
  const comercial: Array<[string, number]> = [
    ["novo", 22],
    ["diagnostico", 16],
    ["proposta", 14],
    ["negociacao", 10],
    ["fechado", 20],
    ["perdido", 14],
  ];
  const renovacao: Array<[string, number]> = [
    ["mapeado", 5],
    ["conversa", 4],
    ["aditivo", 3],
    ["renovado", 4],
    ["cancelado", 2],
  ];
  const saida: Oportunidade[] = [];
  let contato = 0;
  const montar = (funil: string, etapa: string): void => {
    const servico = r.um(SERVICOS);
    const ganho = etapa === "fechado" || etapa === "renovado";
    const perdido = etapa === "perdido" || etapa === "cancelado";
    const fundo = ["negociacao", "aditivo"].includes(etapa);
    saida.push({
      contato: contato++ % quantosContatos,
      funil,
      etapa,
      servico,
      dono: r.um(VENDEDORES),
      status: ganho ? "won" : perdido ? "lost" : "open",
      idadeDias: ganho || perdido ? r.inteiro(20, 110) : r.inteiro(1, 45),
      // Um em cada cinco abertos está parado além do prazo da etapa ("esfriando").
      paradoHoras:
        ganho || perdido
          ? r.inteiro(48, 600)
          : r.chance(0.2)
            ? r.inteiro(200, 400)
            : r.inteiro(1, 60),
      // Reais redondos de 100 em 100, em centavos; negociação carrega 10% de margem pedida.
      valorCents:
        Math.round((r.inteiro(servico.min, servico.max) * (fundo ? 1.1 : 1)) / 100) * 100 * 100,
      motivo: perdido ? r.um(MOTIVOS_DE_PERDA) : null,
    });
  };
  for (const [etapa, n] of comercial) for (let i = 0; i < n; i++) montar("comercial", etapa);
  for (const [etapa, n] of renovacao) for (let i = 0; i < n; i++) montar("renovacao", etapa);
  return saida;
}

async function semearOportunidades(
  db: SupabaseClient,
  orgId: string,
  plano: Oportunidade[],
  funis: Awaited<ReturnType<typeof semearFunis>>,
  contatos: string[],
  gente: Pessoa[],
  equipe: Record<string, string>,
) {
  const posicoes: Record<string, number> = {};
  const ids = await inserir(
    db,
    "crm_leads",
    plano.map((o) => {
      const etapaId = funis[o.funil]!.etapas[o.etapa]!;
      posicoes[etapaId] = (posicoes[etapaId] ?? 0) + 1000;
      const ultima = quando(o.paradoHoras * HORA);
      return {
        organization_id: orgId,
        pipeline_id: funis[o.funil]!.id,
        stage_id: etapaId,
        contact_id: contatos[o.contato],
        title: `${gente[o.contato]!.empresa} — ${o.servico.nome}`,
        description: `Lead de ${gente[o.contato]!.origem}. ${gente[o.contato]!.cidade}.`,
        status: o.status,
        source: "manual",
        owner_kind: "user",
        owner_user_id: equipe[o.dono],
        assigned_at: quando(o.idadeDias * DIA),
        value_cents: o.servico.recorrente ? null : o.valorCents,
        recurring_value_cents: o.servico.recorrente ? o.valorCents : null,
        recurring_period: o.servico.recorrente ? "monthly" : null,
        recurring_months: o.servico.recorrente ? 12 : null,
        currency: "BRL",
        tags: [o.servico.tag],
        position_in_stage: posicoes[etapaId],
        last_activity_at: ultima,
        created_at: quando(o.idadeDias * DIA),
        closed_at: o.status === "open" ? null : ultima,
        lost_reason: o.motivo,
      };
    }),
  );

  // Linha do tempo: uma nota de abertura e, para metade, uma nota de acompanhamento.
  const r = sorteador(7);
  const atividades = plano.flatMap((o, i) => {
    const base = {
      organization_id: orgId,
      lead_id: ids[i],
      contact_id: contatos[o.contato],
      source_module: "crm",
      type: "note",
      actor_kind: "user",
      performed_by_user_id: equipe[o.dono],
    };
    const linhas = [
      {
        ...base,
        reason: `Primeiro contato via ${gente[o.contato]!.origem}.`,
        performed_at: quando(o.idadeDias * DIA),
      },
    ];
    if (r.chance(0.6))
      linhas.push({
        ...base,
        reason: r.um(NOTAS),
        performed_at: quando(o.paradoHoras * HORA + HORA),
      });
    return linhas;
  });
  await inserir(db, "crm_lead_activities", atividades);
  return { ids, atividades: atividades.length };
}

// ── Conversas ────────────────────────────────────────────────────────────────

async function semearConversas(
  db: SupabaseClient,
  orgId: string,
  plano: Oportunidade[],
  leadIds: string[],
  contatos: string[],
  gente: Pessoa[],
  equipe: Record<string, string>,
) {
  // O canal da demo é o CHAT NO SITE, igual ao que `POST /api/v1/channels/webchat` cria: chave
  // pública `wck_`, sem segredo de webhook, WORKING. Não há WhatsApp na demo — um número sem
  // sessão no WAHA seria derrubado pela checagem de saúde do worker. A chave não é segredo
  // (vai no código do site) e é por ela que o aquecimento e os visitantes conversam com a Lia.
  const chave = `wck_${randomBytes(32).toString("base64url")}`;
  const sessao = await idDe(db, "channel_sessions", {
    organization_id: orgId,
    provider: "webchat",
    webchat_public_key: chave,
    webchat_allowed_origins: [],
    webhook_secret_encrypted: "\\x00",
    display_name: "Chat no site",
    status: "WORKING",
    metadata: {},
    // A conversa nova não cria negócio sozinha: os negócios da demo vêm do seed.
    conversa_nova_cria_negocio: false,
  });

  const r = sorteador(11);
  // Uma conversa por contato, para 2 de cada 5 negócios: o plano é ordenado por etapa, e o
  // passo fixo espalha as conversas por todas elas (topo, fundo, ganhos e perdidos).
  const escolhidos = plano
    .map((o, i) => ({ o, i }))
    .filter(({ o }, idx, todos) => todos.findIndex((x) => x.o.contato === o.contato) === idx)
    .filter((_, idx) => idx % 5 < 2)
    .slice(0, 45);

  let mensagens = 0;
  for (const [n, { o, i }] of escolhidos.entries()) {
    const momento = o.funil === "renovacao" ? "suporte" : o.etapa;
    const roteiro = r.um(ROTEIROS[momento] ?? ROTEIROS.novo!);
    const p = {
      nome: gente[o.contato]!.nome,
      empresa: gente[o.contato]!.empresa,
      servico: o.servico.nome,
    };
    const fim = o.paradoHoras * HORA;
    const passo = Math.max(
      4 * 60_000,
      Math.min(6 * HORA, (o.idadeDias * DIA - fim) / (roteiro.length + 1)),
    );
    const horarios = roteiro.map((_, k) => fim + (roteiro.length - 1 - k) * passo);
    const ultima = roteiro[roteiro.length - 1]!;
    const aberta = o.status === "open";
    const clienteEsperando = aberta && ultima.quem === "cliente";
    // Metade de quem espera resposta fica SEM DONO: é o que a aba Fila (a que o Inbox abre)
    // mostra. O resto tem dono, e uma parte é de quem entra na demo (aba Minhas).
    const semDono = clienteEsperando && n % 2 === 0;
    // Sem dono, com a Lia publicada no canal, a conversa é dela (aba Automático). Metade dessas
    // é PASSAGEM: a IA chamou uma pessoa e se calou — é o que a aba Fila (a que o Inbox abre)
    // mostra. A outra metade fica com a Lia.
    const passada = semDono && n % 4 === 0;
    const status = !aberta
      ? "resolved"
      : clienteEsperando && !semDono && n % 3 === 0
        ? "pending"
        : "open";
    const ultimaDoCliente = [...roteiro].reverse().findIndex((f) => f.quem === "cliente");
    const ultimaDaEquipe = [...roteiro].reverse().findIndex((f) => f.quem === "equipe");
    const horaDoCliente =
      ultimaDoCliente >= 0 ? quando(horarios[roteiro.length - 1 - ultimaDoCliente]!) : null;

    // Endereço da conversa no chat, como a ingestão grava (`lib/channels/webchat/ingest.ts`):
    // visitante = conversa, contato pela identidade `webchat:<conexão>:<visitante>`.
    const visitante = randomUUID();
    const { error: erroIdentidade } = await db
      .from("contacts")
      .update({ social_identity: `webchat:${sessao}:${visitante}` } as never)
      .eq("id", contatos[o.contato]!);
    if (erroIdentidade) throw new Error(`identidade do visitante: ${erroIdentidade.message}`);

    const conversa = await idDe(db, "conversations", {
      organization_id: orgId,
      contact_id: contatos[o.contato],
      channel_session_id: sessao,
      channel: "webchat",
      provider_conversation_id: visitante,
      status,
      assignee_kind: semDono ? null : "user",
      assigned_to_user_id: semDono ? null : equipe[o.dono],
      assigned_at: semDono ? null : quando(o.idadeDias * DIA),
      bot_silenced_until: passada ? new Date(Date.now() + 30 * DIA).toISOString() : null,
      last_handoff_at: passada ? horaDoCliente : null,
      last_handoff_reason: passada ? r.um(MOTIVOS_DE_PASSAGEM) : null,
      awaiting_since: clienteEsperando ? horaDoCliente : null,
      last_message_at: quando(fim),
      last_message_preview: preencher(ultima.texto, p).slice(0, 120),
      last_inbound_at: horaDoCliente,
      last_outbound_at:
        ultimaDaEquipe >= 0 ? quando(horarios[roteiro.length - 1 - ultimaDaEquipe]!) : null,
      unread_count_for_assignee: clienteEsperando ? r.inteiro(1, 3) : 0,
      tags: [o.servico.tag],
      created_at: quando(horarios[0]! + HORA),
      metadata: { seed: MARCA, lead_id: leadIds[i] },
    });

    await inserir(
      db,
      "messages",
      roteiro.map((f, k) => {
        const daEquipe = f.quem === "equipe";
        return {
          organization_id: orgId,
          conversation_id: conversa,
          channel_session_id: sessao,
          contact_id: contatos[o.contato],
          external_id: `${MARCA}-${n}-${k}`,
          type: "text",
          direction: daEquipe ? "outbound" : "inbound",
          status: daEquipe
            ? k === roteiro.length - 1 && aberta
              ? "delivered"
              : "read"
            : "received",
          sent_via: daEquipe ? "user" : "crm",
          sent_by_user_id: daEquipe ? equipe[o.dono] : null,
          body: preencher(f.texto, p),
          sent_at: quando(horarios[k]!),
          created_at: quando(horarios[k]!),
          // O gatilho de eventos ignora histórico importado: nenhuma resposta automática acorda.
          metadata: { historico_importado: "true", seed: MARCA },
        };
      }),
    );
    mensagens += roteiro.length;
  }
  return { sessao, chave, conversas: escolhidos.length, mensagens };
}

// ── Agenda e tarefas ─────────────────────────────────────────────────────────

/**
 * Dia relativo a hoje, numa hora de relógio de São Paulo (UTC−3, sem horário de verão desde
 * 2019). Não depende do fuso da máquina que roda o seed.
 */
function horarioDeSaoPaulo(diasDeHoje: number, hora: number, minuto: number): Date {
  const dia = new Date(Date.now() - 3 * HORA + diasDeHoje * DIA);
  return new Date(
    Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), hora + 3, minuto),
  );
}

async function semearAgenda(
  db: SupabaseClient,
  orgId: string,
  plano: Oportunidade[],
  contatos: string[],
  gente: Pessoa[],
  equipe: Record<string, string>,
) {
  const tipos = await inserir(
    db,
    "calendar_event_types",
    TIPOS_DE_REUNIAO.map((t, i) => ({
      organization_id: orgId,
      name: t.nome,
      slug: t.slug,
      category: t.categoria,
      duration_minutes: t.minutos,
      location_kind: "video_link",
      reminder_enabled: false,
      // Sem responsável padrão a Agenda recusa calcular horários livres do tipo.
      default_owner_user_id: equipe.marina,
      position: i,
    })),
  );

  const r = sorteador(23);
  const reunioes = plano
    .filter((o) => o.funil === "comercial" && o.etapa !== "novo")
    .slice(0, 48)
    .map((o, n) => {
      const tipoIdx =
        o.etapa === "diagnostico" ? 0 : o.etapa === "fechado" ? 2 : o.etapa === "perdido" ? 0 : 1;
      const tipo = TIPOS_DE_REUNIAO[tipoIdx]!;
      // Abertos em diagnóstico/proposta/negociação: reunião FUTURA (até 3 semanas). Demais: passada.
      const futura = o.status === "open" && n % 3 !== 0;
      const dias = futura ? r.inteiro(0, 21) : -r.inteiro(1, 30);
      const inicio = horarioDeSaoPaulo(dias, r.um([9, 10, 11, 14, 15, 16, 17]), r.um([0, 30]));
      const statusPassado = r.chance(0.75) ? "completed" : r.chance(0.5) ? "no_show" : "cancelled";
      const status = futura ? (r.chance(0.8) ? "confirmed" : "pending") : statusPassado;
      return {
        organization_id: orgId,
        event_type_id: tipos[tipoIdx],
        title: `${tipo.nome} — ${gente[o.contato]!.empresa}`,
        starts_at: inicio.toISOString(),
        ends_at: new Date(inicio.getTime() + tipo.minutos * 60_000).toISOString(),
        status,
        cancelled_at:
          status === "cancelled" ? new Date(inicio.getTime() - DIA).toISOString() : null,
        cancellation_reason: status === "cancelled" ? "Cliente pediu para remarcar." : null,
        owner_user_id: equipe[o.dono],
        contact_id: contatos[o.contato],
        location_kind: "video_link",
        meeting_url: `https://meet.example.com/vertice-${n}`,
        created_by_kind: "user",
        created_by_user_id: equipe[o.dono],
        source: "ui",
      };
    });
  await inserir(db, "calendar_appointments", reunioes);
  return reunioes.length;
}

async function semearTarefas(
  db: SupabaseClient,
  orgId: string,
  plano: Oportunidade[],
  leadIds: string[],
  contatos: string[],
  equipe: Record<string, string>,
) {
  const r = sorteador(31);
  const tarefas = plano
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.status === "open" || r.chance(0.3))
    .slice(0, 60)
    .map(({ o, i }, n) => {
      const vencida = n % 4 === 0;
      const feita = o.status !== "open" || n % 5 === 0;
      return {
        organization_id: orgId,
        title: r.um(TAREFAS),
        description: null,
        due_date: horarioDeSaoPaulo(
          vencida ? -r.inteiro(1, 6) : r.inteiro(0, 14),
          18,
          0,
        ).toISOString(),
        priority: r.um(["low", "medium", "medium", "high", "urgent"] as const),
        status: feita ? "done" : n % 7 === 0 ? "in_progress" : "pending",
        lead_id: leadIds[i],
        contact_id: contatos[o.contato],
        assigned_to: equipe[o.dono],
        created_by: equipe.marina,
      };
    });
  await inserir(db, "crm_tasks", tarefas);
  return tarefas.length;
}

// ── IA, automações e follow-up (tudo desligado) ──────────────────────────────

async function semearIa(
  db: SupabaseClient,
  orgId: string,
  funis: Awaited<ReturnType<typeof semearFunis>>,
  equipe: Record<string, string>,
  sessao: string,
  modelo: { provider: string; model: string },
) {
  const fonte = await idDe(db, "ai_knowledge_sources", {
    organization_id: orgId,
    source_type: "faq",
    name: "Perguntas frequentes da agência",
    status: "ready",
    is_active: true,
    ingested_at: new Date().toISOString(),
  });
  await inserir(
    db,
    "ai_faq_items",
    PERGUNTAS_FREQUENTES.map((f, i) => ({
      organization_id: orgId,
      knowledge_source_id: fonte,
      question: f.pergunta,
      answer: f.resposta,
      tags: [],
      locale: "pt-BR",
      position: i,
    })),
  );

  // A Lia (primeiro agente) nasce PUBLICADA no chat do site, com a FAQ e com casos ligados:
  // é ela que atende os visitantes e o aquecimento. Os demais ficam em rascunho. Responder
  // exige chave de IA na organização (IA › Credenciais) ou de plataforma no .env.
  for (const [idx, a] of AGENTES.entries()) {
    const noAr = idx === 0;
    const agente = await idDe(db, "ai_agents", {
      organization_id: orgId,
      name: a.nome,
      description: a.descricao,
      kind: "mcp_agent",
      model: modelo.model,
      system_prompt: a.prompt,
      is_active: noAr,
      is_default: false,
      priority: noAr ? 10 : 0,
    });
    const versao = await idDe(db, "ai_agent_versions", {
      organization_id: orgId,
      agent_id: agente,
      version_number: 1,
      system_prompt: a.prompt,
      provider: modelo.provider,
      model: modelo.model,
      status: noAr ? "published" : "draft",
      published_at: noAr ? new Date().toISOString() : null,
      channel_session_id: noAr ? sessao : null,
      cases_enabled: noAr,
      knowledge_source_ids: [fonte],
    });
    if (noAr) {
      const { error } = await db
        .from("ai_agents")
        .update({ published_version_id: versao } as never)
        .eq("id", agente);
      if (error) throw new Error(`publicar ${a.nome}: ${error.message}`);
      await inserir(db, "ai_agent_version_channels", [
        { organization_id: orgId, agent_version_id: versao, channel_session_id: sessao },
      ]);
    }
  }

  const regras = regrasDeDemonstracao({
    pipelineId: funis.comercial!.id,
    stageId: funis.comercial!.etapas.novo!,
    managerId: equipe.marina!,
  });
  await inserir(
    db,
    "automation_rules",
    regras.map((regra) => ({ organization_id: orgId, ...regra, is_active: false })),
  );

  const versao = await idDe(db, "followup_flow_versions", {
    organization_id: orgId,
    graph: GRAFO_DE_DEMONSTRACAO,
  });
  await idDe(db, "followup_flow_pointers", {
    organization_id: orgId,
    ...PONTEIRO_DE_DEMONSTRACAO,
    name: "Retomada de proposta sem resposta",
    status: "disabled",
    active_version_id: versao,
  });
  return { agentes: AGENTES.length, perguntas: PERGUNTAS_FREQUENTES.length, regras: regras.length };
}

/** Os gatilhos das conversas sem dono pedem roteamento; o histórico da demo não precisa dele. */
async function encerrarEventosDoSeed(db: SupabaseClient, orgId: string): Promise<number> {
  const { data, error } = await db
    .from("event_log")
    .update({ status: "done", consumed_by: [MARCA] } as never)
    .eq("organization_id", orgId)
    .eq("event_type", "conversation.routing_requested")
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`encerrar eventos do seed: ${error.message}`);
  return (data ?? []).length;
}

/** O chat no site é módulo da INSTALAÇÃO (`lib/channels/webchat/modulo.ts`); o seed só lê. */
async function chatNoSiteLigadoNaInstalacao(db: SupabaseClient): Promise<boolean> {
  const { data } = await db
    .from("platform_config")
    .select("valor")
    .eq("chave", "MODULO_CANAL_WEBCHAT")
    .maybeSingle();
  return (data as { valor: string | null } | null)?.valor === "ligado";
}

// ── Principal ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const recriar = args.includes("--recriar");
  const opcao = (nome: string): string | null =>
    args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) || null;
  const emailExtra = opcao("email");
  // O par provedor/modelo da Lia precisa casar com a chave cadastrada (IA › Credenciais).
  const modelo = {
    provider: opcao("provedor") ?? "anthropic",
    model: opcao("modelo") ?? "claude-sonnet-4-6",
  };

  const credenciais = credenciaisSupabaseDeTeste();
  if (!destinoDaDemoEhLocal(credenciais.url)) {
    console.error(
      `[${MARCA}] recusado: ${new URL(credenciais.url).host} não é desta máquina, da rede local ` +
        "nem a rede interna do servidor. Na VPS, rode `make seeds-demo` no próprio servidor.",
    );
    process.exit(2);
  }
  console.info(`[${MARCA}] escrevendo em ${credenciais.url} (origem: ${credenciais.origem})`);

  const db = createClient(credenciais.url, credenciais.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const orgId = await prepararOrganizacao(db, recriar);
  // Por variável de ambiente também: no servidor a senha não passa pela linha de comando.
  const emailDoDemonstrador = opcao("demonstrador") ?? (process.env.DEMO_DEMONSTRADOR || null);
  const senhaDoDemonstrador = opcao("senha") ?? (process.env.DEMO_SENHA || null);
  if (senhaDoDemonstrador !== null && senhaDoDemonstrador.length < 6) {
    console.error(
      "A senha do demonstrador precisa de ao menos 6 caracteres (regra do Supabase Auth).",
    );
    process.exit(2);
  }
  const demonstrador = emailDoDemonstrador
    ? await garantirDemonstrador(
        db,
        orgId,
        emailDoDemonstrador.trim().toLowerCase(),
        senhaDoDemonstrador,
      )
    : null;
  const { equipe, acesso } = await semearEquipe(db, orgId, emailExtra, demonstrador);
  const funis = await semearFunis(db, orgId);

  const gente = pessoas(sorteador(2026), 120);
  const contatos = await semearContatos(db, orgId, gente);
  const plano = planejarOportunidades(sorteador(42), contatos.length);
  // Quem entra na demo também tem carteira: 1 de cada 6 oportunidades abertas (com a
  // conversa, as tarefas e as reuniões dela) passa para a primeira conta com acesso.
  if (acesso[0]) {
    equipe.voce = acesso[0];
    plano
      .filter((o) => o.status === "open")
      .forEach((o, k) => {
        if (k % 6 === 0) o.dono = "voce";
      });
  }
  const { ids: leadIds, atividades } = await semearOportunidades(
    db,
    orgId,
    plano,
    funis,
    contatos,
    gente,
    equipe,
  );
  const conversas = await semearConversas(db, orgId, plano, leadIds, contatos, gente, equipe);
  const reunioes = await semearAgenda(db, orgId, plano, contatos, gente, equipe);
  const tarefas = await semearTarefas(db, orgId, plano, leadIds, contatos, equipe);
  const ia = await semearIa(db, orgId, funis, equipe, conversas.sessao, modelo);
  const eventos = await encerrarEventosDoSeed(db, orgId);
  const chatLigado = await chatNoSiteLigadoNaInstalacao(db);
  const link = `${credenciais.appUrl.replace(/\/+$/, "")}/chat/${conversas.chave}`;

  console.info(
    [
      `\n✅ ${ORGANIZACAO.nome}`,
      `   equipe: ${EQUIPE.length} pessoas · acesso de admin para ${acesso.length} conta(s) de fora da equipe fictícia`,
      `   CRM: ${contatos.length} contatos · ${leadIds.length} oportunidades em ${FUNIS.length} funis · ${atividades} notas`,
      `   Inbox: ${conversas.conversas} conversas · ${conversas.mensagens} mensagens, no chat do site`,
      `   Agenda: ${reunioes} reuniões · ${tarefas} tarefas`,
      `   IA: Lia publicada no chat do site (${modelo.provider}/${modelo.model}) · ${ia.perguntas} perguntas frequentes · ${ia.regras} regras e 1 follow-up DESLIGADOS`,
      `   eventos de roteamento encerrados: ${eventos}`,
      `   Chat do site: ${link}`,
      chatLigado
        ? "   Módulo do chat no site: ligado."
        : "   ⚠ Módulo do chat no site DESLIGADO na instalação: ligue em /admin/sistema, senão o link responde 404.",
      "   Para a Lia responder: chave de IA em IA › Credenciais (e teto em IA › Uso de IA).",
      "   Para a FAQ valer: chave de embedding e “Preparar tudo de novo” em IA › Conhecimento.",
      ...(demonstrador
        ? [
            `   Demonstrador: ${demonstrador.email} · ` +
              (demonstrador.senhaNova
                ? `senha: ${demonstrador.senhaNova}  (mostrada só agora; anote)`
                : "senha mantida"),
            ...(demonstrador.aviso ? [`   ⚠ ${demonstrador.aviso}`] : []),
          ]
        : []),
      `   Troque de organização no app para "${ORGANIZACAO.nome}".`,
    ].join("\n"),
  );
}

// Só roda quando chamado direto (o teste importa `destinoDaDemoEhLocal`).
if (process.argv[1] && /demo-agencia\.ts$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(`❌ [${MARCA}] falhou:`, err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

/**
 * Seed REAL da organização Ânima Hub — `make seeds-anima` (no servidor) ou
 * `pnpm exec tsx scripts/anima/seeds/anima-hub.ts --config=<arquivo>` (local).
 *
 * Diferente do seed de demonstração, este escreve a empresa DE VERDADE. Por isso:
 *
 * - **Nada de dado pessoal no repositório.** E-mails, razão social e prompt vêm de um JSON
 *   fora do git (`.runtime/anima.seed.json` no servidor); o repositório leva só o exemplo.
 * - **Idempotente e conservador.** Roda quantas vezes for preciso. A identidade da organização
 *   (nome, razão social, CNPJ, encarregado, fuso, idioma) e o par provedor/modelo seguem o
 *   arquivo a cada rodada; o resto (jornada, orçamento, agentes, perguntas) só é CRIADO quando
 *   falta — o que alguém mudou pela tela não é desfeito.
 * - **Nunca toca senha de conta com vida.** Conta nova nasce com senha provisória forte,
 *   mostrada uma vez, e troca obrigatória no primeiro acesso (`senha_provisoria`, o mesmo
 *   caminho de Equipe › Criar pessoa). Conta já usada em outra organização ou na plataforma
 *   entra com a senha que tem. Conta que só existe na demonstração é recusada (a senha dela é
 *   fácil de propósito); conta sem organização nenhuma recebe senha provisória, como uma nova.
 * - **Nunca revoga nem reativa.** Quem saiu da equipe pela tela continua fora; admin da
 *   plataforma revogado continua revogado. O seed avisa e segue.
 * - **Chave de IA só pela tela** (IA › Credenciais). O seed grava a escolha, não o segredo.
 */
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../lib/env-de-teste";
import {
  escolherOrganizacao,
  gerarSenhaProvisoria,
  lerConfiguracao,
  type ConfiguracaoAnima,
} from "./configuracao-anima";
import { destinoDoSeedEhLocal } from "./destino";

const MARCA = "seed-anima-hub";
/** Slugs dos seeds de demonstração: nunca são "a Ânima Hub". */
const SLUGS_DE_DEMONSTRACAO = ["demo-vertice"];

interface Relatorio {
  linhas: string[];
  avisos: string[];
  senhas: Array<{ email: string; senha: string }>;
}

async function auditar(
  db: SupabaseClient,
  orgId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  // Fire-and-forget, como no app: falha de auditoria não desfaz o que foi feito.
  const { error } = await db.from("api_audit_log").insert({
    organization_id: orgId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    actor_user_id: null,
    bypassed_rls: true,
    metadata: { ...metadata, origem: MARCA },
  } as never);
  if (error) console.warn(`[${MARCA}] auditoria de ${action} falhou: ${error.message}`);
}

async function idPorEmail(db: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listar contas: ${error.message}`);
    const achou = data.users.find((u) => u.email?.toLowerCase() === email);
    if (achou) return achou.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

// ── Organização ──────────────────────────────────────────────────────────────

async function garantirOrganizacao(
  db: SupabaseClient,
  cfg: ConfiguracaoAnima,
  rel: Relatorio,
  criarSeAmbigua: boolean,
): Promise<string> {
  const o = cfg.organizacao;
  const { data, error } = await db
    .from("organizations")
    .select("id, slug")
    .neq("status", "redacted");
  if (error) throw new Error(`organizações: ${error.message}`);
  const escolha = escolherOrganizacao(
    (data ?? []) as { id: string; slug: string }[],
    o.slug,
    SLUGS_DE_DEMONSTRACAO,
  );

  const identidade = {
    display_name: o.nome,
    legal_name: o.razao_social,
    cnpj: o.cnpj,
    dpo_email: o.email_do_encarregado,
    privacy_policy_url: o.politica_de_privacidade,
    timezone: o.fuso,
    locale: o.idioma,
  };

  if (escolha.tipo === "ambigua" && !criarSeAmbigua) {
    throw new Error(
      `há ${escolha.slugs.length} organizações na instalação (${escolha.slugs.join(", ")}) e nenhuma ` +
        `com o slug "${o.slug}": ponha em organizacao.slug o slug da Ânima Hub, ou rode com ` +
        "--criar para criar uma organização nova ao lado delas.",
    );
  }
  if (escolha.tipo === "criar" || escolha.tipo === "ambigua") {
    const { data: criada, error: e } = await db
      .from("organizations")
      .insert({ slug: o.slug, ...identidade } as never)
      .select("id")
      .single();
    if (e || !criada) throw new Error(`criar organização: ${e?.message}`);
    const id = (criada as { id: string }).id;
    rel.linhas.push(`organização criada: ${o.nome} (${o.slug})`);
    await auditar(db, id, "organization.created", "organization", id, { slug: o.slug });
    return id;
  }

  const id = escolha.id;
  const patch = escolha.tipo === "adotar" ? { slug: o.slug, ...identidade } : identidade;
  const { error: e } = await db
    .from("organizations")
    .update(patch as never)
    .eq("id", id);
  if (e) throw new Error(`atualizar organização: ${e.message}`);
  rel.linhas.push(
    escolha.tipo === "adotar"
      ? `organização adotada: "${escolha.slugAntigo}" (criada no install) agora é ${o.nome} (${o.slug})`
      : `organização: ${o.nome} (${o.slug}) — identidade conferida`,
  );
  await auditar(db, id, "organization.updated", "organization", id, {
    campos: Object.keys(patch),
    adotada_de: escolha.tipo === "adotar" ? escolha.slugAntigo : undefined,
  });
  return id;
}

// ── Equipe ───────────────────────────────────────────────────────────────────

interface Vinculo {
  organization_id: string;
  role: string;
  revoked_at: string | null;
}

async function garantirPessoa(
  db: SupabaseClient,
  orgId: string,
  slugsDemo: Map<string, string>,
  pessoa: ConfiguracaoAnima["equipe"][number],
  rel: Relatorio,
): Promise<string | null> {
  let userId = await idPorEmail(db, pessoa.email);
  /** Conta criada nesta rodada (desfeita se o vínculo falhar). */
  let criada = false;
  /** A senha passa a ser provisória: gerada aqui, troca obrigatória no primeiro acesso. */
  let provisoria = false;

  if (userId) {
    const { data: vinculos } = await db
      .from("user_organizations")
      .select("organization_id, role, revoked_at")
      .eq("user_id", userId);
    const vs = (vinculos ?? []) as Vinculo[];
    const naAnima = vs.find((v) => v.organization_id === orgId);
    const ativos = vs.filter((v) => v.revoked_at === null);
    const naDemo = ativos.some((v) => slugsDemo.has(v.organization_id));
    const vidaReal = ativos.some((v) => !slugsDemo.has(v.organization_id));
    const { data: pa } = await db
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();
    if (!naAnima && naDemo && !vidaReal && !pa) {
      rel.avisos.push(
        `${pessoa.email} é a conta de DEMONSTRAÇÃO (senha fácil de propósito) e não entra na ` +
          "Ânima Hub: use outro e-mail para a demo (ex.: nome+demo@...).",
      );
      return null;
    }
    if (naAnima?.revoked_at) {
      rel.avisos.push(
        `${pessoa.email} foi removida da equipe pela tela: continua fora (o seed não reativa).`,
      );
      return null;
    }
    if (naAnima) {
      if (naAnima.role !== pessoa.papel) {
        const { error } = await db
          .from("user_organizations")
          .update({ role: pessoa.papel } as never)
          .eq("organization_id", orgId)
          .eq("user_id", userId);
        if (error) throw new Error(`papel de ${pessoa.email}: ${error.message}`);
        rel.linhas.push(`${pessoa.email}: papel ${naAnima.role} → ${pessoa.papel}`);
        await auditar(db, orgId, "member.role_changed", "membership", userId, {
          target_user_id: userId,
          de: naAnima.role,
          para: pessoa.papel,
        });
      } else {
        rel.linhas.push(`${pessoa.email}: já na equipe (${pessoa.papel})`);
      }
      return userId;
    }
    if (!vidaReal && !pa) {
      // Conta sem vida em lugar nenhum (ex.: sobrou de uma demonstração recriada): ninguém
      // garante quem sabe a senha dela. Vira provisória, como numa conta nova — sem dado a perder.
      const senha = gerarSenhaProvisoria();
      const { error } = await db.auth.admin.updateUserById(userId, { password: senha });
      if (error) throw new Error(`senha de ${pessoa.email}: ${error.message}`);
      provisoria = true;
      rel.senhas.push({ email: pessoa.email, senha });
    }
  } else {
    const senha = gerarSenhaProvisoria();
    const { data, error } = await db.auth.admin.createUser({
      email: pessoa.email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: pessoa.nome },
    });
    if (error || !data.user) throw new Error(`criar ${pessoa.email}: ${error?.message}`);
    userId = data.user.id;
    criada = true;
    provisoria = true;
    rel.senhas.push({ email: pessoa.email, senha });
  }

  // Senha provisória: troca no primeiro acesso. Conta com vida em outra organização ou na
  // plataforma: já tem a senha dela, que o seed nunca vê nem muda.
  const { error } = await db.from("user_organizations").insert({
    organization_id: orgId,
    user_id: userId,
    role: pessoa.papel,
    accepted_at: new Date().toISOString(),
    senha_provisoria: provisoria,
  } as never);
  if (error) {
    if (criada) await db.auth.admin.deleteUser(userId); // a mesma compensação da rota
    throw new Error(`vínculo de ${pessoa.email}: ${error.message}`);
  }
  rel.linhas.push(
    `${pessoa.email}: ${provisoria ? "senha provisória" : "conta existente, senha mantida"}; ` +
      `incluída como ${pessoa.papel}`,
  );
  await auditar(db, orgId, "member.created", "membership", userId, {
    target_user_id: userId,
    email: pessoa.email,
    role: pessoa.papel,
    senha_provisoria: provisoria,
  });
  return userId;
}

async function garantirAdminDaPlataforma(
  db: SupabaseClient,
  orgId: string,
  userId: string,
  email: string,
  rel: Relatorio,
): Promise<void> {
  const { data } = await db
    .from("platform_admins")
    .select("revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  const linha = data as { revoked_at: string | null } | null;
  if (linha?.revoked_at) {
    rel.avisos.push(`${email} teve o acesso de admin da plataforma revogado: continua revogado.`);
    return;
  }
  if (linha) return;
  const { error } = await db.from("platform_admins").insert({
    user_id: userId,
    granted_by: userId,
    scope: "full",
    // Como no bootstrap do dono: a verificação em duas etapas é ligada por quem administra,
    // em Configurações › Segurança, e não imposta pelo seed.
    mfa_required: false,
    reason: "Equipe Ânima Hub (seed da organização real)",
  } as never);
  if (error) throw new Error(`admin da plataforma ${email}: ${error.message}`);
  rel.linhas.push(`${email}: admin da plataforma`);
  await auditar(db, orgId, "platform_admin.granted", "platform_admin", userId, { email });
}

async function garantirJornadas(
  db: SupabaseClient,
  orgId: string,
  ids: string[],
  cfg: ConfiguracaoAnima,
  rel: Relatorio,
): Promise<void> {
  const { data } = await db
    .from("attendant_availability")
    .select("user_id")
    .eq("organization_id", orgId)
    .in("user_id", ids);
  const ja = new Set(((data ?? []) as { user_id: string }[]).map((d) => d.user_id));
  const faltam = ids.filter((id) => !ja.has(id));
  if (faltam.length === 0) return;
  const { error } = await db.from("attendant_availability").insert(
    faltam.map((user_id) => ({
      organization_id: orgId,
      user_id,
      is_available: true,
      capacity: cfg.atendimento.capacidade,
      schedule: { timezone: cfg.atendimento.fuso, windows: cfg.atendimento.janelas },
    })) as never,
  );
  if (error) throw new Error(`jornada da equipe: ${error.message}`);
  rel.linhas.push(`jornada de atendimento criada para ${faltam.length} pessoa(s)`);
}

// ── IA ───────────────────────────────────────────────────────────────────────

async function garantirIa(
  db: SupabaseClient,
  orgId: string,
  ia: NonNullable<ConfiguracaoAnima["ia"]>,
  rel: Relatorio,
): Promise<void> {
  // O par vai INTEIRO (como em scripts/bootstrap-owner.ts): trocar só o provedor deixaria um
  // modelo que o provedor novo não conhece.
  const { data: org } = await db.from("organizations").select("settings").eq("id", orgId).single();
  const settings = ((org as { settings?: Record<string, unknown> } | null)?.settings ??
    {}) as Record<string, unknown>;
  const llm = (settings.llm ?? {}) as Record<string, unknown>;
  if (llm.provider !== ia.provedor || llm.default_model !== ia.modelo) {
    const { error } = await db
      .from("organizations")
      .update({
        settings: { ...settings, llm: { ...llm, provider: ia.provedor, default_model: ia.modelo } },
      } as never)
      .eq("id", orgId);
    if (error) throw new Error(`provedor de IA: ${error.message}`);
    await auditar(db, orgId, "ai.llm_default_changed", "organization", orgId, {
      provider: ia.provedor,
      model: ia.modelo,
    });
  }
  rel.linhas.push(`IA padrão: ${ia.provedor}/${ia.modelo}`);

  // Orçamento: só quando ainda não existe. Nasce em "avisar" (nunca em "bloquear": a escada do
  // produto exige passar pelo aviso, e quem arma o bloqueio é uma pessoa, pela tela).
  const { data: orcamento } = await db
    .from("ai_budgets")
    .select("organization_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!orcamento) {
    const centavos = Math.round(ia.teto_mensal_usd * 100);
    const modo = centavos >= 100 ? "avisar" : "off";
    const { error } = await db.from("ai_budgets").insert({
      organization_id: orgId,
      monthly_limit_cents: centavos,
      alarm_threshold_pct: ia.alerta_pct,
      enforcement_mode: modo,
    } as never);
    if (error) throw new Error(`orçamento de IA: ${error.message}`);
    rel.linhas.push(
      modo === "avisar"
        ? `orçamento de IA: teto de US$ ${ia.teto_mensal_usd.toFixed(2)}/mês, avisa em ${ia.alerta_pct}%`
        : "orçamento de IA: sem teto (defina em IA › Uso de IA)",
    );
    await auditar(db, orgId, "ai.budget_updated", "ai_budget", orgId, {
      monthly_limit_cents: centavos,
      enforcement_mode: modo,
    });
  }

  // Perguntas frequentes: uma fonte, criada uma vez. Para o agente USAR, falta a chave de
  // embedding e “Preparar tudo de novo” em IA › Conhecimento.
  let fonte: string | null = null;
  if (ia.perguntas_frequentes.length > 0) {
    const nome = "Perguntas frequentes da Ânima Hub";
    const { data: existente } = await db
      .from("ai_knowledge_sources")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", nome)
      .maybeSingle();
    fonte = (existente as { id: string } | null)?.id ?? null;
    if (!fonte) {
      const { data: criada, error } = await db
        .from("ai_knowledge_sources")
        .insert({
          organization_id: orgId,
          source_type: "faq",
          name: nome,
          status: "ready",
          is_active: true,
          ingested_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (error || !criada) throw new Error(`fonte de conhecimento: ${error?.message}`);
      fonte = (criada as { id: string }).id;
      const { error: eItens } = await db.from("ai_faq_items").insert(
        ia.perguntas_frequentes.map((f, i) => ({
          organization_id: orgId,
          knowledge_source_id: fonte,
          question: f.pergunta,
          answer: f.resposta,
          tags: [],
          locale: "pt-BR",
          position: i,
        })) as never,
      );
      if (eItens) throw new Error(`perguntas frequentes: ${eItens.message}`);
      rel.linhas.push(`${ia.perguntas_frequentes.length} pergunta(s) frequente(s)`);
    }
  }

  // Agentes: em RASCUNHO, sempre. Publicar (e ligar a um canal) é decisão de quem opera,
  // pelo botão Publicar, depois de testar.
  for (const a of ia.agentes) {
    const { data: existente } = await db
      .from("ai_agents")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", a.nome)
      .maybeSingle();
    if (existente) continue;
    const { data: agente, error } = await db
      .from("ai_agents")
      .insert({
        organization_id: orgId,
        name: a.nome,
        description: a.descricao,
        kind: "mcp_agent",
        model: ia.modelo,
        system_prompt: a.prompt,
        is_active: false,
        is_default: false,
        priority: 0,
      } as never)
      .select("id")
      .single();
    if (error || !agente) throw new Error(`agente ${a.nome}: ${error?.message}`);
    const agenteId = (agente as { id: string }).id;
    const { error: eVersao } = await db.from("ai_agent_versions").insert({
      organization_id: orgId,
      agent_id: agenteId,
      version_number: 1,
      system_prompt: a.prompt,
      provider: ia.provedor,
      model: ia.modelo,
      status: "draft",
      knowledge_source_ids: fonte ? [fonte] : [],
    } as never);
    if (eVersao) throw new Error(`versão de ${a.nome}: ${eVersao.message}`);
    rel.linhas.push(`agente ${a.nome}: rascunho criado`);
    await auditar(db, orgId, "ai_agent.created", "ai_agent", agenteId, { name: a.nome });
  }
}

// ── Execução ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const caminho =
    args.find((a) => a.startsWith("--config="))?.slice("--config=".length) ||
    process.env.ANIMA_SEED_CONFIG ||
    "";
  if (!caminho) throw new Error("informe o arquivo: --config=<arquivo> (ou ANIMA_SEED_CONFIG)");
  const cfg = lerConfiguracao(readFileSync(caminho, "utf8"));

  const credenciais = credenciaisSupabaseDeTeste();
  if (!destinoDoSeedEhLocal(credenciais.url)) {
    throw new Error(
      `destino recusado: ${credenciais.url}. Este seed roda no servidor (make seeds-anima, pela ` +
        "rede interna do Supabase) ou contra o Supabase local — nunca da sua máquina para produção.",
    );
  }
  console.info(`[${MARCA}] escrevendo em ${credenciais.url} (origem: ${credenciais.origem})`);
  const db = createClient(credenciais.url, credenciais.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rel: Relatorio = { linhas: [], avisos: [], senhas: [] };
  const orgId = await garantirOrganizacao(db, cfg, rel, args.includes("--criar"));

  const { data: demos } = await db
    .from("organizations")
    .select("id, slug")
    .in("slug", SLUGS_DE_DEMONSTRACAO);
  const slugsDemo = new Map(
    ((demos ?? []) as { id: string; slug: string }[]).map((d) => [d.id, d.slug]),
  );

  const ids: string[] = [];
  for (const pessoa of cfg.equipe) {
    const id = await garantirPessoa(db, orgId, slugsDemo, pessoa, rel);
    if (!id) continue;
    ids.push(id);
    if (pessoa.admin_da_plataforma)
      await garantirAdminDaPlataforma(db, orgId, id, pessoa.email, rel);
  }
  if (ids.length > 0) await garantirJornadas(db, orgId, ids, cfg, rel);
  if (cfg.ia) await garantirIa(db, orgId, cfg.ia, rel);

  console.info(
    [
      "",
      `✅ ${cfg.organizacao.nome}`,
      ...rel.linhas.map((l) => `   ${l}`),
      ...(rel.senhas.length > 0
        ? [
            "",
            "   Senhas PROVISÓRIAS (mostradas só agora; cada pessoa troca no primeiro acesso):",
            ...rel.senhas.map((s) => `     ${s.email}  ${s.senha}`),
          ]
        : []),
      ...(rel.avisos.length > 0 ? ["", ...rel.avisos.map((a) => `   ⚠ ${a}`)] : []),
      ...(cfg.ia
        ? ["", "   Chave de IA: cadastre em IA › Credenciais (o seed nunca grava segredo)."]
        : []),
    ].join("\n"),
  );
}

if (process.argv[1] && /anima-hub\.ts$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(`❌ [${MARCA}] falhou:`, err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

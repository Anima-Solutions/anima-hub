/**
 * A configuração do seed da Ânima Hub — a parte PURA (lida, validada e decidida sem banco).
 *
 * O arquivo real (e-mails, razão social, prompt) NÃO mora no repositório, que é público: fica no
 * servidor, em `.runtime/anima.seed.json` (600, fora do git). O repositório leva só o exemplo,
 * `anima.seed.example.json`, que este módulo RECUSA de propósito (domínio de exemplo).
 */
import { randomInt } from "node:crypto";

import { z } from "zod";

const PAPEIS = ["viewer", "agent", "manager", "admin"] as const;

const janela = z.object({
  dow: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const configuracaoSchema = z.object({
  organizacao: z.object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug: minúsculas, números e hífens"),
    nome: z.string().min(2),
    razao_social: z.string().min(2),
    cnpj: z
      .string()
      .regex(/^\d{14}$/, "cnpj: 14 dígitos, sem pontuação")
      .nullable()
      .default(null),
    email_do_encarregado: z.string().email().nullable().default(null),
    politica_de_privacidade: z.string().url().nullable().default(null),
    fuso: z.string().default("America/Sao_Paulo"),
    idioma: z.enum(["pt-BR", "es"]).default("pt-BR"),
  }),
  equipe: z
    .array(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        nome: z.string().min(2),
        papel: z.enum(PAPEIS),
        admin_da_plataforma: z.boolean().default(false),
      }),
    )
    .min(1),
  atendimento: z
    .object({
      fuso: z.string().default("America/Sao_Paulo"),
      janelas: z.array(janela).min(1),
      capacidade: z.number().int().min(1).max(100).default(10),
    })
    .default({
      fuso: "America/Sao_Paulo",
      janelas: [1, 2, 3, 4, 5].flatMap((dow) => [
        { dow, start: "09:00", end: "12:00" },
        { dow, start: "13:00", end: "18:00" },
      ]),
      capacidade: 10,
    }),
  ia: z
    .object({
      provedor: z.enum(["anthropic", "openai", "openrouter", "google"]),
      modelo: z.string().min(2),
      /** Teto mensal em dólares (o orçamento do produto é em centavos de USD). 0 = sem teto. */
      teto_mensal_usd: z.number().min(0).default(0),
      alerta_pct: z.number().int().min(50).max(99).default(80),
      agentes: z
        .array(
          z.object({
            nome: z.string().min(2),
            descricao: z.string().default(""),
            prompt: z.string().min(20),
          }),
        )
        .default([]),
      perguntas_frequentes: z
        .array(z.object({ pergunta: z.string().min(3), resposta: z.string().min(3) }))
        .default([]),
    })
    .nullable()
    .default(null),
});

export type ConfiguracaoAnima = z.infer<typeof configuracaoSchema>;

/** Domínios que só existem em exemplo: o arquivo de exemplo nunca vira gente de verdade. */
const DOMINIOS_DE_EXEMPLO = /@(.+\.)?(example\.(com|org|net)|exemplo\.com(\.br)?)$/i;

export function lerConfiguracao(texto: string): ConfiguracaoAnima {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (err) {
    throw new Error(`configuração não é JSON válido: ${err instanceof Error ? err.message : err}`);
  }
  const r = configuracaoSchema.safeParse(bruto);
  if (!r.success) {
    const linhas = r.error.issues.map((i) => `  - ${i.path.join(".") || "(raiz)"}: ${i.message}`);
    throw new Error(`configuração inválida:\n${linhas.join("\n")}`);
  }
  const cfg = r.data;
  const exemplo = cfg.equipe.filter((p) => DOMINIOS_DE_EXEMPLO.test(p.email)).map((p) => p.email);
  if (exemplo.length > 0) {
    throw new Error(
      `a equipe ainda tem e-mails do exemplo (${exemplo.join(", ")}): preencha o arquivo real`,
    );
  }
  const emails = cfg.equipe.map((p) => p.email.trim().toLowerCase());
  const repetido = emails.find((e, i) => emails.indexOf(e) !== i);
  if (repetido) throw new Error(`e-mail repetido na equipe: ${repetido}`);
  if (!cfg.equipe.some((p) => p.papel === "admin")) {
    throw new Error("a equipe precisa de ao menos um admin da organização");
  }
  cfg.equipe = cfg.equipe.map((p) => ({ ...p, email: p.email.trim().toLowerCase() }));
  return cfg;
}

export interface OrganizacaoExistente {
  id: string;
  slug: string;
}

export type EscolhaDaOrganizacao =
  | { tipo: "usar"; id: string }
  | { tipo: "adotar"; id: string; slugAntigo: string }
  | { tipo: "criar" }
  | { tipo: "ambigua"; slugs: string[] };

/**
 * Qual organização é a Ânima Hub.
 *
 * 1. A do slug configurado, se existe.
 * 2. Senão, a ÚNICA organização da instalação (tirando as de demonstração): é a que o
 *    `install.sh` criou no bootstrap do dono, com o slug do nome digitado lá. Adotar evita a
 *    segunda "Ânima Hub" ao lado da primeira.
 * 3. Nenhuma: cria. Mais de uma: para e pede o slug — escolher no chute seria escrever a equipe
 *    e a razão social na empresa de outra pessoa.
 */
export function escolherOrganizacao(
  existentes: OrganizacaoExistente[],
  slug: string,
  slugsDeDemonstracao: string[],
): EscolhaDaOrganizacao {
  const pelaChave = existentes.find((o) => o.slug === slug);
  if (pelaChave) return { tipo: "usar", id: pelaChave.id };
  const reais = existentes.filter((o) => !slugsDeDemonstracao.includes(o.slug));
  if (reais.length === 0) return { tipo: "criar" };
  if (reais.length === 1) return { tipo: "adotar", id: reais[0]!.id, slugAntigo: reais[0]!.slug };
  return { tipo: "ambigua", slugs: reais.map((o) => o.slug) };
}

/**
 * Senha provisória forte — a MESMA régua de `lib/auth/criar-pessoa-com-senha.ts`
 * (3 grupos de 4, alfabeto sem caracteres ambíguos, hífen como símbolo, ao menos um dígito).
 * Vale só até o primeiro acesso: o vínculo nasce com `senha_provisoria = true`.
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function gerarSenhaProvisoria(sortear: (n: number) => number = randomInt): string {
  for (;;) {
    const senha = Array.from({ length: 3 }, () =>
      Array.from({ length: 4 }, () => ALFABETO[sortear(ALFABETO.length)]).join(""),
    ).join("-");
    if (/[0-9]/.test(senha) && /[A-Za-z]/.test(senha)) return senha;
  }
}

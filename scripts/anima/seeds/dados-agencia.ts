/**
 * Fork Ânima — dados da organização de demonstração "Vértice Digital", uma agência de
 * marketing e tecnologia que vende serviços para pequenas e médias empresas.
 *
 * Tudo aqui é FICTÍCIO e determinístico: o mesmo `semente` gera sempre as mesmas pessoas,
 * empresas, negócios e conversas. E-mails usam `example.com` (domínio reservado, RFC 2606)
 * e telefones a faixa `+55 11 9 0000-xxxx`, para nada apontar para alguém real.
 *
 * Só dados e funções puras: quem grava é `demo-agencia.ts`.
 */

/** Gerador pseudoaleatório pequeno e reprodutível (mulberry32). */
export function sorteador(semente: number) {
  let s = semente >>> 0;
  const proximo = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    proximo,
    inteiro: (min: number, max: number): number => min + Math.floor(proximo() * (max - min + 1)),
    um: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)]!,
    chance: (p: number): boolean => proximo() < p,
  };
}
export type Sorteador = ReturnType<typeof sorteador>;

export const ORGANIZACAO = {
  slug: "demo-vertice",
  nome: "Vértice Digital (demonstração)",
} as const;

/** Domínio de todo e-mail fictício. */
export const DOMINIO = "example.com";

export type Papel = "admin" | "manager" | "agent" | "viewer";

/** A equipe da agência. Contas sem senha conhecida: existem para dar dono às coisas. */
export const EQUIPE: ReadonlyArray<{ chave: string; nome: string; papel: Papel }> = [
  { chave: "marina", nome: "Marina Couto", papel: "manager" },
  { chave: "rafael", nome: "Rafael Lima", papel: "agent" },
  { chave: "beatriz", nome: "Beatriz Nogueira", papel: "agent" },
  { chave: "diego", nome: "Diego Araújo", papel: "agent" },
  { chave: "lucia", nome: "Lúcia Prado", papel: "viewer" },
];
/** Quem atende e vende (recebe negócios, conversas, tarefas e reuniões). */
export const VENDEDORES = ["marina", "rafael", "beatriz", "diego"] as const;

export function emailDaEquipe(chave: string): string {
  return `${chave}.demo@vertice.${DOMINIO}`;
}

// ── Funis ────────────────────────────────────────────────────────────────────

export interface Etapa {
  slug: string;
  nome: string;
  horas: number | null;
  probabilidade: number | null;
  ganho?: boolean;
  perdido?: boolean;
}

export const FUNIS: ReadonlyArray<{
  slug: string;
  nome: string;
  descricao: string;
  padrao: boolean;
  etapas: Etapa[];
}> = [
  {
    slug: "comercial",
    nome: "Comercial",
    descricao: "Da primeira conversa ao contrato assinado.",
    padrao: true,
    etapas: [
      { slug: "novo", nome: "Novo contato", horas: 24, probabilidade: 10 },
      { slug: "diagnostico", nome: "Diagnóstico agendado", horas: 72, probabilidade: 25 },
      { slug: "proposta", nome: "Proposta enviada", horas: 120, probabilidade: 50 },
      { slug: "negociacao", nome: "Negociação", horas: 168, probabilidade: 70 },
      { slug: "fechado", nome: "Contrato assinado", horas: null, probabilidade: 100, ganho: true },
      { slug: "perdido", nome: "Perdido", horas: null, probabilidade: 0, perdido: true },
    ],
  },
  {
    slug: "renovacao",
    nome: "Renovação e upsell",
    descricao: "Clientes ativos: renovação de contrato e novos serviços.",
    padrao: false,
    etapas: [
      { slug: "mapeado", nome: "Oportunidade mapeada", horas: 168, probabilidade: 20 },
      { slug: "conversa", nome: "Em conversa", horas: 120, probabilidade: 45 },
      { slug: "aditivo", nome: "Aditivo enviado", horas: 96, probabilidade: 75 },
      { slug: "renovado", nome: "Renovado", horas: null, probabilidade: 100, ganho: true },
      { slug: "cancelado", nome: "Não renovou", horas: null, probabilidade: 0, perdido: true },
    ],
  },
];

export const VOCABULARIO = {
  lead: "Oportunidade",
  lead_plural: "Oportunidades",
  deal: "Contrato",
  deal_plural: "Contratos",
  won: "Assinado",
  lost: "Perdido",
  stage: "Etapa",
  stage_plural: "Etapas",
};

/** Serviços vendidos, com faixa de valor mensal em reais. */
export const SERVICOS: ReadonlyArray<{
  nome: string;
  tag: string;
  min: number;
  max: number;
  recorrente: boolean;
}> = [
  { nome: "Gestão de tráfego pago", tag: "trafego", min: 2500, max: 9000, recorrente: true },
  { nome: "SEO e conteúdo", tag: "seo", min: 1800, max: 6000, recorrente: true },
  { nome: "Site institucional", tag: "site", min: 8000, max: 28000, recorrente: false },
  { nome: "Loja virtual", tag: "ecommerce", min: 15000, max: 45000, recorrente: false },
  {
    nome: "Branding e identidade visual",
    tag: "branding",
    min: 6000,
    max: 22000,
    recorrente: false,
  },
  { nome: "Social media", tag: "social", min: 1500, max: 5000, recorrente: true },
  { nome: "Implantação de CRM e automação", tag: "crm", min: 7000, max: 20000, recorrente: false },
];

export const MOTIVOS_DE_PERDA = [
  "Preço acima do orçamento",
  "Fechou com outra agência",
  "Projeto adiado para o próximo semestre",
  "Sem resposta depois da proposta",
  "Decidiu fazer internamente",
];

// ── Pessoas e empresas ───────────────────────────────────────────────────────

const PRIMEIROS = [
  "Ana",
  "Bruno",
  "Camila",
  "Daniel",
  "Eduarda",
  "Felipe",
  "Gabriela",
  "Henrique",
  "Isabela",
  "João",
  "Karina",
  "Leonardo",
  "Mariana",
  "Nicolas",
  "Olívia",
  "Paulo",
  "Renata",
  "Samuel",
  "Tatiane",
  "Vinícius",
  "Yasmin",
  "André",
  "Bianca",
  "Caio",
  "Débora",
  "Fábio",
  "Helena",
  "Igor",
  "Juliana",
  "Lucas",
  "Patrícia",
  "Ricardo",
  "Sofia",
  "Thiago",
  "Vanessa",
];
const SOBRENOMES = [
  "Almeida",
  "Barbosa",
  "Cardoso",
  "Duarte",
  "Esteves",
  "Ferraz",
  "Gomes",
  "Hartmann",
  "Ito",
  "Junqueira",
  "Lacerda",
  "Machado",
  "Nascimento",
  "Oliveira",
  "Pacheco",
  "Queiroz",
  "Rezende",
  "Siqueira",
  "Teixeira",
  "Vasconcelos",
  "Xavier",
  "Zanetti",
  "Monteiro",
  "Ribeiro",
  "Moraes",
];
const EMPRESAS = [
  "Padaria Trigo Bom",
  "Clínica Sorriso Pleno",
  "Ótica Visão Clara",
  "Pet Shop Bicho Feliz",
  "Academia Movimento",
  "Imobiliária Casa Certa",
  "Escola de Idiomas Fluente",
  "Restaurante Sabor da Serra",
  "Construtora Alicerce",
  "Studio de Pilates Equilíbrio",
  "Contabilidade Exata",
  "Loja Moda Urbana",
  "Cervejaria Lúpulo Norte",
  "Advocacia Prado & Reis",
  "Floricultura Jardim Secreto",
  "Auto Center Rota",
  "Hotel Pousada do Vale",
  "Laboratório BioVida",
  "Café Grão Nobre",
  "Marcenaria Arte em Madeira",
  "Barbearia Navalha",
  "Distribuidora Bom Preço",
  "Consultório Dra. Helena",
  "Coworking Ponto de Encontro",
  "Agência de Viagens Rumo Certo",
  "Eletrônica Circuito",
  "Doceria Açúcar Mascavo",
  "Gráfica Impressão Fina",
  "Instituto de Beleza Aura",
  "Escritório Planejar Engenharia",
  "Fazenda Orgânica Raiz",
  "Livraria Página Virada",
  "Hamburgueria Brasa",
  "Clínica Veterinária Patas",
  "Corretora Segura Mais",
  "Escola Infantil Primeiros Passos",
  "Loja de Móveis Lar Doce Lar",
  "Estúdio Fotográfico Luz",
  "Supermercado Vizinho",
  "Tech Soluções em TI",
];
const CIDADES = [
  "São Paulo",
  "Campinas",
  "Santos",
  "Sorocaba",
  "Ribeirão Preto",
  "São José dos Campos",
];
const ORIGENS = ["indicacao", "instagram", "google", "evento", "site"];

export interface Pessoa {
  nome: string;
  empresa: string;
  cidade: string;
  telefone: string;
  email: string;
  origem: string;
  tags: string[];
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function pessoas(r: Sorteador, quantas: number): Pessoa[] {
  const saida: Pessoa[] = [];
  const usados = new Set<string>();
  for (let i = 0; saida.length < quantas; i++) {
    const nome = `${r.um(PRIMEIROS)} ${r.um(SOBRENOMES)}`;
    if (usados.has(nome)) continue;
    usados.add(nome);
    const empresa = EMPRESAS[saida.length % EMPRESAS.length]!;
    const usuario = semAcento(nome)
      .toLowerCase()
      .replace(/[^a-z]+/g, ".");
    const origem = r.um(ORIGENS);
    saida.push({
      nome,
      empresa,
      cidade: r.um(CIDADES),
      telefone: `+5511900${String(1000 + saida.length).padStart(4, "0")}`,
      email: `${usuario}@cliente.${DOMINIO}`,
      origem,
      tags: [origem, ...(r.chance(0.25) ? ["decisor"] : [])],
    });
  }
  return saida;
}

// ── Conversas ────────────────────────────────────────────────────────────────

export interface Fala {
  quem: "cliente" | "equipe";
  texto: string;
}

/** Roteiros de conversa por momento do funil. `{nome}`, `{empresa}`, `{servico}` são trocados. */
export const ROTEIROS: Record<string, Fala[][]> = {
  novo: [
    [
      { quem: "cliente", texto: "Oi! Vi o anúncio de vocês no Instagram. Vocês fazem {servico}?" },
      {
        quem: "equipe",
        texto: "Olá, {nome}! Fazemos sim. Pode me contar um pouco sobre a {empresa}?",
      },
      {
        quem: "cliente",
        texto: "Somos uma empresa pequena, queremos atrair mais clientes pela internet.",
      },
      { quem: "equipe", texto: "Perfeito. Qual é hoje o principal canal de vendas de vocês?" },
      { quem: "cliente", texto: "Indicação, basicamente. Quase nada vem do digital." },
    ],
    [
      { quem: "cliente", texto: "Boa tarde, queria um orçamento de {servico}." },
      {
        quem: "equipe",
        texto:
          "Boa tarde, {nome}! Claro. Para montar algo certo, posso te fazer três perguntas rápidas?",
      },
      { quem: "cliente", texto: "Pode sim." },
    ],
  ],
  diagnostico: [
    [
      {
        quem: "equipe",
        texto:
          "{nome}, como combinamos: a reunião de diagnóstico ficou para quinta às 10h, por vídeo.",
      },
      { quem: "cliente", texto: "Ótimo, já coloquei na agenda." },
      {
        quem: "equipe",
        texto: "Se puder, traga os números de vendas dos últimos 3 meses. Ajuda muito.",
      },
      { quem: "cliente", texto: "Combinado, vou pedir para o financeiro." },
      { quem: "cliente", texto: "Posso levar meu sócio também?" },
      { quem: "equipe", texto: "Claro, quanto mais gente da decisão, melhor." },
    ],
  ],
  proposta: [
    [
      {
        quem: "equipe",
        texto: "{nome}, enviei a proposta de {servico} para o seu e-mail. Dá uma olhada com calma.",
      },
      { quem: "cliente", texto: "Recebi, obrigado! Vou ver com a equipe e te retorno até sexta." },
      { quem: "equipe", texto: "Fico à disposição para qualquer dúvida." },
      { quem: "cliente", texto: "Uma dúvida: o valor inclui o investimento em anúncios?" },
      {
        quem: "equipe",
        texto:
          "Não, a verba de mídia é à parte e vai direto para a plataforma. Nosso valor é a gestão.",
      },
    ],
  ],
  negociacao: [
    [
      {
        quem: "cliente",
        texto: "Gostamos muito da proposta, mas o valor ficou um pouco acima do que planejamos.",
      },
      {
        quem: "equipe",
        texto:
          "Entendo, {nome}. Podemos começar com um escopo menor e ampliar depois dos primeiros resultados.",
      },
      { quem: "cliente", texto: "Isso faria sentido. Consegue me mandar essa versão?" },
      {
        quem: "equipe",
        texto: "Mando ainda hoje. Se fecharmos esta semana, consigo iniciar na segunda.",
      },
      { quem: "cliente", texto: "Fechado, fico no aguardo." },
    ],
  ],
  fechado: [
    [
      { quem: "cliente", texto: "Contrato assinado! Qual é o próximo passo?" },
      {
        quem: "equipe",
        texto:
          "Que ótimo, {nome}! Vou agendar o kickoff e te mandar a lista de acessos que precisamos.",
      },
      { quem: "cliente", texto: "Perfeito, obrigado pela atenção de sempre." },
    ],
  ],
  perdido: [
    [
      { quem: "equipe", texto: "Oi, {nome}, tudo bem? Conseguiu avaliar a proposta?" },
      {
        quem: "cliente",
        texto: "Oi! Por enquanto vamos segurar, o orçamento deste semestre apertou.",
      },
      { quem: "equipe", texto: "Sem problemas. Posso te procurar daqui a uns meses?" },
      { quem: "cliente", texto: "Pode sim, obrigado." },
    ],
  ],
  suporte: [
    [
      { quem: "cliente", texto: "Bom dia! O relatório do mês já saiu?" },
      {
        quem: "equipe",
        texto: "Bom dia, {nome}! Sai amanhã. Adianto que o custo por contato caiu 18%.",
      },
      { quem: "cliente", texto: "Que notícia boa! Obrigado." },
    ],
    [
      { quem: "cliente", texto: "O formulário do site parou de mandar e-mail, conseguem olhar?" },
      { quem: "equipe", texto: "Vou verificar agora e te retorno em seguida." },
    ],
  ],
};

export function preencher(
  texto: string,
  p: { nome: string; empresa: string; servico: string },
): string {
  return texto
    .replaceAll("{nome}", p.nome.split(" ")[0]!)
    .replaceAll("{empresa}", p.empresa)
    .replaceAll("{servico}", p.servico.toLowerCase());
}

// ── Notas, tarefas e agenda ──────────────────────────────────────────────────

export const NOTAS = [
  "Cliente quer resultado rápido: alinhar expectativa dos primeiros 90 dias.",
  "Já trabalhou com outra agência e não gostou da falta de relatório.",
  "Decisão é do sócio; marcar a próxima conversa com os dois.",
  "Tem verba aprovada para o segundo semestre.",
  "Pediu cases do mesmo segmento.",
  "Sensível a preço: apresentar o plano de entrada primeiro.",
  "Concorrente direto investe forte em anúncios no Google.",
];

export const TAREFAS = [
  "Enviar proposta revisada",
  "Ligar para confirmar a reunião",
  "Preparar o diagnóstico de presença digital",
  "Mandar cases do segmento",
  "Cobrar retorno da proposta",
  "Agendar kickoff do projeto",
  "Solicitar acessos (Google Ads, Meta, site)",
  "Revisar contrato com o jurídico",
  "Montar relatório mensal",
  "Atualizar valor do negócio no CRM",
];

export const TIPOS_DE_REUNIAO: ReadonlyArray<{
  slug: string;
  nome: string;
  minutos: number;
  categoria: string;
}> = [
  { slug: "diagnostico", nome: "Reunião de diagnóstico", minutos: 45, categoria: "reuniao" },
  { slug: "proposta", nome: "Apresentação de proposta", minutos: 60, categoria: "reuniao" },
  { slug: "kickoff", nome: "Kickoff de projeto", minutos: 60, categoria: "reuniao" },
  { slug: "resultados", nome: "Reunião de resultados", minutos: 30, categoria: "call" },
];

// ── IA ───────────────────────────────────────────────────────────────────────

export const AGENTES: ReadonlyArray<{ nome: string; descricao: string; prompt: string }> = [
  {
    nome: "Lia — pré-vendas",
    descricao: "Atende quem chega pelo WhatsApp, qualifica e agenda o diagnóstico.",
    prompt:
      "Você é a Lia, da Vértice Digital, uma agência de marketing e tecnologia. Atenda com " +
      "simpatia e objetividade. Descubra o segmento da empresa, o principal desafio e o " +
      "orçamento aproximado. Quando o cliente tiver interesse, ofereça uma reunião de " +
      "diagnóstico gratuita de 45 minutos. Nunca informe preço fechado: diga que depende do " +
      "escopo e que a proposta sai depois do diagnóstico. Se pedirem para falar com uma " +
      "pessoa, transfira.",
  },
  {
    nome: "Sol — atendimento a clientes",
    descricao: "Tira dúvidas de clientes ativos sobre relatórios, prazos e acessos.",
    prompt:
      "Você é o Sol, do atendimento da Vértice Digital. Responda clientes ativos sobre " +
      "relatórios, prazos e acessos usando a base de conhecimento. Se a dúvida for técnica " +
      "ou envolver cobrança, transfira para a equipe.",
  },
];

export const PERGUNTAS_FREQUENTES: ReadonlyArray<{ pergunta: string; resposta: string }> = [
  {
    pergunta: "Quanto tempo leva para ver resultado com tráfego pago?",
    resposta:
      "Os primeiros sinais aparecem em 2 a 4 semanas; a otimização consistente leva cerca de 90 dias.",
  },
  {
    pergunta: "A verba de anúncios está incluída?",
    resposta:
      "Não. A verba de mídia é paga direto à plataforma (Google, Meta). Nosso valor é a gestão.",
  },
  {
    pergunta: "Tem fidelidade?",
    resposta:
      "Os serviços mensais têm contrato mínimo de 3 meses; depois, aviso prévio de 30 dias.",
  },
  {
    pergunta: "Quando sai o relatório mensal?",
    resposta: "Até o 5º dia útil de cada mês, por e-mail e na reunião de resultados.",
  },
  {
    pergunta: "Vocês fazem o site do zero?",
    resposta: "Sim: briefing, layout, desenvolvimento e publicação, em 4 a 8 semanas.",
  },
  {
    pergunta: "Quais formas de pagamento?",
    resposta: "Boleto ou Pix mensal. Projetos fechados podem ser parcelados em até 3 vezes.",
  },
  {
    pergunta: "Atendem fora de São Paulo?",
    resposta: "Sim, atendemos todo o Brasil de forma remota.",
  },
  { pergunta: "Qual o horário de atendimento?", resposta: "Segunda a sexta, das 9h às 18h." },
];

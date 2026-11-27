import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { escolherOrganizacao, gerarSenhaProvisoria, lerConfiguracao } from "./configuracao-anima";

const EXEMPLO = readFileSync(join(__dirname, "anima.seed.example.json"), "utf8");

interface Bruto {
  equipe: Array<{ email: string; papel: string }>;
  atendimento?: unknown;
  ia?: unknown;
}

function real(mudar: (c: Bruto) => void = () => {}): string {
  const c = JSON.parse(EXEMPLO) as Bruto;
  c.equipe = c.equipe.map((p, i) => ({
    ...p,
    email: `p${i}@empresa.com.br`,
  }));
  mudar(c);
  return JSON.stringify(c);
}

describe("configuração da Ânima Hub", () => {
  it("recusa o arquivo de exemplo como está (e-mails de exemplo nunca viram contas)", () => {
    expect(() => lerConfiguracao(EXEMPLO)).toThrow(/e-mails do exemplo/);
  });

  it("aceita o exemplo preenchido e normaliza o e-mail", () => {
    const cfg = lerConfiguracao(real((c) => (c.equipe[0]!.email = "  Fulano@Empresa.com.BR ")));
    expect(cfg.equipe[0]!.email).toBe("fulano@empresa.com.br");
    expect(cfg.ia?.teto_mensal_usd).toBe(50);
  });

  it("recusa e-mail repetido, equipe sem admin e papel desconhecido", () => {
    expect(() => lerConfiguracao(real((c) => (c.equipe[1]!.email = c.equipe[0]!.email)))).toThrow(
      /repetido/,
    );
    expect(() =>
      lerConfiguracao(real((c) => c.equipe.forEach((p) => (p.papel = "agent")))),
    ).toThrow(/ao menos um admin/);
    expect(() => lerConfiguracao(real((c) => (c.equipe[0]!.papel = "dono")))).toThrow(
      /equipe\.0\.papel/,
    );
  });

  it("jornada e IA são opcionais", () => {
    const cfg = lerConfiguracao(
      real((c) => {
        delete c.atendimento;
        delete c.ia;
      }),
    );
    expect(cfg.atendimento.janelas.length).toBeGreaterThan(0);
    expect(cfg.ia).toBeNull();
  });
});

describe("qual organização é a Ânima Hub", () => {
  const demo = ["demo-vertice"];
  it("usa a do slug", () => {
    expect(
      escolherOrganizacao(
        [
          { id: "a", slug: "anima-hub" },
          { id: "b", slug: "x" },
        ],
        "anima-hub",
        demo,
      ),
    ).toEqual({
      tipo: "usar",
      id: "a",
    });
  });
  it("adota a única organização do install, ignorando a demonstração", () => {
    expect(
      escolherOrganizacao(
        [
          { id: "a", slug: "minha-empresa" },
          { id: "d", slug: "demo-vertice" },
        ],
        "anima-hub",
        demo,
      ),
    ).toEqual({ tipo: "adotar", id: "a", slugAntigo: "minha-empresa" });
  });
  it("cria quando não há nenhuma (só a demo)", () => {
    expect(escolherOrganizacao([{ id: "d", slug: "demo-vertice" }], "anima-hub", demo)).toEqual({
      tipo: "criar",
    });
  });
  it("para quando há mais de uma e nenhuma com o slug", () => {
    expect(
      escolherOrganizacao(
        [
          { id: "a", slug: "um" },
          { id: "b", slug: "dois" },
        ],
        "anima-hub",
        demo,
      ).tipo,
    ).toBe("ambigua");
  });
});

describe("senha provisória", () => {
  it("segue a régua forte do app: 3 grupos de 4, letra, dígito e hífen", () => {
    for (let i = 0; i < 200; i++) {
      const s = gerarSenhaProvisoria();
      expect(s).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
      expect(s).toMatch(/[0-9]/);
      expect(s).toMatch(/[A-Za-z]/);
    }
  });
});

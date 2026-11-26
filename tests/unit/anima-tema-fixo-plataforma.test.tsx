import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fork Ânima — o TEMA FIXO também trava o tema da plataforma (#3790 do upstream).
 *
 * Com `TEMA_FIXO` (lib/anima/tema-fixo.ts, o módulo REAL, sem o `tema-livre`):
 *  1. `/admin/marca` não mostra o seletor "Tema da plataforma", mesmo com tema instalado;
 *  2. o layout raiz não emite o `<style id="tema-da-plataforma">`, então um tema escolhido antes
 *     da trava deixa de pintar a tela.
 *
 * O teste do upstream (`marca-tema-da-plataforma.test.tsx`) mede o cartão com o tema livre.
 */

const mocks = vi.hoisted(() => ({
  loadAuthUser: vi.fn(),
  temasInstaladosDaPlataforma: vi.fn(),
  idDoTemaDaPlataforma: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: mocks.loadAuthUser }));
vi.mock("@/lib/branding/instalacao", () => ({
  marcaDaInstalacao: async () => null,
  registrarEstadoDaMarca: vi.fn(),
  motivoDoFallback: () => [],
}));
vi.mock("@/lib/branding/css-personalizado", () => ({
  cssPersonalizadoDaInstalacao: async () => "",
  cssPersonalizadoEscuroDaInstalacao: async () => "",
  validarCssPersonalizado: () => ({ css: null, erro: null, regras: 0, declaracoes: 0 }),
}));
vi.mock("@/lib/extensions/tema-da-plataforma", () => ({
  temasInstaladosDaPlataforma: mocks.temasInstaladosDaPlataforma,
  idDoTemaDaPlataforma: mocks.idDoTemaDaPlataforma,
}));
vi.mock("@/app/admin/(protected)/marca/_form", () => ({
  FormularioDaMarca: () => <form data-testid="formulario-da-marca" />,
}));
vi.mock("@/app/admin/(protected)/marca/_css-personalizado", () => ({
  CssPersonalizado: () => <form data-testid="css-personalizado" />,
}));

import { TEMA_FIXO } from "@/lib/anima/tema-fixo";
import Page from "@/app/admin/(protected)/marca/page";

describe("tema fixo trava o tema da plataforma", () => {
  beforeEach(() => {
    mocks.loadAuthUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      is_platform_admin: true,
      locale: "pt-BR",
      support: null,
    });
    mocks.idDoTemaDaPlataforma.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mocks.temasInstaladosDaPlataforma.mockResolvedValue([
      {
        instalacaoId: "11111111-1111-4111-8111-111111111111",
        rotulo: "acme/tema-do-cliente",
        versao: "1.2.0",
        tema: { palette: "mist", claro: {}, escuro: {} },
      },
    ]);
  });

  it("o fork está com o tema fixo ligado", () => {
    expect(TEMA_FIXO).toBe(true);
  });

  it("/admin/marca não mostra o seletor, mesmo com tema instalado e escolhido", async () => {
    const html = renderToStaticMarkup(await Page());
    // Controle positivo: a tela renderizou (os vizinhos estão lá).
    expect(html).toContain('data-testid="formulario-da-marca"');
    expect(html).toContain('data-testid="css-personalizado"');
    expect(html).not.toContain("Tema da plataforma");
    expect(html).not.toContain("acme/tema-do-cliente");
  });

  it("o layout raiz só emite o estilo do tema da plataforma sem o tema fixo", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toContain("{TEMA_FIXO ? null : <EstiloDoTemaDaPlataforma />}");
    // Nenhum outro ponto do layout emite o componente sem a trava.
    expect(layout.match(/<EstiloDoTemaDaPlataforma \/>/g)).toHaveLength(1);
  });
});

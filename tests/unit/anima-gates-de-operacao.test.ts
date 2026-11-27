import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Fork Ânima — PR só de operação do servidor ou de seeds não paga o e2e nem a imagem.
 *
 * `Makefile`, `docker-compose.anima.yml`, `.env.anima.example`, `.anima-upstream` e
 * `scripts/anima/**` não mudam o produto: ficam fora do contexto da imagem (`.dockerignore`)
 * e nenhuma spec os lê. Os dois scripts de alcance do upstream respondem `nao` para eles, e
 * o portão da imagem Ânima (`anima-imagem.yml`) usa o mesmo script para pular o build.
 *
 * O outro lado também é medido: misturar um arquivo do produto no PR volta a rodar tudo.
 */

const DO_FORK = [
  "Makefile",
  "docker-compose.anima.yml",
  ".env.anima.example",
  ".anima-upstream",
  "scripts/anima/servidor.sh",
  "scripts/anima/seeds/demo.ts",
];

function responde(script: string, caminhos: string[]): string {
  return execFileSync("bash", [script], {
    input: caminhos.join("\n") + "\n",
    encoding: "utf-8",
  }).trim();
}

describe("gates de CI com os arquivos de operação do fork", () => {
  for (const script of ["scripts/pr-alcanca-o-e2e.sh", "scripts/pr-mexe-na-imagem.sh"]) {
    it(`${script}: só arquivos do fork → pula`, () => {
      expect(responde(script, DO_FORK)).toBe("nao");
    });

    it(`${script}: um arquivo do produto junto → roda`, () => {
      expect(responde(script, [...DO_FORK, "app/page.tsx"])).toBe("sim");
      // `scripts/` fora de `scripts/anima/` continua alcançando.
      expect(responde(script, ["scripts/seed-e2e-credentials.ts"])).toBe("sim");
    });
  }

  it("o .dockerignore tira do contexto o que o script da imagem pula", () => {
    const ignorados = readFileSync(".dockerignore", "utf-8")
      .split("\n")
      .map((l) => l.trim());
    for (const e of ["scripts/anima", "Makefile", "docker-compose.anima.yml", ".anima-upstream"]) {
      expect(ignorados).toContain(e);
    }
  });

  it("o portão da imagem Ânima pula o build pela mesma régua", () => {
    const wf = readFileSync(".github/workflows/anima-imagem.yml", "utf-8");
    expect(wf).toContain("bash scripts/pr-mexe-na-imagem.sh");
    expect(wf).toContain("pull-requests: read");
    // Os dois passos do build dependem da resposta; o checkout e a medição, não.
    expect(wf.match(/if: steps\.alcance\.outputs\.imagem == 'sim'/g)).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";

import { DOMINIO, pessoas, ROTEIROS, sorteador } from "./dados-agencia";
import { destinoDaDemoEhLocal, planejarOportunidades, senhaFacil } from "./demo-agencia";

/**
 * Fork Ânima — o seed de demonstração (`make seeds-demo`).
 *
 * Mede o que não precisa de banco: a recusa de destino remoto, o determinismo dos dados
 * e as regras do schema que os dados precisam respeitar (as CHECK de `contacts` e
 * `crm_leads`). A gravação em si foi provada contra o Supabase local.
 */

describe("destino do seed de demonstração", () => {
  it.each([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://[::1]:54321",
    "http://192.168.57.120:54321",
    "http://10.0.0.5:8000",
    "http://172.20.0.3:8000",
    "http://host.docker.internal:54321",
    // O gateway interno do servidor: só resolve de dentro da rede Docker do Supabase.
    "http://supabase-envoy:8000",
  ])("aceita %s", (url) => {
    expect(destinoDaDemoEhLocal(url)).toBe(true);
  });

  it.each([
    "https://app.animahub.ai",
    "https://abcd.supabase.co",
    "http://172.32.0.1:8000",
    "http://8.8.8.8",
    "http://127.0.0.1.nip.io",
    "http://supabase-envoy.example.com:8000",
    "http://192.168.0.300",
    "não é url",
  ])("recusa %s", (url) => {
    expect(destinoDaDemoEhLocal(url)).toBe(false);
  });
});

describe("dados da agência", () => {
  const gente = pessoas(sorteador(2026), 120);

  it("são determinísticos", () => {
    expect(pessoas(sorteador(2026), 120)).toEqual(gente);
  });

  it("respeitam as CHECK de contacts e não apontam para ninguém real", () => {
    expect(new Set(gente.map((p) => p.nome)).size).toBe(gente.length);
    expect(new Set(gente.map((p) => p.telefone)).size).toBe(gente.length);
    for (const p of gente) {
      expect(p.telefone).toMatch(/^\+\d{8,15}$/);
      expect(p.telefone.startsWith("+5511900")).toBe(true);
      expect(p.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      expect(p.email.endsWith(`.${DOMINIO}`)).toBe(true);
    }
  });

  it("o plano respeita as CHECK de crm_leads", () => {
    const plano = planejarOportunidades(sorteador(42), gente.length);
    expect(plano.length).toBeGreaterThan(100);
    for (const o of plano) {
      expect(Number.isInteger(o.valorCents)).toBe(true);
      expect(o.valorCents).toBeGreaterThan(0);
      // Perdido exige motivo; aberto não tem.
      if (o.status === "lost") expect(o.motivo).toBeTruthy();
      else expect(o.motivo).toBeNull();
    }
    expect(new Set(plano.map((o) => o.status))).toEqual(new Set(["open", "won", "lost"]));
  });

  it("todo momento do funil tem roteiro de conversa", () => {
    for (const m of [
      "novo",
      "diagnostico",
      "proposta",
      "negociacao",
      "fechado",
      "perdido",
      "suporte",
    ]) {
      expect(ROTEIROS[m]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("senha do demonstrador", () => {
  it("é fácil de digitar: minúsculas, hífens e dois dígitos, com o mínimo do Supabase Auth", () => {
    const r = sorteador(7);
    for (let i = 0; i < 200; i++) {
      const senha = senhaFacil(r.proximo);
      expect(senha).toMatch(/^[a-z]{3,4}-[a-z]{3,4}-[1-9][0-9]$/);
      expect(senha.length).toBeGreaterThanOrEqual(6);
    }
  });
});

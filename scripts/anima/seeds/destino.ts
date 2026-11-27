/**
 * Para onde um seed do fork pode escrever: o Supabase local, ou o gateway INTERNO do servidor.
 *
 * `supabase-envoy` é o apelido do kit (hostgator-setup-kit/supabase-single-server.override.yml)
 * e só resolve de dentro da rede Docker do Supabase no servidor: é por ele que o
 * `make seeds-*` da VPS escreve. Uma URL pública (https://app.exemplo.com, Supabase Cloud) é
 * recusada — da máquina de desenvolvimento, um seed nunca alcança produção. Loopback e IPv4
 * privado (RFC 1918) só LITERAIS: nenhum outro nome de DNS passa, pode resolver para qualquer lugar.
 */
export function destinoDoSeedEhLocal(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "[::1]" || host === "host.docker.internal") return true;
  if (host === "supabase-envoy") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([m[1], m[2], m[3], m[4]].some((o) => Number(o) > 255)) return false;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

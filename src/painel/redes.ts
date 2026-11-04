// Painel › Redes com efeito, como o NetworkManager + IPBasedAccessValidationMiddleware do Jellyfin 10.11.10:
// - quem é "local": Redes LAN (LocalNetworkSubnets) ou, se vazio, as faixas privadas (inclui 100.64.0.0/10, a faixa
//   do Tailscale, para não trancar o acesso do PugotiLab);
// - "Permitir conexões remotas" desligado recusa quem não é local;
// - o filtro de IP remoto (lista branca ou negra) vale só para quem não é local;
// - X-Forwarded-For só é considerado quando a conexão vem de um Proxy conhecido (KnownProxies);
// - o próprio servidor (loopback) sempre passa, para dar para consertar de dentro do container.
import net from "node:net";

export interface ConfigRede {
  LocalNetworkSubnets?: unknown; KnownProxies?: unknown; EnableRemoteAccess?: unknown; RemoteIPFilter?: unknown; IsRemoteIPFilterBlacklist?: unknown;
}
export interface DecisaoRede { permitido: boolean; ip: string; local: boolean; motivo: string }

const PRIVADAS = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "169.254.0.0/16", "fc00::/7", "fe80::/10"];
const lista = (v: unknown) => (Array.isArray(v) ? v : []).map(x => String(x).trim()).filter(Boolean);

export function normalizarIp(ip: string): string {
  const limpo = ip.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(limpo);
  return mapeado ? mapeado[1] : limpo;
}
const familia = (ip: string): "ipv4" | "ipv6" | null => net.isIPv4(ip) ? "ipv4" : net.isIPv6(ip) ? "ipv6" : null;

function montarLista(entradas: string[]): net.BlockList {
  const b = new net.BlockList();
  for (const e of entradas) {
    const [ip, mascara] = e.split("/");
    const f = familia(normalizarIp(ip));
    if (!f) continue;
    if (mascara === undefined) b.addAddress(normalizarIp(ip), f);
    else b.addSubnet(normalizarIp(ip), Number(mascara), f);
  }
  return b;
}
const contem = (b: net.BlockList, ip: string) => { const f = familia(ip); return f ? b.check(ip, f) : false; };
const ehLoopback = (ip: string) => ip === "::1" || /^127\./.test(ip);

/** Monta o filtro a partir da configuração salva da página Redes. */
export function filtroDeRede(cfg: ConfigRede) {
  const subredes = lista(cfg.LocalNetworkSubnets);
  const locais = montarLista(subredes.length ? subredes : PRIVADAS);
  const proxies = montarLista(lista(cfg.KnownProxies));
  const filtro = lista(cfg.RemoteIPFilter);
  const blocos = montarLista(filtro);
  const listaNegra = String(cfg.IsRemoteIPFilterBlacklist) === "true";
  const remotoPermitido = cfg.EnableRemoteAccess !== false;
  return (enderecoSocket: string, encaminhado?: string | string[]): DecisaoRede => {
    let ip = normalizarIp(enderecoSocket || "");
    // Proxy conhecido: o cliente real é o primeiro endereço, da direita para a esquerda, que não é proxy.
    if (encaminhado && contem(proxies, ip)) {
      const cadeia = (Array.isArray(encaminhado) ? encaminhado.join(",") : encaminhado).split(",").map(normalizarIp).filter(x => familia(x));
      for (let i = cadeia.length - 1; i >= 0; i--) { ip = cadeia[i]; if (!contem(proxies, ip)) break; }
    }
    if (ehLoopback(ip)) return { permitido: true, ip, local: true, motivo: "o próprio servidor" };
    const local = contem(locais, ip);
    if (local) return { permitido: true, ip, local, motivo: "rede local" };
    if (!remotoPermitido) return { permitido: false, ip, local, motivo: "conexões remotas desativadas" };
    if (filtro.length) {
      const naLista = contem(blocos, ip);
      if (listaNegra && naLista) return { permitido: false, ip, local, motivo: "na lista negra do filtro de IP remoto" };
      if (!listaNegra && !naLista) return { permitido: false, ip, local, motivo: "fora da lista branca do filtro de IP remoto" };
    }
    return { permitido: true, ip, local, motivo: "remoto permitido" };
  };
}

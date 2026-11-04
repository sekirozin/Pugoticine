// PQA-241: Painel › Redes com efeito, como o IPBasedAccessValidationMiddleware do Jellyfin: rede local (padrão:
// faixas privadas e Tailscale), conexões remotas desligadas, filtro de IP remoto em lista branca e negra,
// X-Forwarded-For só de proxy conhecido e loopback sempre permitido.
import assert from "node:assert/strict";
import test from "node:test";
import { filtroDeRede, normalizarIp } from "./redes.js";

test("PQA-241: padrão deixa tudo entrar; redes privadas e Tailscale são locais", () => {
  const f = filtroDeRede({});
  for (const ip of ["192.168.1.6", "10.1.2.3", "172.18.0.2", "100.101.102.103", "::ffff:192.168.0.9", "fe80::1"]) assert.deepEqual([f(ip).permitido, f(ip).local], [true, true], ip);
  assert.deepEqual([f("8.8.8.8").permitido, f("8.8.8.8").local], [true, false]);
  assert.equal(normalizarIp("::ffff:10.0.0.1"), "10.0.0.1");
});

test("PQA-241: conexões remotas desligadas recusam só quem é de fora", () => {
  const f = filtroDeRede({ EnableRemoteAccess: false });
  assert.equal(f("8.8.8.8").permitido, false);
  assert.equal(f("8.8.8.8").motivo, "conexões remotas desativadas");
  assert.equal(f("192.168.1.6").permitido, true);
  assert.equal(f("127.0.0.1").permitido, true, "o próprio servidor sempre passa");
  assert.equal(f("::1").permitido, true);
  const lan = filtroDeRede({ EnableRemoteAccess: false, LocalNetworkSubnets: ["192.168.1.0/24"] });
  assert.equal(lan("192.168.1.6").permitido, true);
  assert.equal(lan("192.168.2.6").permitido, false, "Redes LAN substitui as faixas padrão");
  assert.equal(lan("100.64.1.1").permitido, false);
});

test("PQA-241: filtro de IP remoto em lista branca e lista negra", () => {
  const branca = filtroDeRede({ RemoteIPFilter: ["203.0.113.0/24", "198.51.100.7"], IsRemoteIPFilterBlacklist: "false" });
  assert.equal(branca("203.0.113.50").permitido, true);
  assert.equal(branca("198.51.100.7").permitido, true);
  assert.equal(branca("198.51.100.8").permitido, false);
  assert.equal(branca("192.168.1.6").permitido, true, "o filtro não vale para a rede local");
  const negra = filtroDeRede({ RemoteIPFilter: ["203.0.113.0/24"], IsRemoteIPFilterBlacklist: "true" });
  assert.equal(negra("203.0.113.50").permitido, false);
  assert.equal(negra("8.8.8.8").permitido, true);
  assert.equal(negra("2001:db8::1").permitido, true);
  assert.equal(filtroDeRede({ RemoteIPFilter: ["2001:db8::/32"], IsRemoteIPFilterBlacklist: "true" })("2001:db8::1").permitido, false, "IPv6");
});

test("PQA-241: X-Forwarded-For só vale vindo de proxy conhecido", () => {
  const sem = filtroDeRede({ EnableRemoteAccess: false });
  assert.equal(sem("172.18.0.5", "8.8.8.8").ip, "172.18.0.5", "cabeçalho de quem não é proxy é ignorado");
  const com = filtroDeRede({ EnableRemoteAccess: false, KnownProxies: ["172.18.0.5", "10.0.0.0/8"] });
  const d = com("172.18.0.5", "8.8.8.8, 10.1.1.1");
  assert.deepEqual([d.ip, d.permitido], ["8.8.8.8", false], "pula os proxies da direita para a esquerda");
  assert.equal(com("172.18.0.5", "192.168.1.6").permitido, true);
  assert.equal(com("172.18.0.5", "127.0.0.1").permitido, true);
  assert.equal(com("172.18.0.5", ["lixo"]).ip, "172.18.0.5", "cabeçalho inválido não troca o IP");
});

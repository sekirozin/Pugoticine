// PQA-232: Painel completo (menu do Jellyfin 10.11.10): telas e padrões dos modelos do servidor, validação, salvar
// e reler, usuários/dispositivos/bloqueio, atividade, chaves da API (só o hash), backup em .tar válido e registros.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { BancoPainel, descreverNavegador } from "./banco.js";
import { Backups, montarTar } from "./backups.js";
import { PAGINAS, camposDe, padroes, pagina, validar } from "./configuracao.js";
import { Registros } from "./registros.js";

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "painel-"));
test.after(() => fs.rmSync(pasta, { recursive: true, force: true }));

test("PQA-232: menu igual ao do Painel do Jellyfin (grupos, itens, subpáginas)", () => {
  const titulos = (grupo: string, pai?: string) => PAGINAS.filter(p => p.grupo === grupo && p.pai === pai).map(p => p.titulo);
  assert.deepEqual(titulos("Servidor"), ["Painel", "Geral", "Usuários"], "sem a aba Marca");
  assert.deepEqual(titulos("Servidor", "Bibliotecas"), ["Bibliotecas", "Exibir", "Metadados", "Configurações de NFO"]);
  assert.deepEqual(titulos("Servidor", "Reprodução"), ["Transcodificação", "Retomar", "Transmissão", "Pré-visualizações de vídeo"]);
  assert.deepEqual(titulos("Dispositivos"), ["Dispositivos", "Atividade"]);
  assert.deepEqual(titulos("TV ao Vivo"), ["TV ao Vivo", "DVR"]);
  assert.deepEqual(titulos("Plugins"), ["Plugins"]);
  assert.deepEqual(titulos("Avançado"), ["Redes", "Chaves da API", "Backups", "Registros", "Tarefas Agendadas"]);
  for (const p of PAGINAS) {
    assert.ok(p.efeito.texto.length > 10, `${p.id} explica o efeito`);
    if (p.efeito.tipo === "salvo") assert.match(p.efeito.texto, /ainda não|não aplica|não lê/i, `${p.id} avisa que não tem efeito`);
    for (const c of camposDe(p)) {
      if (c.tipo === "selecao") assert.ok(c.opcoes!.some(o => o.valor === c.padrao), `${p.id}.${c.chave}: padrão está nas opções`);
      assert.doesNotThrow(() => validar(p, { [c.chave]: c.padrao }, padroes(p)), `${p.id}.${c.chave}: padrão válido`);
    }
  }
  // Padrões dos modelos do servidor (EncodingOptions/ServerConfiguration/TrickplayOptions).
  const t = padroes(pagina("reproducao-transcodificacao")!);
  assert.deepEqual([t.H264Crf, t.H265Crf, t.ThrottleDelaySeconds, t.SegmentKeepSeconds, t.MaxMuxingQueueSize, t.VaapiDevice, t.EncodingThreadCount], [23, 28, 180, 720, 2048, "/dev/dri/renderD128", "-1"]);
  assert.deepEqual(t.HardwareDecodingCodecs, ["h264", "vc1"]);
  const r = padroes(pagina("reproducao-retomar")!);
  assert.deepEqual([r.MinResumePct, r.MaxResumePct, r.MinResumeDurationSeconds], [5, 90, 300]);
  assert.equal(padroes(pagina("reproducao-trickplay")!).Interval, 10000);
});

test("PQA-232: validação recusa valores fora do modelo", () => {
  const p = pagina("reproducao-transcodificacao")!, base = padroes(p);
  assert.throws(() => validar(p, { H264Crf: 52 }, base), /máximo é 51/);
  assert.throws(() => validar(p, { HardwareAccelerationType: "gpu-magica" }, base), /opção inválida/);
  assert.throws(() => validar(p, { EnableThrottling: "sim" }, base), /valor inválido/);
  assert.throws(() => validar(p, { HardwareDecodingCodecs: ["h264", "xyz"] }, base), /opção inválida/);
  assert.throws(() => validar(pagina("geral")!, { ServerName: "   " }, padroes(pagina("geral")!)), /não pode ficar vazio/);
  assert.throws(() => validar(pagina("redes")!, { LocalNetworkSubnets: "192.168.1.0/24\n300.1.1.1/8" }, padroes(pagina("redes")!)), /não é uma rede válida/);
  assert.throws(() => validar(pagina("plugins")!, { PluginRepositories: ["ftp://x"] }, padroes(pagina("plugins")!)), /http\(s\)/);
  assert.throws(() => validar(pagina("reproducao-retomar")!, { MinResumePct: 95 }, padroes(pagina("reproducao-retomar")!)), /menor que a máxima/);
  const ok = validar(pagina("redes")!, { LocalNetworkSubnets: " 192.168.1.0/24 \n\n10.0.0.0/8", InternalHttpPort: "8097" }, padroes(pagina("redes")!));
  assert.deepEqual(ok.LocalNetworkSubnets, ["192.168.1.0/24", "10.0.0.0/8"]);
  assert.equal(ok.InternalHttpPort, 8097);
  assert.equal(validar(pagina("geral")!, { LibraryScanFanoutConcurrency: "" }, padroes(pagina("geral")!)).LibraryScanFanoutConcurrency, null);
});

test("PQA-232: salvar e reler; usuários, dispositivos, bloqueio e atividade", () => {
  const arquivo = path.join(pasta, "painel.db");
  let banco = new BancoPainel(arquivo);
  banco.salvar("geral", { ServerName: "Cine do Sekiro" });
  banco.salvar("reproducao-transcodificacao", { HardwareAccelerationType: "vaapi", H264Crf: 21, HardwareDecodingCodecs: ["h264", "hevc"] });
  banco.fechar();
  banco = new BancoPainel(arquivo);
  assert.equal(banco.ler("geral").ServerName, "Cine do Sekiro");
  const t = banco.ler("reproducao-transcodificacao");
  assert.deepEqual([t.HardwareAccelerationType, t.H264Crf, t.HardwareDecodingCodecs, t.EncoderPreset], ["vaapi", 21, ["h264", "hevc"], "auto"], "salvo + padrões do resto");
  const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";
  assert.equal(banco.registrarAcesso("marcos", "marcos", "user", ua, "127.0.0.1"), true, "dispositivo novo");
  assert.equal(banco.registrarAcesso("marcos", "marcos", "user", ua, "127.0.0.1"), false, "mesmo navegador logo depois");
  banco.registrarAcesso("marcos", "marcos", "user", "Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0", "10.0.0.2");
  assert.deepEqual(banco.dispositivos().map(d => d.nome).sort(), ["Chrome no Linux", "Firefox no Linux"]);
  assert.equal(banco.atualizarUsuario("marcos", { desativado: true }).desativado, true);
  assert.equal(banco.usuario("marcos")!.desativado, true);
  assert.throws(() => banco.atualizarUsuario("marcos", { limiteBitrateMbps: -1 }), /bitrate/);
  assert.throws(() => banco.atualizarUsuario("marcos", { acessoSalas: "tudo" as never }), /salas/);
  banco.registrar("VideoPlayback", "marcos está reproduzindo X", "marcos");
  banco.registrar("TaskCompleted", "Varredura concluída");
  assert.deepEqual(banco.atividade({ usuario: "sim" }).map(e => e.tipo), ["VideoPlayback"]);
  assert.deepEqual(banco.atividade({ usuario: "nao" }).map(e => e.tipo), ["TaskCompleted"]);
  assert.equal(banco.excluirDispositivos(), 2);
  assert.equal(descreverNavegador("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1").nome, "Safari no iOS");
  banco.fechar();
});

test("PQA-232: chaves da API guardam só o hash e deixam de valer ao revogar", () => {
  const banco = new BancoPainel(path.join(pasta, "chaves.db"));
  const { chave, token } = banco.criarChave("Kodi da sala");
  assert.match(token, /^[0-9a-f]{48}$/);
  assert.equal(banco.validarChave(token), "Kodi da sala");
  assert.equal(banco.validarChave("0".repeat(48)), null);
  assert.ok(!JSON.stringify(banco.db.prepare("SELECT * FROM chaves").all()).includes(token), "token não fica no banco");
  assert.ok(banco.chaves()[0].ultimoUso, "registra o último uso");
  assert.throws(() => banco.criarChave("  "), /Nome do app/);
  assert.equal(banco.revogarChave(chave.id), true);
  assert.equal(banco.validarChave(token), null);
  banco.fechar();
});

test("PQA-232: backup .tar legível pelo tar do sistema, com os bancos consistentes", async () => {
  const fonte = path.join(pasta, "fonte.db");
  const db = new Database(fonte); db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('ola')"); db.close();
  const backups = new Backups(path.join(pasta, "backups"), [{ nome: "pugoticine.db", arquivo: fonte }, { nome: "ausente.db", arquivo: path.join(pasta, "nao-existe.db") }], "0.1.0");
  const b = await backups.criar();
  assert.match(b.nome, /^pugoticine-backup-\d{14}\.tar$/);
  assert.deepEqual(execFileSync("tar", ["-tf", path.join(pasta, "backups", b.nome)], { encoding: "utf8" }).trim().split("\n"), ["manifest.json", "pugoticine.db"]);
  const saida = fs.mkdtempSync(path.join(pasta, "x-"));
  execFileSync("tar", ["-xf", path.join(pasta, "backups", b.nome), "-C", saida]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(saida, "manifest.json"), "utf8")).aplicativo, "Pugoticine");
  const copia = new Database(path.join(saida, "pugoticine.db"), { readonly: true });
  assert.equal((copia.prepare("SELECT v FROM t").get() as { v: string }).v, "ola");
  copia.close();
  assert.equal(backups.listar().length, 1);
  assert.equal(backups.caminho("../../etc/passwd"), null);
  assert.equal(backups.excluir(b.nome), true);
  assert.equal(montarTar([{ nome: "a.txt", dados: Buffer.from("x") }]).length, 512 * 4);
});

test("PQA-232: registros copiam o console para log_AAAAMMDD.log", () => {
  const registros = new Registros(path.join(pasta, "registros"));
  registros.escrever("INF", "Pugoticine rodando");
  registros.escrever("WRN", "Resposta lenta: GET /api/x levou 900 ms");
  const [arquivo] = registros.arquivos();
  assert.match(arquivo.nome, /^log_\d{8}\.log$/);
  const texto = registros.ler(arquivo.nome)!;
  assert.match(texto, /\[INF\] Pugoticine rodando/);
  assert.match(texto, /\[WRN\] Resposta lenta/);
  assert.equal(registros.ler("../segredo"), null);
});

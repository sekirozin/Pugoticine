// PQA-239: restaurar backup como o BackupService do Jellyfin, em duas fases: o .tar é validado (checksum, manifesto
// do PugotiCine, só bancos conhecidos, integrity_check), um backup de segurança é criado, os bancos esperam em
// restauracao-pendente e são aplicados na inicialização trocando o arquivo e apagando -wal/-shm. Cancelar desfaz.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { Backups, aplicarRestauracaoPendente, lerTar, montarTar } from "./backups.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backups-"));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const fontes = [{ nome: "painel.db", arquivo: path.join(dir, "painel.db") }, { nome: "salas.db", arquivo: path.join(dir, "salas.db") }];
const gravar = (arquivo: string, valor: string) => { const db = new Database(arquivo); db.pragma("journal_mode = WAL"); db.exec("CREATE TABLE IF NOT EXISTS t (v TEXT); DELETE FROM t;"); db.prepare("INSERT INTO t VALUES (?)").run(valor); db.close(); };
const ler = (arquivo: string) => { const db = new Database(arquivo, { readonly: true }); try { return (db.prepare("SELECT v FROM t").get() as { v: string }).v; } finally { db.close(); } };
const backups = new Backups(path.join(dir, "backups"), fontes, "1.0.0");

test("PQA-239: lerTar devolve o que montarTar escreveu e recusa tar corrompido", () => {
  const tar = montarTar([{ nome: "a.txt", dados: Buffer.from("olá") }, { nome: "b.bin", dados: Buffer.alloc(1000, 7) }]);
  assert.deepEqual(lerTar(tar).map(a => [a.nome, a.dados.length]), [["a.txt", 4], ["b.bin", 1000]]);
  const ruim = Buffer.from(tar); ruim[10] ^= 0xff;
  assert.throws(() => lerTar(ruim), /corrompido/);
  assert.throws(() => lerTar(tar.subarray(0, 700)), /incompleto/);
});

test("PQA-239: restaurar agenda, cria backup de segurança e aplica na inicialização", async () => {
  gravar(fontes[0].arquivo, "antigo"); gravar(fontes[1].arquivo, "sala antiga");
  const { nome } = await backups.criar();
  gravar(fontes[0].arquivo, "novo"); gravar(fontes[1].arquivo, "sala nova");
  const pedido = await backups.agendarRestauracao(nome);
  assert.deepEqual(pedido.arquivos.sort(), ["painel.db", "salas.db"]);
  assert.notEqual(pedido.seguranca, nome);
  assert.ok(backups.caminho(pedido.seguranca), "backup de segurança existe");
  assert.equal(ler(fontes[0].arquivo), "novo", "nada muda antes de reiniciar");
  assert.deepEqual(backups.restauracaoPendente()?.backup, nome);
  fs.writeFileSync(`${fontes[0].arquivo}-wal`, "lixo");
  const aplicado = aplicarRestauracaoPendente(backups.pastaPendente, fontes);
  assert.equal(aplicado?.backup, nome);
  assert.equal(fs.existsSync(`${fontes[0].arquivo}-wal`), false, "-wal antigo apagado");
  assert.deepEqual([ler(fontes[0].arquivo), ler(fontes[1].arquivo)], ["antigo", "sala antiga"]);
  assert.equal(backups.restauracaoPendente(), null);
  assert.equal(aplicarRestauracaoPendente(backups.pastaPendente, fontes), null, "só aplica uma vez");
  // E o backup de segurança devolve o estado de antes.
  await backups.agendarRestauracao(pedido.seguranca);
  aplicarRestauracaoPendente(backups.pastaPendente, fontes);
  assert.equal(ler(fontes[0].arquivo), "novo");
});

test("PQA-239: cancelar e recusar backups inválidos", async () => {
  const { nome } = await backups.criar();
  await backups.agendarRestauracao(nome);
  assert.equal(backups.cancelarRestauracao(), true);
  assert.equal(aplicarRestauracaoPendente(backups.pastaPendente, fontes), null);
  const falso = (nome: string, arquivos: { nome: string; dados: Buffer }[]) => fs.writeFileSync(path.join(backups.pasta, nome), montarTar(arquivos));
  const manifesto = (aplicativo: string) => ({ nome: "manifest.json", dados: Buffer.from(JSON.stringify({ aplicativo, arquivos: [] })) });
  falso("pugoticine-backup-20000101000001.tar", [manifesto("Jellyfin"), { nome: "painel.db", dados: fs.readFileSync(fontes[0].arquivo) }]);
  falso("pugoticine-backup-20000101000002.tar", [manifesto("PugotiCine"), { nome: "../etc/passwd", dados: Buffer.from("x") }]);
  falso("pugoticine-backup-20000101000003.tar", [manifesto("PugotiCine"), { nome: "painel.db", dados: Buffer.alloc(8192, 1) }]);
  falso("pugoticine-backup-20000101000004.tar", [{ nome: "painel.db", dados: fs.readFileSync(fontes[0].arquivo) }]);
  falso("pugoticine-backup-20000101000005.tar", [manifesto("PugotiCine")]);
  await assert.rejects(backups.agendarRestauracao("pugoticine-backup-20000101000001.tar"), /não é do PugotiCine/);
  await assert.rejects(backups.agendarRestauracao("pugoticine-backup-20000101000002.tar"), /Arquivo desconhecido/);
  await assert.rejects(backups.agendarRestauracao("pugoticine-backup-20000101000003.tar"), /corrompido/);
  await assert.rejects(backups.agendarRestauracao("pugoticine-backup-20000101000004.tar"), /manifest\.json/);
  await assert.rejects(backups.agendarRestauracao("pugoticine-backup-20000101000005.tar"), /não tem bancos/);
  await assert.rejects(backups.agendarRestauracao("../painel.db"), /não encontrado/);
  assert.equal(backups.restauracaoPendente(), null, "nada agendado após recusas");
});

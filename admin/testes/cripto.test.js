/* Testes da cifra do painel. Rodar com: node --test admin/testes/*.test.js */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Cripto = require("../cripto.js");

const SENHA = "mesa verde do torneio de sabado";
const CHAVE = "github_pat_TESTE0000000000000000000000";

test("gera e abre um registro", async () => {
  const r = await Cripto.gerarRegistro("Ítalo", SENHA, CHAVE);
  assert.strictEqual(r.usuario, "italo");
  assert.strictEqual(r.iter, 600000);
  assert.ok(Cripto.registroValido(r));
  assert.ok(!JSON.stringify(r).includes(CHAVE), "a chave não pode aparecer no registro");
  assert.strictEqual(await Cripto.abrirRegistro(r, SENHA), CHAVE);
});

test("senha errada não abre", async () => {
  const r = await Cripto.gerarRegistro("italo", SENHA, CHAVE);
  assert.strictEqual(await Cripto.abrirRegistro(r, SENHA + "x"), null);
});

test("registro não serve para outro usuário", async () => {
  const r = await Cripto.gerarRegistro("italo", SENHA, CHAVE);
  assert.strictEqual(await Cripto.abrirRegistro({ ...r, usuario: "outro" }, SENHA), null);
});

test("salt e iv mudam a cada registro", async () => {
  const a = await Cripto.gerarRegistro("italo", SENHA, CHAVE);
  const b = await Cripto.gerarRegistro("italo", SENHA, CHAVE);
  assert.notStrictEqual(a.salt, b.salt);
  assert.notStrictEqual(a.chave_cifrada, b.chave_cifrada);
});

test("recusa senha curta e usuário inválido", async () => {
  await assert.rejects(Cripto.gerarRegistro("italo", "curta", CHAVE));
  await assert.rejects(Cripto.gerarRegistro("a", SENHA, CHAVE));
  assert.ok(!Cripto.registroValido({ usuario: "italo", salt: "x", iv: "y", iter: 1000, chave_cifrada: "z" }));
});

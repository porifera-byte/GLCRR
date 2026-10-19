/* Testes das regras de jogadores. Rodar com: node --test admin/testes/*.test.js */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const R = require("../regras-jogadores.js");

test("slug do apelido", () => {
  assert.strictEqual(R.slug("Ash RR"), "ash-rr");
  assert.strictEqual(R.slug("  Ítalo_Rosso!! "), "italo-rosso");
  assert.strictEqual(R.slug("Pikachu ⚡ 2"), "pikachu-2");
  assert.strictEqual(R.slug("!!!"), "jogador");
  assert.ok(R.slug("a".repeat(50)).length <= 30);
});

test("id único", () => {
  assert.strictEqual(R.idUnico("ash", ["kaio"]), "ash");
  assert.strictEqual(R.idUnico("ash", ["ash", "ash-2"]), "ash-3");
});

test("apelidos parecidos", () => {
  assert.ok(R.apelidosParecidos("brock_rr", "Brock-RR"));
  assert.ok(R.apelidosParecidos("Ash", "Ash RR"));
  assert.ok(R.apelidosParecidos("Vinicius", "Vinícius"));
  assert.ok(R.apelidosParecidos("Saymon", "Saimon"));
  assert.ok(R.apelidosParecidos("Rosso", "Roso"));
  assert.ok(!R.apelidosParecidos("Kaio", "Rosso"));
  assert.ok(!R.apelidosParecidos("Al", "Ana"));
});

test("parecidos ignora o próprio jogador na edição", () => {
  const lista = [{ id: "rosso", apelido: "Rosso" }, { id: "kaio", apelido: "Kaio" }];
  assert.deepStrictEqual(R.parecidosCom("Rossó", lista).map(j => j.id), ["rosso"]);
  assert.deepStrictEqual(R.parecidosCom("Rosso", lista, "rosso"), []);
});

test("idade", () => {
  assert.strictEqual(R.idade("2010-10-19", "2026-10-19"), 16);
  assert.strictEqual(R.idade("2010-10-20", "2026-10-19"), 15);
  assert.strictEqual(R.idade("", "2026-10-19"), null);
});

test("caminho do ícone", () => {
  const c = R.caminhoIcone("ash-rr", "webp", new Date(Date.UTC(2026, 9, 19, 8, 5, 3)));
  assert.strictEqual(c, "assets/img/jogadores/ash-rr-20261019080503.webp");
  assert.ok(R.ICONE_VALIDO.test(c));
  assert.ok(!R.ICONE_VALIDO.test("https://exemplo.com/a.png"));
  assert.ok(!R.ICONE_VALIDO.test("assets/img/jogadores/../../index.png"));
});

test("validação", () => {
  const hoje = "2026-10-19";
  const ok = R.validar({ apelido: " Ash  RR ", cidade: "", desde: "2026", nome: "", nascimento: "" }, hoje);
  assert.deepStrictEqual(ok.erros, {});
  assert.strictEqual(ok.dados.apelido, "Ash RR");
  const ruim = R.validar({ apelido: "A", desde: "1999", nome: "Jo", nascimento: "2027-01-01" }, hoje);
  assert.deepStrictEqual(Object.keys(ruim.erros).sort(), ["apelido", "desde", "nascimento", "nome"]);
  assert.ok(R.validar({ apelido: "Ash", desde: 2026, nascimento: "2010-02-30" }, hoje).erros.nascimento);
});

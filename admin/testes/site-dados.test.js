/* Validações do site público (assets/js/data.js) que protegem o HTML gerado a partir dos JSON.
   Também confere que os caminhos de imagem aceitos pelo site são os mesmos do painel.
   Rodar com: node --test admin/testes/*.test.js */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const RJ = require("../regras-jogadores.js");
const RE = require("../regras-eventos.js");

/* data.js é script de navegador: roda num contexto isolado e as consultas leem as constantes dele */
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "assets", "js", "data.js"), "utf8"), ctx);
const site = expr => vm.runInContext(expr, ctx);

test("caminhos de imagem iguais aos do painel", () => {
  assert.strictEqual(site("ICONE_VALIDO.source"), RJ.ICONE_VALIDO.source);
  assert.strictEqual(site("ICONE_VALIDO.flags"), RJ.ICONE_VALIDO.flags);
  assert.strictEqual(site("DECKLIST_VALIDA.source"), RE.DECKLIST_VALIDA.source);
  assert.strictEqual(site("DECKLIST_VALIDA.flags"), RE.DECKLIST_VALIDA.flags);
});

test("urlSegura aceita só http(s)", () => {
  const u = v => site(`urlSegura(${JSON.stringify(v)})`);
  assert.strictEqual(u("https://gymleaderchallenge.com"), "https://gymleaderchallenge.com");
  assert.strictEqual(u("  https://www.instagram.com/glc.roraima/ "), "https://www.instagram.com/glc.roraima/");
  assert.strictEqual(u("http://exemplo.com"), "http://exemplo.com");
  ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "data:text/html,<b>x</b>",
    "//exemplo.com", "vbscript:x", "", null, undefined].forEach(v => assert.strictEqual(u(v), "", String(v)));
});

test("dataBR só converte AAAA-MM-DD", () => {
  const d = v => site(`dataBR(${JSON.stringify(v)})`);
  assert.strictEqual(d("2026-10-19"), "19/10/2026");
  assert.strictEqual(d("<img src=x>"), "");
  assert.strictEqual(d("2026-10-19<b>"), "");
  assert.strictEqual(d(""), "");
});

test("V-D-E sempre numérico", () => {
  assert.strictEqual(site(`vde({ vitorias: 3, derrotas: 1 })`), "3-1-0");
  assert.strictEqual(site(`vde({ vitorias: "2", derrotas: "<b>", empates: "1" })`), "2-0-1");
});

test("decklist do Top 3: imagem fora do formato vira reserva", () => {
  site(`DADOS.decklists = ${JSON.stringify([
    { evento_id: "e", jogador_id: "a", posicao: 1, imagem: "assets/img/decklists/e-1-a.jpg?v=20261019090500" },
    { evento_id: "e", jogador_id: "b", posicao: 2, imagem: "javascript:alert(1)" },
    { evento_id: "e", jogador_id: "c", posicao: 3, imagem: "https://exemplo.com/x.jpg", lista_texto: "lista" }
  ])}`);
  assert.strictEqual(site(`decklistTop3("e", "a", 1).imagem`), "assets/img/decklists/e-1-a.jpg?v=20261019090500");
  assert.strictEqual(site(`decklistTop3("e", "b", 2).reserva`), true);
  assert.strictEqual(site(`decklistTop3("e", "b", 2).imagem`), site("IMAGEM_RESERVA_DECKLIST"));
  /* com texto, a decklist vale; a imagem inválida é descartada na hora de exibir (htmlDecklist) */
  assert.strictEqual(site(`decklistTop3("e", "c", 3).lista_texto`), "lista");
  assert.ok(!site(`DECKLIST_VALIDA.test(decklistTop3("e", "c", 3).imagem)`));
});

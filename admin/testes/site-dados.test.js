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

test("logo de patrocinador só em assets/img/patrocinadores/", () => {
  const ok = v => site(`LOGO_PATROCINADOR_VALIDA.test(${JSON.stringify(v)})`);
  ["assets/img/patrocinadores/tidiplay.webp", "assets/img/patrocinadores/style-geek.png",
    "assets/img/patrocinadores/macuxitcg.svg"].forEach(v => assert.ok(ok(v), v));
  ["", "https://exemplo.com/logo.png", "javascript:alert(1)", "assets/img/patrocinadores/../x.png",
    "assets/img/jogadores/a.webp", "assets/img/patrocinadores/Logo.PNG", "assets/img/patrocinadores/a.gif"]
    .forEach(v => assert.ok(!ok(v), v));
});

test("aba Decks: todo o Top 3, do evento mais recente para o mais antigo", () => {
  site(`DADOS.eventos = ${JSON.stringify([
    { id: "2026-01-10-a", nome: "A", data: "2026-01-10" },
    { id: "2026-02-10-b", nome: "B", data: "2026-02-10" }
  ])}`);
  site(`DADOS.resultados = ${JSON.stringify([
    { evento_id: "2026-01-10-a", colocacoes: [{ posicao: 2, jogador_id: "y" }, { posicao: 1, jogador_id: "x" }, { posicao: 4, jogador_id: "z" }] },
    { evento_id: "2026-02-10-b", colocacoes: [{ posicao: 1, jogador_id: "z", tipo_pokemon: "Fogo" }] },
    { evento_id: "sem-evento", colocacoes: [{ posicao: 1, jogador_id: "w" }] }
  ])}`);
  site(`DADOS.decklists = ${JSON.stringify([
    { evento_id: "2026-01-10-a", jogador_id: "x", posicao: 1, imagem: "assets/img/decklists/2026-01-10-a-1-x.jpg?v=20260110120000" }
  ])}`);
  const lista = JSON.parse(site(`JSON.stringify(decksTop3().map(i => [i.evento.id, i.colocacao.jogador_id, !!i.decklist.reserva]))`));
  assert.deepStrictEqual(lista, [["2026-02-10-b", "z", true], ["2026-01-10-a", "x", false], ["2026-01-10-a", "y", true]]);
});

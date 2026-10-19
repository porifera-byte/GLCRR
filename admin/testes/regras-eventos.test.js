/* Testes das regras de eventos e resultados. Rodar com: node --test admin/testes/*.test.js */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const R = require("../regras-eventos.js");

const HOJE = "2026-10-19";
const TIPOS = ["Torneio Anual", "Amistoso", "Encontro da comunidade"];

test("id do evento", () => {
  assert.strictEqual(R.idEvento("2026-11-08", "Etapa 3"), "2026-11-08-etapa-3");
  assert.strictEqual(R.idEvento("2026-11-08", "Campeonato GLC — Temporada 1!"), "2026-11-08-campeonato-glc-temporada-1");
});

test("evento válido", () => {
  const r = R.validarEvento({ nome: " Etapa  3 ", data: "2026-11-08", horario: "14:00", local: "Boa Vista", vagas: "16",
    tipo: "Amistoso", inscricao_url: "https://forms.gle/abc123", descricao: "Venha!", status: "" }, HOJE, TIPOS);
  assert.deepStrictEqual(r.erros, {});
  assert.deepStrictEqual(r.avisos, []);
  assert.strictEqual(r.dados.nome, "Etapa 3");
  assert.strictEqual(r.dados.vagas, 16);
});

test("evento inválido e avisos", () => {
  const r = R.validarEvento({ nome: "X", data: "2026-02-30", horario: "25:00", local: "", vagas: "1", tipo: "Outro",
    inscricao_url: "forms", descricao: "a".repeat(601), status: "Cancelado" }, HOJE, TIPOS);
  assert.deepStrictEqual(Object.keys(r.erros).sort(),
    ["data", "descricao", "horario", "inscricao_url", "local", "nome", "status", "tipo", "vagas"]);
  const a = R.validarEvento({ nome: "Etapa", data: "2026-01-10", local: "BV", inscricao_url: "https://site.com/x", status: "Inscrições abertas" }, HOJE, TIPOS);
  assert.deepStrictEqual(a.erros, {});
  assert.strictEqual(a.avisos.length, 2);
  assert.strictEqual(a.dados.vagas, "");
});

const IDS = ["ash", "misty", "brock", "lenon"];
const linha = (posicao, jogador_id, v, d, e = 0, obs = "") => ({ posicao, jogador_id, vitorias: v, derrotas: d, empates: e, obs });

test("resultado válido, ordenado por posição", () => {
  const r = R.validarResultado([linha(2, "misty", 2, 1), linha(1, "ash", 3, 0), linha(3, "brock", 1, 2), linha(4, "lenon", 0, 3)], IDS, "2026-10-10", HOJE);
  assert.deepStrictEqual(r.erros, []);
  assert.deepStrictEqual(r.avisos, []);
  assert.deepStrictEqual(r.colocacoes.map(c => c.jogador_id), ["ash", "misty", "brock", "lenon"]);
  assert.ok(!("obs" in r.colocacoes[0]));
});

test("resultado: erros de jogador, números e empate", () => {
  const r = R.validarResultado([linha(1, "ash", 3, 0), linha(2, "ash", 1, 1), linha(2, "zeca", -1, 0), linha(3, "", 0, 0)], IDS, "2026-10-10", HOJE);
  assert.strictEqual(r.erros.length, 4);
  const emp = R.validarResultado([linha(1, "ash", 2, 0), linha(2, "misty", 1, 1), linha(2, "brock", 1, 1)], IDS, "2026-10-10", HOJE);
  assert.ok(emp.erros[0].includes("2º lugar repetido"));
  const ok = R.validarResultado([linha(1, "ash", 2, 0), linha(2, "misty", 1, 1, 0, "empate"), linha(2, "brock", 1, 1, 0, "empate"), linha(4, "lenon", 0, 2)], IDS, "2026-10-10", HOJE);
  assert.deepStrictEqual(ok.erros, []);
  assert.deepStrictEqual(ok.avisos.filter(a => a.includes("pula")), []);
});

test("resultado: avisos de buraco, bye e data futura", () => {
  const r = R.validarResultado([linha(1, "ash", 3, 0), linha(3, "misty", 1, 1, 0, "drop")], IDS, "2026-12-01", HOJE);
  assert.deepStrictEqual(r.erros, []);
  assert.strictEqual(r.avisos.length, 3);
  assert.strictEqual(r.colocacoes[1].obs, "drop");
});

test("decklists: caminho, versão e validação", () => {
  const c = R.caminhoDecklist("2026-09-20-etapa", 1, "vinicius");
  assert.strictEqual(c, "assets/img/decklists/2026-09-20-etapa-1-vinicius.jpg");
  const v = `${c}?v=${R.carimbo(new Date(Date.UTC(2026, 9, 19, 9, 5, 0)))}`;
  assert.strictEqual(v, "assets/img/decklists/2026-09-20-etapa-1-vinicius.jpg?v=20261019090500");
  assert.ok(R.DECKLIST_VALIDA.test(v));
  assert.ok(!R.DECKLIST_VALIDA.test("https://x.com/a.jpg"));
  assert.strictEqual(R.semVersao(v), c);
  assert.ok(R.validarDecklist({ lista_texto: "a".repeat(3001) }).erros.lista_texto);
  assert.deepStrictEqual(R.validarDecklist({ lista_texto: " x " }).dados, { lista_texto: "x" });
});

test("decklists: ajuste depois de corrigir o resultado", () => {
  const dl = [
    { evento_id: "ev", jogador_id: "ash", posicao: 1 },
    { evento_id: "ev", jogador_id: "misty", posicao: 2 },
    { evento_id: "outro", jogador_id: "ash", posicao: 3 }
  ];
  const ok = R.ajustarDecklists(dl, "ev", [linha(1, "misty", 3, 0), linha(2, "ash", 2, 1)]);
  assert.deepStrictEqual(ok.erros, []);
  assert.ok(ok.mudou);
  assert.deepStrictEqual(ok.lista.map(d => d.posicao), [2, 1, 3]);
  const ruim = R.ajustarDecklists(dl, "ev", [linha(1, "misty", 3, 0), linha(4, "ash", 0, 3)]);
  assert.strictEqual(ruim.erros.length, 1);
});

test("resultado: tipo do deck para todos, da lista", () => {
  const TP = ["Fogo", "Água", "Planta"];
  const r = R.validarResultado([{ ...linha(1, "ash", 3, 0), tipo_pokemon: " Fogo " }, linha(2, "misty", 2, 1), { ...linha(5, "brock", 0, 3), tipo_pokemon: "Água" }], IDS, "2026-10-10", HOJE, TP);
  assert.deepStrictEqual(r.erros, []);
  assert.strictEqual(r.colocacoes[0].tipo_pokemon, "Fogo");
  assert.ok(!("tipo_pokemon" in r.colocacoes[1]));
  assert.strictEqual(r.colocacoes[2].tipo_pokemon, "Água");
  const ruim = R.validarResultado([{ ...linha(1, "ash", 3, 0), tipo_pokemon: "Laser" }], IDS, "2026-10-10", HOJE, TP);
  assert.ok(ruim.erros[0].includes("fora da lista"));
});

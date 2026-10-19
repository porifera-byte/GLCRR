/* Testes do motor do torneio suíço. Rodar com: node --test admin/testes/*.test.js */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const S = require("../regras-suico.js");
const RE = require("../regras-eventos.js");

const EVENTO = "2026-11-08-teste";
const TIPOS = ["Planta", "Fogo", "Água", "Elétrico", "Psíquico", "Lutador", "Escuridão", "Metal", "Dragão", "Incolor"];
const ids = n => Array.from({ length: n }, (_, i) => `j${i + 1}`);

/* Sorteio com semente (mulberry32), para os testes serem repetíveis */
function rng(semente) {
  return function () {
    semente = (semente + 0x6D2B79F5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Estado pronto a partir de rodadas compactas [[a, b, placar], ...] (b null = bye), todas fechadas */
function montar(jogadores, rodadas, previstas) {
  return {
    evento_id: EVENTO, versao: 1, rodadas_previstas: previstas || rodadas.length,
    jogadores: jogadores.map(id => ({ id, entrou_na_rodada: 1, drop_apos_rodada: null })),
    rodadas: rodadas.map((mesas, i) => ({
      numero: i + 1, fechada: true,
      mesas: mesas.map(([a, b, placar], k) => ({ mesa: k + 1, a, b: b || null, placar: b ? placar : "bye" }))
    })),
    desempate_manual: []
  };
}

/* Joga a rodada aberta com placares sorteados e fecha */
function jogar(e, sorteio) {
  const r = S.rodadaAberta(e);
  r.mesas.forEach(m => { if (m.placar !== "bye") e = S.registrarPlacar(e, r.numero, m.mesa, S.PLACARES[Math.floor(sorteio() * 5)]); });
  return S.fecharRodada(e);
}

const linha = (cl, id) => cl.find(l => l.jogador_id === id);
const ordem = cl => cl.map(l => l.jogador_id);

test("rodadas sugeridas = ⌈log₂ n⌉", () => {
  const esperado = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 7: 3, 8: 3, 9: 4, 16: 4, 17: 5, 32: 5 };
  Object.entries(esperado).forEach(([n, r]) => assert.strictEqual(S.rodadasSugeridas(Number(n)), r, `n=${n}`));
});

test("novo torneio: padrão e erros", () => {
  const e = S.novoTorneio(EVENTO, ids(5), { tipos: { j1: " Fogo ", j2: "" } });
  assert.strictEqual(e.rodadas_previstas, 3);
  assert.deepStrictEqual(e.jogadores[0], { id: "j1", entrou_na_rodada: 1, drop_apos_rodada: null, tipo_pokemon: "Fogo" });
  assert.ok(!("tipo_pokemon" in e.jogadores[1]));
  assert.ok(S.validarEstado(e, ids(5)).ok);
  assert.throws(() => S.novoTorneio("etapa", ids(4)), /Evento inválido/);
  assert.throws(() => S.novoTorneio(EVENTO, ["j1"]), /pelo menos 2/);
  assert.throws(() => S.novoTorneio(EVENTO, ["j1", "j1"]), /repetido/);
  assert.throws(() => S.novoTorneio(EVENTO, ["J 1", "j2"]), /inválido/);
  assert.throws(() => S.novoTorneio(EVENTO, ids(4), { rodadas: 0 }), /rodadas/);
  assert.strictEqual(S.definirRodadas(e, 5).rodadas_previstas, 5);
  assert.strictEqual(e.rodadas_previstas, 3, "não altera o estado original");
});

test("1ª rodada aleatória: muda com o sorteio e repete com a mesma semente", () => {
  const e = S.novoTorneio(EVENTO, ids(8));
  const mesas = s => JSON.stringify(S.parear(e, rng(s)).rodadas[0].mesas);
  assert.strictEqual(mesas(1), mesas(1));
  assert.ok(new Set([1, 2, 3, 4, 5].map(mesas)).size > 1);
});

test("simulação com 4, 5, 7, 8 e 16 jogadores: sem revanche, todos jogam, bye certo", () => {
  [4, 5, 7, 8, 16].forEach(n => {
    for (let semente = 1; semente <= 40; semente++) {
      const sorteio = rng(semente * 100 + n);
      let e = S.novoTorneio(EVENTO, ids(n));
      assert.strictEqual(e.rodadas_previstas, S.rodadasSugeridas(n));
      const jogaram = new Set();
      const byes = new Map();
      for (let r = 1; r <= e.rodadas_previstas; r++) {
        const antes = S.classificacao(e);
        e = S.parear(e, sorteio);
        const mesas = S.rodadaAberta(e).mesas;
        const naRodada = mesas.flatMap(m => [m.a, m.b]).filter(Boolean);
        assert.strictEqual(naRodada.length, n, `n=${n} r=${r}: todos jogam`);
        assert.strictEqual(new Set(naRodada).size, n);
        mesas.forEach(m => {
          if (m.b === null) {
            assert.ok(!byes.has(m.a), `n=${n} r=${r}: ${m.a} recebeu dois byes`);
            if (r > 1) {
              const semBye = ordem(antes).filter(id => !byes.has(id));
              assert.strictEqual(m.a, semBye[semBye.length - 1], `n=${n} r=${r}: bye para o pior colocado sem bye`);
            }
            byes.set(m.a, true);
          } else {
            const k = [m.a, m.b].sort().join("|");
            assert.ok(!jogaram.has(k), `n=${n} r=${r}: revanche ${k}`);
            jogaram.add(k);
          }
        });
        assert.strictEqual(byes.size, n % 2 ? r : 0);
        e = jogar(e, sorteio);
      }
      assert.ok(S.encerrado(e));
      assert.ok(S.validarEstado(e, ids(n)).ok);
    }
  });
});

test("pareamento por pontos: 1º contra 2º quando ainda não jogaram", () => {
  let e = montar(ids(4), [[["j1", "j4", "2-0"], ["j2", "j3", "2-1"]]], 2);
  e = S.parear(e);
  const pares = S.rodadaAberta(e).mesas.map(m => [m.a, m.b]);
  assert.deepStrictEqual(pares, [["j1", "j2"], ["j3", "j4"]]);
});

test("sem revanche quando o caminho guloso trava (volta atrás)", () => {
  /* Guloso: j1-j3, j2-j4, e j5-j6 já jogaram. Com volta atrás: j1-j3, j2-j5, j4-j6 */
  const pares = S.emparelhar(ids(6), [["j1", "j2"], ["j5", "j6"]]);
  assert.deepStrictEqual(pares, [["j1", "j3"], ["j2", "j5"], ["j4", "j6"]]);
  assert.strictEqual(S.emparelhar(ids(4), [["j1", "j2"], ["j1", "j3"], ["j1", "j4"]]), null);
  assert.strictEqual(S.emparelhar(ids(3), []), null, "lista ímpar");
});

test("sem pareamento possível: erro claro", () => {
  const e = montar(ids(4), [[["j1", "j2", "2-0"], ["j3", "j4", "2-0"]], [["j1", "j3", "2-0"], ["j2", "j4", "2-0"]],
    [["j1", "j4", "2-0"], ["j2", "j3", "2-0"]]], 4);
  assert.throws(() => S.parear(e), /sem revanche para a rodada 4/);
});

test("bye: 1 ponto, 2-0 no saldo, fora do Buchholz; 3 jogadores em 3 rodadas = um bye para cada", () => {
  let e = S.novoTorneio(EVENTO, ids(3), { rodadas: 3 });
  const sorteio = rng(7);
  for (let r = 0; r < 3; r++) e = jogar(S.parear(e, sorteio), sorteio);
  const quemTeveBye = e.rodadas.map(r => r.mesas.find(m => m.b === null).a);
  assert.deepStrictEqual(quemTeveBye.slice().sort(), ["j1", "j2", "j3"]);

  const cl = S.classificacao(montar(ids(3), [[["j1", "j2", "2-1"], ["j3", null]]]));
  assert.deepStrictEqual(
    (({ pontos, vitorias, jogos_v, jogos_p, saldo, buchholz, byes }) => ({ pontos, vitorias, jogos_v, jogos_p, saldo, buchholz, byes }))(linha(cl, "j3")),
    { pontos: 1, vitorias: 1, jogos_v: 2, jogos_p: 0, saldo: 2, buchholz: 0, byes: 1 });
  assert.strictEqual(linha(cl, "j1").buchholz, 0, "j1 só enfrentou j2 (0 ponto)");
});

test("bye vai para o pior sem bye, mesmo acima de quem já teve", () => {
  /* j3 já teve bye e é o último; o bye vai para o pior sem bye (j2) */
  const e = S.parear(montar(ids(3), [[["j1", "j2", "2-0"], ["j3", null]]], 2));
  const bye = S.rodadaAberta(e).mesas.find(m => m.b === null);
  assert.strictEqual(bye.a, "j2");
});

/* Torneios reais simulados (6 jogadores, 3 rodadas) usados nos desempates */
const T1 = montar(ids(6), [
  [["j1", "j3", "1-2"], ["j4", "j6", "1-1"], ["j2", "j5", "2-1"]],
  [["j2", "j3", "1-2"], ["j4", "j1", "2-0"], ["j6", "j5", "1-2"]],
  [["j3", "j4", "2-1"], ["j2", "j6", "1-1"], ["j5", "j1", "0-2"]]
]);
const T2 = montar(ids(6), [
  [["j5", "j2", "1-1"], ["j3", "j4", "1-1"], ["j6", "j1", "2-1"]],
  [["j6", "j2", "1-1"], ["j3", "j5", "1-2"], ["j4", "j1", "2-1"]],
  [["j5", "j6", "2-0"], ["j4", "j2", "1-2"], ["j3", "j1", "1-1"]]
]);

test("desempate 1: vitórias contra empatados vence Buchholz e saldo piores", () => {
  const cl = S.classificacao(T1);
  const j5 = linha(cl, "j5");
  const j6 = linha(cl, "j6");
  assert.strictEqual(j5.pontos, j6.pontos);
  assert.deepStrictEqual([j5.vce, j6.vce], [1, 0]);
  assert.ok(j5.buchholz < j6.buchholz && j5.saldo < j6.saldo);
  assert.ok(j5.posicao < j6.posicao);
});

test("desempate 2: Buchholz mediano (descarta maior e menor) vence saldo pior", () => {
  const cl = S.classificacao(T2);
  const j6 = linha(cl, "j6");
  const j4 = linha(cl, "j4");
  assert.strictEqual(j6.pontos, j4.pontos);
  assert.strictEqual(j6.vce, j4.vce);
  assert.strictEqual(j6.buchholz, 2, "adversários com 0,5 · 2 · 2,5 → fica 2");
  assert.strictEqual(j4.buchholz, 1, "adversários com 0,5 · 1 · 2 → fica 1");
  assert.ok(j6.saldo < j4.saldo);
  assert.ok(j6.posicao < j4.posicao);
  assert.strictEqual(linha(S.classificacao(T1), "j3").buchholz, 1.5);
});

test("Buchholz com menos de 3 adversários = soma simples", () => {
  const e = montar(ids(4), [[["j1", "j2", "2-0"], ["j3", "j4", "2-0"]], [["j1", "j3", "2-1"], ["j2", "j4", "1-1"]]]);
  const cl = S.classificacao(e);
  assert.strictEqual(linha(cl, "j1").buchholz, 0.5 + 1);
  assert.strictEqual(linha(cl, "j4").buchholz, 1 + 0.5);
});

test("desempate 3: saldo de jogos", () => {
  const cl = S.classificacao(T1);
  const j4 = linha(cl, "j4");
  const j2 = linha(cl, "j2");
  assert.deepStrictEqual([j4.pontos, j4.vce, j4.buchholz], [j2.pontos, j2.vce, j2.buchholz]);
  assert.deepStrictEqual([j4.saldo, j2.saldo], [1, 0]);
  assert.ok(j4.posicao < j2.posicao);
});

test("desempate 4: manual", () => {
  /* Todos com 1 ponto, 1 vitória contra empatado, Buchholz 2 e saldo 0 */
  let e = montar(ids(4), [[["j1", "j2", "2-0"], ["j3", "j4", "2-0"]], [["j2", "j3", "2-0"], ["j4", "j1", "2-0"]]]);
  let cl = S.classificacao(e);
  assert.ok(cl.every(l => l.desempate_pendente && l.empatados.length === 4));
  assert.match(S.paraResultado(e).erros.join(" "), /Desempate manual pendente entre: j1, j2, j3, j4/);
  e = S.desempatarManual(e, ["j3", "j1", "j4"]);
  cl = S.classificacao(e);
  assert.deepStrictEqual(ordem(cl), ["j3", "j1", "j4", "j2"]);
  assert.ok(cl.every(l => !l.desempate_pendente), "falta só um: fica definido");
  assert.deepStrictEqual(S.paraResultado(e).erros, []);
  assert.throws(() => S.desempatarManual(e, ["j1", "x9"]), /não está no torneio/);
});

test("vitórias contra empatados com 3 ou mais empatados contam contra qualquer um do grupo", () => {
  const e = montar(ids(6), [
    [["j1", "j2", "2-0"], ["j3", "j4", "2-0"], ["j5", "j6", "2-0"]],
    [["j1", "j3", "0-2"], ["j2", "j5", "2-0"], ["j4", "j6", "2-0"]]
  ]);
  /* 1 ponto: j1 (venceu j2), j2 (venceu j5), j4 (venceu j6), j5 (venceu j6) */
  const cl = S.classificacao(e);
  ["j1", "j2"].forEach(id => assert.strictEqual(linha(cl, id).vce, 1, id));
  assert.strictEqual(linha(cl, "j4").vce, 0, "j6 não está empatado com ele");
});

test("drop: mantém resultados, sai das próximas rodadas e recebe obs drop", () => {
  let e = S.novoTorneio(EVENTO, ids(5), { rodadas: 3 });
  const sorteio = rng(3);
  e = jogar(S.parear(e, sorteio), sorteio);
  const antes = linha(S.classificacao(e), "j2");
  e = S.dropJogador(e, "j2");
  assert.throws(() => S.dropJogador(e, "j2"), /já saiu/);
  for (let r = 2; r <= 3; r++) {
    e = S.parear(e, sorteio);
    assert.ok(!S.rodadaAberta(e).mesas.some(m => m.a === "j2" || m.b === "j2"));
    assert.ok(!S.rodadaAberta(e).mesas.some(m => m.b === null), "4 ativos: sem bye");
    e = jogar(e, sorteio);
  }
  const depois = linha(S.classificacao(e), "j2");
  assert.deepStrictEqual([depois.vitorias, depois.derrotas, depois.empates], [antes.vitorias, antes.derrotas, antes.empates]);
  assert.strictEqual(S.paraResultado(e).colocacoes.find(c => c.jogador_id === "j2").obs, "drop");
  assert.ok(S.validarEstado(e, ids(5)).ok);
});

test("drop durante a rodada aberta: placar ainda é lançado; desfazer drop", () => {
  let e = S.parear(S.novoTorneio(EVENTO, ids(4), { rodadas: 2 }), rng(1));
  e = S.dropJogador(e, "j1");
  assert.strictEqual(e.jogadores[0].drop_apos_rodada, 1);
  assert.ok(S.validarEstado(e).ok);
  e = S.desfazerDrop(e, "j1");
  assert.strictEqual(e.jogadores[0].drop_apos_rodada, null);
});

test("atrasado: derrota 0-2 nas rodadas perdidas, fora do Buchholz dos outros", () => {
  let e = montar(ids(4), [[["j1", "j2", "2-0"], ["j3", "j4", "2-1"]]], 3);
  e = S.incluirJogador(e, "j5", "Metal");
  assert.deepStrictEqual(e.jogadores[4], { id: "j5", entrou_na_rodada: 2, drop_apos_rodada: null, tipo_pokemon: "Metal" });
  assert.throws(() => S.incluirJogador(e, "j5"), /já está/);
  let cl = S.classificacao(e);
  const j5 = linha(cl, "j5");
  assert.deepStrictEqual([j5.pontos, j5.vitorias, j5.derrotas, j5.jogos_v, j5.jogos_p, j5.buchholz], [0, 0, 1, 0, 2, 0]);
  assert.strictEqual(linha(cl, "j1").buchholz, 0, "a derrota do atrasado não tem adversário");
  e = S.parear(e);
  const mesas = S.rodadaAberta(e).mesas;
  assert.ok(mesas.some(m => m.a === "j5" || m.b === "j5"), "joga a rodada 2");
  assert.ok(S.validarEstado(e, ids(5)).ok);

  /* Incluído com a rodada 2 aberta: entra na 3 e perde a 1 e a 2 */
  e = S.incluirJogador(e, "j6");
  assert.strictEqual(e.jogadores[5].entrou_na_rodada, 3);
  e = S.cancelarRodada(e);
  assert.strictEqual(e.jogadores[5].entrou_na_rodada, 2, "cancelar a rodada traz a entrada junto");
});

test("placar, fechamento e cancelamento", () => {
  let e = S.parear(S.novoTorneio(EVENTO, ids(5), { rodadas: 2 }), rng(2));
  const r = S.rodadaAberta(e);
  assert.throws(() => S.fecharRodada(e), /Falta o placar das mesas 1, 2/);
  assert.throws(() => S.registrarPlacar(e, 1, 1, "3-0"), /Placar inválido/);
  assert.throws(() => S.registrarPlacar(e, 1, 3, "2-0"), /bye/);
  assert.throws(() => S.registrarPlacar(e, 2, 1, "2-0"), /última rodada/);
  assert.throws(() => S.parear(e), /Feche a rodada/);
  e = S.registrarPlacar(e, 1, 1, "2-1");
  e = S.registrarPlacar(e, 1, 2, "1-1");
  e = S.fecharRodada(e);
  assert.throws(() => S.registrarPlacar(e, 1, 1, null), /já foi fechada/);
  e = S.registrarPlacar(e, 1, 1, "0-2");
  assert.strictEqual(e.rodadas[0].mesas[0].placar, "0-2", "corrige a última rodada fechada");
  e = S.parear(e);
  assert.throws(() => S.registrarPlacar(e, 1, 1, "2-0"), /última rodada/);
  e = S.cancelarRodada(e);
  assert.strictEqual(e.rodadas.length, 1);
  assert.strictEqual(r.numero, 1);
  assert.throws(() => S.definirRodadas(S.parear(e), 1), /Já foram pareadas 2/);
});

test("removerJogador só antes de ter mesa", () => {
  let e = S.novoTorneio(EVENTO, ids(4));
  e = S.removerJogador(e, "j4");
  assert.deepStrictEqual(e.jogadores.map(j => j.id), ["j1", "j2", "j3"]);
  e = S.parear(e, rng(1));
  assert.throws(() => S.removerJogador(e, "j1"), /drop/);
});

test("paraResultado passa em validarResultado, com tipo do deck e bye como vitória", () => {
  let e = S.novoTorneio(EVENTO, ids(7), { tipos: { j1: "Fogo", j4: "Água" } });
  const sorteio = rng(11);
  assert.match(S.paraResultado(e).erros[0], /ainda não terminou/);
  for (let r = 1; r <= e.rodadas_previstas; r++) {
    e = jogar(S.parear(e, sorteio), sorteio);
    if (r === 1) e = S.dropJogador(e, "j7");
  }
  const cl = S.classificacao(e);
  const pendentes = [...new Set(cl.filter(l => l.desempate_pendente).map(l => l.empatados.join(",")))];
  pendentes.forEach(g => { e = S.desempatarManual(e, g.split(",")); });
  const { colocacoes, erros } = S.paraResultado(e);
  assert.deepStrictEqual(erros, []);
  assert.deepStrictEqual(colocacoes.map(c => c.posicao), [1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(colocacoes.find(c => c.jogador_id === "j1").tipo_pokemon, "Fogo");
  assert.strictEqual(colocacoes.find(c => c.jogador_id === "j7").obs, "drop");
  const byes = e.rodadas.flatMap(r => r.mesas).filter(m => m.b === null).length;
  const v = colocacoes.reduce((s, c) => s + c.vitorias, 0);
  const d = colocacoes.reduce((s, c) => s + c.derrotas, 0);
  assert.strictEqual(v - d, byes - 0, "cada bye soma uma vitória sem derrota correspondente");
  const val = RE.validarResultado(colocacoes, ids(7), "2026-11-08", "2026-11-09", TIPOS);
  assert.deepStrictEqual(val.erros, []);
  assert.deepStrictEqual(val.colocacoes, colocacoes);
});

test("validarEstado: recusa campo desconhecido (dado pessoal) e estrutura quebrada", () => {
  const base = S.parear(S.novoTorneio(EVENTO, ids(4), { rodadas: 2 }), rng(5));
  assert.ok(S.validarEstado(base, ids(4)).ok);
  const com = f => { const e = JSON.parse(JSON.stringify(base)); f(e); return S.validarEstado(e, ids(4)); };
  assert.match(com(e => { e.jogadores[0].nome = "Fulano"; }).erros[0], /campo desconhecido "nome"/);
  assert.match(com(e => { e.extra = 1; }).erros[0], /campo desconhecido "extra"/);
  assert.match(com(e => { e.rodadas[0].mesas.pop(); }).erros.join(" "), /ficou sem mesa/);
  assert.match(com(e => { e.rodadas[0].mesas[0].placar = "3-0"; }).erros[0], /placar inválido/);
  assert.match(com(e => { e.rodadas[0].fechada = true; }).erros[0], /fechada sem placar/);
  assert.match(com(e => { e.versao = 9; }).erros[0], /Versão/);
  assert.ok(!S.validarEstado(base, ["j1", "j2", "j3"]).ok, "jogador fora do cadastro");
  assert.ok(!S.validarEstado(null).ok);
  assert.ok(!S.validarEstado({ evento_id: EVENTO, versao: 1 }).ok);
});

/* Painel GLC RR — motor do torneio suíço, sem DOM (testável no Node).
   Regras em docs/REGRAS-LOCAIS.md (mesmas configurações do Challonge):
   melhor de 3; vitória 1 · empate 0,5 · bye 1 (2-0 no saldo); desempates: vitórias contra empatados,
   Buchholz mediano, saldo de jogos, manual; pareamento por pontos sem revanche; 1ª rodada aleatória.
   O estado guarda só ids e números (vai para o aparelho e para o GLC-privado).
   Todas as funções que alteram o estado devolvem um estado NOVO e lançam Error com mensagem para a tela. */
(function (raiz) {
  "use strict";

  const VERSAO = 1;
  /* Melhor de 3 (quem faz 2 jogos já venceu). Vitória: 2-0, 2-1 ou 1-0; empate: 1-1 ou 0-0.
     Na ordem da tela: vitórias do jogador da esquerda, empates, vitórias do da direita. */
  const PLACARES = ["2-0", "2-1", "1-0", "1-1", "0-0", "0-1", "1-2", "0-2"];
  const MAX_RODADAS = 20;
  const LIMITE_BUSCA = 200000;
  const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const EVENTO = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const CHAVES_ESTADO = ["evento_id", "versao", "rodadas_previstas", "jogadores", "rodadas", "desempate_manual"];
  const CHAVES_JOGADOR = ["id", "entrou_na_rodada", "drop_apos_rodada", "tipo_pokemon"];
  const CHAVES_RODADA = ["numero", "fechada", "mesas"];
  const CHAVES_MESA = ["mesa", "a", "b", "placar"];

  const copia = e => JSON.parse(JSON.stringify(e));
  const falha = msg => { throw new Error(msg); };
  const idValido = id => typeof id === "string" && id.length <= 40 && ID.test(id);
  const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const chave = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const soma = l => l.reduce((s, v) => s + v, 0);
  const limparTipo = t => String(t ?? "").trim().replace(/\s+/g, " ").slice(0, 30);

  /* ⌈log₂ n⌉; menos de 2 jogadores não dá torneio */
  function rodadasSugeridas(n) {
    if (!(n >= 2)) return 0;
    let r = 0;
    while (2 ** r < n) r++;
    return r;
  }

  const ultima = e => e.rodadas[e.rodadas.length - 1] || null;
  const rodadaAberta = e => { const r = ultima(e); return r && !r.fechada ? r : null; };
  const jogadorDo = (e, id) => e.jogadores.find(j => j.id === id) || falha(`Jogador "${id}" não está no torneio.`);
  const ativoNa = (j, numero) => j.entrou_na_rodada <= numero && (j.drop_apos_rodada === null || numero <= j.drop_apos_rodada);
  const encerrado = e => e.rodadas.length === e.rodadas_previstas && !rodadaAberta(e);

  function novoTorneio(eventoId, ids, opcoes) {
    const o = opcoes || {};
    if (!EVENTO.test(String(eventoId || ""))) falha("Evento inválido.");
    const lista = (ids || []).map(String);
    if (lista.length < 2) falha("Inclua pelo menos 2 jogadores.");
    lista.forEach(id => { if (!idValido(id)) falha(`Id de jogador inválido: "${id}".`); });
    if (new Set(lista).size !== lista.length) falha("Há jogador repetido na lista.");
    const rodadas = o.rodadas === undefined ? rodadasSugeridas(lista.length) : Number(o.rodadas);
    if (!inteiro(rodadas, 1, MAX_RODADAS)) falha(`Número de rodadas deve ser de 1 a ${MAX_RODADAS}.`);
    const tipos = o.tipos || {};
    return {
      evento_id: eventoId,
      versao: VERSAO,
      rodadas_previstas: rodadas,
      jogadores: lista.map(id => {
        const j = { id, entrou_na_rodada: 1, drop_apos_rodada: null };
        const t = limparTipo(tipos[id]);
        if (t) j.tipo_pokemon = t;
        return j;
      }),
      rodadas: [],
      desempate_manual: []
    };
  }

  function definirRodadas(estado, n) {
    const e = copia(estado);
    n = Number(n);
    if (!inteiro(n, 1, MAX_RODADAS)) falha(`Número de rodadas deve ser de 1 a ${MAX_RODADAS}.`);
    if (n < e.rodadas.length) falha(`Já foram pareadas ${e.rodadas.length} rodadas.`);
    e.rodadas_previstas = n;
    return e;
  }

  function definirTipo(estado, id, tipo) {
    const e = copia(estado);
    const j = jogadorDo(e, id);
    const t = limparTipo(tipo);
    if (t) j.tipo_pokemon = t; else delete j.tipo_pokemon;
    return e;
  }

  /* Antes da 1ª rodada entra normalmente; depois, como atrasado: perde as rodadas já pareadas (0 ponto, 0-2) */
  function incluirJogador(estado, id, tipo) {
    const e = copia(estado);
    if (!idValido(id)) falha(`Id de jogador inválido: "${id}".`);
    if (e.jogadores.some(j => j.id === id)) falha("Este jogador já está no torneio.");
    const entrou = e.rodadas.length + 1;
    if (entrou > e.rodadas_previstas) falha("Todas as rodadas previstas já foram pareadas.");
    const j = { id, entrou_na_rodada: entrou, drop_apos_rodada: null };
    const t = limparTipo(tipo);
    if (t) j.tipo_pokemon = t;
    e.jogadores.push(j);
    return e;
  }

  /* Só quem ainda não está em nenhuma mesa (ex.: lista montada errada antes da 1ª rodada) */
  function removerJogador(estado, id) {
    const e = copia(estado);
    jogadorDo(e, id);
    if (e.rodadas.some(r => r.mesas.some(m => m.a === id || m.b === id))) falha("Jogador já tem mesa: use o drop.");
    e.jogadores = e.jogadores.filter(j => j.id !== id);
    e.desempate_manual = e.desempate_manual.filter(x => x !== id);
    return e;
  }

  /* Sai depois da última rodada pareada (se ela estiver aberta e ele tiver mesa, o placar dele ainda é lançado) */
  function dropJogador(estado, id) {
    const e = copia(estado);
    const j = jogadorDo(e, id);
    if (j.drop_apos_rodada !== null) falha("Este jogador já saiu do torneio.");
    j.drop_apos_rodada = e.rodadas.length;
    return e;
  }

  function desfazerDrop(estado, id) {
    const e = copia(estado);
    const j = jogadorDo(e, id);
    if (j.drop_apos_rodada === null) falha("Este jogador não saiu do torneio.");
    if (j.drop_apos_rodada < e.rodadas.length) falha("Ele já ficou fora de uma rodada pareada.");
    j.drop_apos_rodada = null;
    return e;
  }

  /* Pareamento sem revanche: cada jogador, de cima para baixo, pega o adversário mais próximo na ordem
     com quem ainda não jogou; se o resto travar, volta atrás e tenta o próximo. ordem.length precisa ser par. */
  function parearOrdem(ordem, jogaram) {
    if (ordem.length % 2) return null;
    const usados = new Set();
    const pares = [];
    let passos = 0;
    function busca(i) {
      while (i < ordem.length && usados.has(ordem[i])) i++;
      if (i >= ordem.length) return true;
      if (++passos > LIMITE_BUSCA) return false;
      const a = ordem[i];
      usados.add(a);
      for (let k = i + 1; k < ordem.length && passos <= LIMITE_BUSCA; k++) {
        const b = ordem[k];
        if (usados.has(b) || jogaram.has(chave(a, b))) continue;
        usados.add(b);
        pares.push([a, b]);
        if (busca(i + 1)) return true;
        pares.pop();
        usados.delete(b);
      }
      usados.delete(a);
      return false;
    }
    return busca(0) ? pares : null;
  }

  /* Versão pública para testes: jogaram = lista de pares [a, b] */
  const emparelhar = (ordem, jogaram) => parearOrdem(ordem, new Set((jogaram || []).map(([a, b]) => chave(a, b))));

  function embaralhar(lista, sorteio) {
    const l = lista.slice();
    for (let i = l.length - 1; i > 0; i--) {
      const k = Math.min(i, Math.floor(sorteio() * (i + 1)));
      [l[i], l[k]] = [l[k], l[i]];
    }
    return l;
  }

  /* Pareia a próxima rodada. 1ª rodada: ordem aleatória (sorteio injetável); depois, pela classificação.
     Ímpar: bye para o pior colocado sem bye (quem já teve bye só recebe outro se não houver alternativa). */
  function parear(estado, sorteio) {
    const e = copia(estado);
    if (rodadaAberta(e)) falha("Feche a rodada atual antes de parear a próxima.");
    const numero = e.rodadas.length + 1;
    if (numero > e.rodadas_previstas) falha("Todas as rodadas previstas já foram jogadas.");
    const ativos = new Set(e.jogadores.filter(j => ativoNa(j, numero)).map(j => j.id));
    if (ativos.size < 2) falha("Há menos de 2 jogadores ativos.");

    const jogaram = new Set();
    const byes = new Map();
    e.rodadas.forEach(r => r.mesas.forEach(m => {
      if (m.b === null) byes.set(m.a, (byes.get(m.a) || 0) + 1);
      else jogaram.add(chave(m.a, m.b));
    }));

    const ordem = numero === 1
      ? embaralhar([...ativos], sorteio || Math.random)
      : classificacao(e).map(l => l.jogador_id).filter(id => ativos.has(id));

    let pares = null;
    let bye = null;
    if (ordem.length % 2 === 0) {
      pares = parearOrdem(ordem, jogaram);
    } else {
      /* De baixo para cima; menos byes primeiro (sort estável mantém a ordem de baixo para cima) */
      const candidatos = ordem.slice().reverse().sort((x, y) => (byes.get(x) || 0) - (byes.get(y) || 0));
      for (const c of candidatos) {
        pares = parearOrdem(ordem.filter(id => id !== c), jogaram);
        if (pares) { bye = c; break; }
      }
    }
    if (!pares) falha(`Não há pareamento sem revanche para a rodada ${numero}. Diminua o número de rodadas.`);

    const mesas = pares.map(([a, b], i) => ({ mesa: i + 1, a, b, placar: null }));
    if (bye) mesas.push({ mesa: mesas.length + 1, a: bye, b: null, placar: "bye" });
    e.rodadas.push({ numero, fechada: false, mesas });
    return e;
  }

  /* Só a última rodada aceita placar (corrigir uma rodada fechada exige cancelar a seguinte, se houver) */
  function registrarPlacar(estado, numero, mesa, placar) {
    const e = copia(estado);
    const r = ultima(e);
    if (!r || r.numero !== Number(numero)) falha("Só a última rodada pode ser alterada.");
    const m = r.mesas.find(x => x.mesa === Number(mesa)) || falha(`Mesa ${mesa} não existe.`);
    if (m.placar === "bye") falha("A mesa do bye não tem placar.");
    if (placar === null || placar === "") {
      if (r.fechada) falha("A rodada já foi fechada: escolha um placar.");
      m.placar = null;
    } else if (PLACARES.includes(placar)) {
      m.placar = placar;
    } else falha(`Placar inválido: "${placar}".`);
    return e;
  }

  function fecharRodada(estado) {
    const e = copia(estado);
    const r = rodadaAberta(e) || falha("Não há rodada aberta.");
    const faltam = r.mesas.filter(m => !m.placar).map(m => m.mesa);
    if (faltam.length) falha(`Falta o placar ${faltam.length > 1 ? "das mesas" : "da mesa"} ${faltam.join(", ")}.`);
    r.fechada = true;
    return e;
  }

  /* Desfaz o pareamento da rodada aberta (para parear de novo depois de um drop ou de uma inclusão) */
  function cancelarRodada(estado) {
    const e = copia(estado);
    if (!rodadaAberta(e)) falha("Não há rodada aberta.");
    e.rodadas.pop();
    const n = e.rodadas.length;
    e.jogadores.forEach(j => {
      if (j.entrou_na_rodada > n + 1) j.entrou_na_rodada = n + 1;
      if (j.drop_apos_rodada !== null && j.drop_apos_rodada > n) j.drop_apos_rodada = n;
    });
    return e;
  }

  /* Números de cada jogador nas rodadas FECHADAS */
  function estatisticas(e) {
    const est = new Map();
    e.jogadores.forEach(j => est.set(j.id, {
      id: j.id, pontos: 0, vitorias: 0, derrotas: 0, empates: 0, jogos_v: 0, jogos_p: 0, byes: 0, adversarios: [], venceu: []
    }));
    e.rodadas.filter(r => r.fechada).forEach(r => {
      /* Atrasado: rodada anterior à entrada = derrota 0-2, sem adversário */
      e.jogadores.forEach(j => {
        if (r.numero < j.entrou_na_rodada) { const s = est.get(j.id); s.derrotas++; s.jogos_p += 2; }
      });
      r.mesas.forEach(m => {
        const A = est.get(m.a);
        if (m.b === null) { A.vitorias++; A.pontos += 1; A.jogos_v += 2; A.byes++; return; }
        const B = est.get(m.b);
        const [x, y] = m.placar.split("-").map(Number);
        A.jogos_v += x; A.jogos_p += y; B.jogos_v += y; B.jogos_p += x;
        A.adversarios.push(m.b); B.adversarios.push(m.a);
        if (x > y) { A.vitorias++; A.pontos += 1; A.venceu.push(m.b); B.derrotas++; }
        else if (x < y) { B.vitorias++; B.pontos += 1; B.venceu.push(m.a); A.derrotas++; }
        else { A.empates++; B.empates++; A.pontos += 0.5; B.pontos += 0.5; }
      });
    });
    return est;
  }

  /* Classificação com os desempates. Grupos que continuam empatados nos 4 critérios usam
     desempate_manual; desempate_pendente = true enquanto faltar ordenar o grupo. */
  function classificacao(estado) {
    const est = estatisticas(estado);
    const linhas = [...est.values()].map(s => {
      const ptsAdv = s.adversarios.map(id => est.get(id).pontos).sort((a, b) => a - b);
      return {
        ...s,
        vce: s.venceu.filter(id => est.get(id).pontos === s.pontos).length,
        buchholz: ptsAdv.length >= 3 ? soma(ptsAdv.slice(1, -1)) : soma(ptsAdv),
        saldo: s.jogos_v - s.jogos_p
      };
    });
    const criterios = (a, b) => b.pontos - a.pontos || b.vce - a.vce || b.buchholz - a.buchholz || b.saldo - a.saldo;
    const manual = new Map((estado.desempate_manual || []).map((id, i) => [id, i]));
    const pos = id => (manual.has(id) ? manual.get(id) : Infinity);
    linhas.sort((a, b) => criterios(a, b) || pos(a.id) - pos(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const porId = new Map(estado.jogadores.map(j => [j.id, j]));
    const saida = linhas.map((l, i) => {
      const j = porId.get(l.id);
      const linha = {
        posicao: i + 1, jogador_id: l.id, pontos: l.pontos,
        vitorias: l.vitorias, derrotas: l.derrotas, empates: l.empates,
        jogos_v: l.jogos_v, jogos_p: l.jogos_p, saldo: l.saldo,
        vce: l.vce, buchholz: l.buchholz, byes: l.byes,
        drop: j.drop_apos_rodada !== null && j.drop_apos_rodada < estado.rodadas_previstas,
        empatados: null, desempate_pendente: false
      };
      if (j.tipo_pokemon) linha.tipo_pokemon = j.tipo_pokemon;
      return linha;
    });
    /* Grupos empatados em tudo */
    for (let i = 0; i < linhas.length;) {
      let k = i + 1;
      while (k < linhas.length && criterios(linhas[i], linhas[k]) === 0) k++;
      if (k - i > 1) {
        const grupo = linhas.slice(i, k).map(l => l.id);
        const ordenados = grupo.filter(id => manual.has(id)).length;
        for (let x = i; x < k; x++) {
          saida[x].empatados = grupo;
          saida[x].desempate_pendente = ordenados < grupo.length - 1;
        }
      }
      i = k;
    }
    return saida;
  }

  /* ids = ordem escolhida pelo organizador para um grupo empatado */
  function desempatarManual(estado, ids) {
    const e = copia(estado);
    const lista = (ids || []).map(String);
    if (new Set(lista).size !== lista.length) falha("Há jogador repetido na ordem.");
    lista.forEach(id => jogadorDo(e, id));
    e.desempate_manual = e.desempate_manual.filter(x => !lista.includes(x)).concat(lista);
    return e;
  }

  /* Colocações no formato de resultados.json (bye conta como vitória no V-D-E). { colocacoes, erros } */
  function paraResultado(estado) {
    const erros = [];
    if (!encerrado(estado)) erros.push("O torneio ainda não terminou: feche todas as rodadas previstas.");
    const cl = classificacao(estado);
    const vistos = new Set();
    cl.filter(l => l.desempate_pendente).forEach(l => {
      const g = l.empatados.join(", ");
      if (!vistos.has(g)) { vistos.add(g); erros.push(`Desempate manual pendente entre: ${g}.`); }
    });
    if (erros.length) return { colocacoes: [], erros };
    const colocacoes = cl.map(l => {
      const c = { posicao: l.posicao, jogador_id: l.jogador_id, vitorias: l.vitorias, derrotas: l.derrotas, empates: l.empates };
      if (l.tipo_pokemon) c.tipo_pokemon = l.tipo_pokemon;
      if (l.drop) c.obs = "drop";
      return c;
    });
    return { colocacoes, erros };
  }

  /* Confere um rascunho lido do aparelho ou do GitHub. idsCadastrados (opcional) = ids de jogadores.json.
     Só aceita as chaves conhecidas, para garantir que nada pessoal entre no rascunho. { ok, erros } */
  function validarEstado(estado, idsCadastrados) {
    const erros = [];
    const err = m => { erros.push(m); };
    const ehObj = o => o && typeof o === "object" && !Array.isArray(o);
    const chavesExtras = (o, permitidas, onde) => Object.keys(o).filter(k => !permitidas.includes(k))
      .forEach(k => err(`${onde}: campo desconhecido "${k}".`));
    if (!ehObj(estado)) return { ok: false, erros: ["Rascunho inválido."] };
    chavesExtras(estado, CHAVES_ESTADO, "Torneio");
    if (!EVENTO.test(String(estado.evento_id || ""))) err("Evento inválido.");
    if (estado.versao !== VERSAO) err("Versão do rascunho desconhecida.");
    if (!Array.isArray(estado.jogadores) || !Array.isArray(estado.rodadas) || !Array.isArray(estado.desempate_manual)) {
      err("Faltam jogadores, rodadas ou desempate_manual.");
      return { ok: false, erros };
    }
    const nRod = estado.rodadas.length;
    if (!inteiro(estado.rodadas_previstas, 1, MAX_RODADAS) || estado.rodadas_previstas < nRod) err("Número de rodadas previstas inválido.");

    const cadastrados = idsCadastrados ? new Set(idsCadastrados) : null;
    const jogadores = new Map();
    estado.jogadores.forEach((j, i) => {
      const onde = `Jogador ${i + 1}`;
      if (!ehObj(j)) return err(`${onde}: inválido.`);
      chavesExtras(j, CHAVES_JOGADOR, onde);
      if (!idValido(j.id)) return err(`${onde}: id inválido.`);
      if (jogadores.has(j.id)) return err(`${onde}: "${j.id}" repetido.`);
      if (cadastrados && !cadastrados.has(j.id)) err(`${onde}: "${j.id}" não está cadastrado.`);
      if (!inteiro(j.entrou_na_rodada, 1, nRod + 1)) err(`${onde}: rodada de entrada inválida.`);
      if (j.drop_apos_rodada !== null && !inteiro(j.drop_apos_rodada, 0, nRod)) err(`${onde}: drop inválido.`);
      if (j.tipo_pokemon !== undefined && (typeof j.tipo_pokemon !== "string" || j.tipo_pokemon.length > 30)) err(`${onde}: tipo do deck inválido.`);
      jogadores.set(j.id, j);
    });
    if (jogadores.size < 2) err("O torneio precisa de pelo menos 2 jogadores.");

    estado.rodadas.forEach((r, i) => {
      const onde = `Rodada ${i + 1}`;
      if (!ehObj(r) || !Array.isArray(r.mesas)) return err(`${onde}: inválida.`);
      chavesExtras(r, CHAVES_RODADA, onde);
      if (r.numero !== i + 1) err(`${onde}: numeração fora de ordem.`);
      if (typeof r.fechada !== "boolean") err(`${onde}: "fechada" inválido.`);
      if (!r.fechada && i < nRod - 1) err(`${onde}: só a última rodada pode estar aberta.`);
      const naRodada = new Set();
      let byes = 0;
      r.mesas.forEach((m, k) => {
        const em = `${onde}, mesa ${k + 1}`;
        if (!ehObj(m)) return err(`${em}: inválida.`);
        chavesExtras(m, CHAVES_MESA, em);
        if (m.mesa !== k + 1) err(`${em}: numeração fora de ordem.`);
        [m.a, m.b].forEach(id => {
          if (id === null) return;
          if (!jogadores.has(id)) return err(`${em}: jogador "${id}" fora do torneio.`);
          if (naRodada.has(id)) err(`${em}: "${id}" em duas mesas.`);
          naRodada.add(id);
          if (!ativoNa(jogadores.get(id), i + 1)) err(`${em}: "${id}" não estava ativo nesta rodada.`);
        });
        if (m.a === null) err(`${em}: falta o jogador.`);
        if (m.b === null) {
          byes++;
          if (m.placar !== "bye") err(`${em}: mesa sem adversário precisa ser bye.`);
        } else if (m.placar === null) {
          if (r.fechada) err(`${em}: rodada fechada sem placar.`);
        } else if (!PLACARES.includes(m.placar)) err(`${em}: placar inválido.`);
      });
      if (byes > 1) err(`${onde}: mais de um bye.`);
      jogadores.forEach(j => {
        if (ativoNa(j, i + 1) && !naRodada.has(j.id)) err(`${onde}: "${j.id}" ficou sem mesa.`);
      });
    });

    const vistos = new Set();
    estado.desempate_manual.forEach(id => {
      if (!jogadores.has(id) || vistos.has(id)) err(`Desempate manual: "${id}" inválido ou repetido.`);
      vistos.add(id);
    });
    return { ok: erros.length === 0, erros };
  }

  const api = {
    VERSAO, PLACARES, rodadasSugeridas, novoTorneio, definirRodadas, definirTipo, incluirJogador, removerJogador,
    dropJogador, desfazerDrop, emparelhar, parear, registrarPlacar, fecharRodada, cancelarRodada,
    rodadaAberta, encerrado, classificacao, desempatarManual, paraResultado, validarEstado
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.RegrasSuico = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

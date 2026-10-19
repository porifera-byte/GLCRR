/* Painel GLC RR — regras de eventos e resultados, sem DOM (testável no Node).
   id do evento = AAAA-MM-DD-slug(nome). Depende de RegrasJogadores (slug, dataValida). */
(function (raiz) {
  "use strict";

  const RJ = raiz.RegrasJogadores || (typeof require === "function" ? require("./regras-jogadores.js") : null);

  const STATUS = ["", "Agendado", "Inscrições abertas", "Encerrado"];
  const OBS = ["", "empate", "drop"];
  const limpar = v => String(v ?? "").trim().replace(/\s+/g, " ");

  function idEvento(data, nome) {
    return `${data}-${RJ.slug(nome).slice(0, 40).replace(/-+$/, "")}`;
  }

  /* Mesmo critério do site (assets/js/data.js) */
  const formReal = url => /^https:\/\/(docs\.google\.com\/forms|forms\.gle)\//.test(url || "");

  /* Confere o formulário de evento. Devolve { dados, erros, avisos }. */
  function validarEvento(entrada, hoje, tipos) {
    const dados = {
      nome: limpar(entrada.nome),
      data: String(entrada.data || "").trim(),
      horario: String(entrada.horario || "").trim(),
      local: limpar(entrada.local),
      vagas: String(entrada.vagas ?? "").trim() === "" ? "" : Number(entrada.vagas),
      tipo: limpar(entrada.tipo),
      inscricao_url: String(entrada.inscricao_url || "").trim(),
      descricao: String(entrada.descricao || "").trim().replace(/\r\n/g, "\n"),
      status: String(entrada.status || "")
    };
    const erros = {};
    const avisos = [];
    if (dados.nome.length < 3 || dados.nome.length > 80) erros.nome = "Use de 3 a 80 caracteres.";
    if (!RJ.dataValida(dados.data)) erros.data = "Informe a data.";
    else if (dados.data < "2020-01-01" || dados.data > "2100-12-31") erros.data = "Confira o ano.";
    if (dados.horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dados.horario)) erros.horario = "Use o formato 14:00.";
    if (dados.local.length < 2 || dados.local.length > 80) erros.local = "Informe o local (até 80 caracteres).";
    if (dados.vagas !== "" && (!Number.isInteger(dados.vagas) || dados.vagas < 2 || dados.vagas > 512)) erros.vagas = "Informe um número entre 2 e 512, ou deixe em branco.";
    if (dados.tipo && !(tipos || []).includes(dados.tipo)) erros.tipo = "Escolha um tipo da lista.";
    if (dados.inscricao_url) {
      if (!/^https?:\/\/\S+$/.test(dados.inscricao_url) || dados.inscricao_url.length > 300) erros.inscricao_url = "Cole o link completo, começando com https://.";
      else if (!formReal(dados.inscricao_url)) avisos.push("O link não é de Google Forms (docs.google.com/forms ou forms.gle): o botão \"Inscreva-se\" não aparece no site.");
    }
    if (dados.descricao.length > 600) erros.descricao = `Use até 600 caracteres (agora: ${dados.descricao.length}).`;
    if (!STATUS.includes(dados.status)) erros.status = "Status inválido.";
    if (!erros.data && dados.data < hoje && dados.status === "Inscrições abertas") avisos.push("O evento já passou, mas o status está como \"Inscrições abertas\".");
    return { dados, erros, avisos };
  }

  /* Confere a classificação digitada.
     linhas: [{ posicao, jogador_id, vitorias, derrotas, empates, obs }] na ordem da tela.
     Devolve { colocacoes, erros: [texto], avisos: [texto] }. */
  function validarResultado(linhas, idsJogadores, dataEvento, hoje, tiposPokemon) {
    const erros = [];
    const avisos = [];
    const existentes = new Set(idsJogadores);
    const vistos = new Map();
    const inteiro = (v, max) => {
      const n = String(v ?? "").trim() === "" ? 0 : Number(v);
      return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
    };
    const colocacoes = [];
    if (!linhas.length) erros.push("Inclua pelo menos um jogador.");
    linhas.forEach((l, i) => {
      const n = i + 1;
      const c = {
        posicao: inteiro(l.posicao, 999),
        jogador_id: String(l.jogador_id || ""),
        vitorias: inteiro(l.vitorias, 30),
        derrotas: inteiro(l.derrotas, 30),
        empates: inteiro(l.empates, 30)
      };
      if (!c.jogador_id) erros.push(`Linha ${n}: escolha o jogador.`);
      else if (!existentes.has(c.jogador_id)) erros.push(`Linha ${n}: jogador "${c.jogador_id}" não está cadastrado.`);
      else if (vistos.has(c.jogador_id)) erros.push(`Linha ${n}: jogador repetido (já está na linha ${vistos.get(c.jogador_id)}).`);
      else vistos.set(c.jogador_id, n);
      if (!c.posicao) erros.push(`Linha ${n}: posição inválida.`);
      ["vitorias", "derrotas", "empates"].forEach(k => {
        if (c[k] === null) erros.push(`Linha ${n}: ${k} deve ser um número de 0 a 30.`);
      });
      /* Tipo do deck: opcional, para todos os jogadores; da lista de config.json quando houver */
      const tipo = limpar(l.tipo_pokemon);
      if (tipo.length > 30) erros.push(`Linha ${n}: tipo do deck com mais de 30 caracteres.`);
      else if (tipo && tiposPokemon && tiposPokemon.length && !tiposPokemon.includes(tipo)) erros.push(`Linha ${n}: tipo do deck "${tipo}" fora da lista.`);
      else if (tipo) c.tipo_pokemon = tipo;
      const obs = String(l.obs || "");
      if (!OBS.includes(obs)) erros.push(`Linha ${n}: observação inválida.`);
      else if (obs) c.obs = obs;
      colocacoes.push(c);
    });
    if (erros.length) return { colocacoes: [], erros, avisos };

    colocacoes.sort((a, b) => a.posicao - b.posicao);
    /* Posição repetida só com "empate" em todas as linhas empatadas */
    const porPosicao = new Map();
    colocacoes.forEach(c => porPosicao.set(c.posicao, (porPosicao.get(c.posicao) || []).concat(c)));
    porPosicao.forEach((grupo, pos) => {
      if (grupo.length > 1 && grupo.some(c => c.obs !== "empate")) {
        erros.push(`${pos}º lugar repetido: marque "empate" na observação de todos os empatados.`);
      }
    });
    /* Buracos na classificação: 1, 2, 4 sem empate antes */
    let esperado = 1;
    [...porPosicao.keys()].sort((a, b) => a - b).forEach(pos => {
      if (pos !== esperado) avisos.push(`A classificação pula do ${esperado - 1 || "início"} para o ${pos}º lugar.`);
      esperado = pos + porPosicao.get(pos).length;
    });
    if (pos1(colocacoes) === 0) erros.push("Ninguém está em 1º lugar.");
    const v = colocacoes.reduce((s, c) => s + c.vitorias, 0);
    const d = colocacoes.reduce((s, c) => s + c.derrotas, 0);
    if (v !== d) avisos.push(`Total de vitórias (${v}) diferente do total de derrotas (${d}). É normal se houve bye; senão, confira.`);
    if (dataEvento && dataEvento > hoje) avisos.push("A data do evento ainda não chegou.");
    return { colocacoes: erros.length ? [] : colocacoes, erros, avisos };
  }

  /* ---------- Decklists do Top 3 ---------- */

  /* assets/img/decklists/[evento_id]-[posicao]-[jogador_id].jpg; no JSON vai com ?v=<data e hora> para o navegador
     não mostrar a imagem antiga do cache quando ela é trocada */
  const DECKLIST_VALIDA = /^assets\/img\/decklists\/[a-z0-9-]+\.(png|jpg|jpeg|webp)(\?v=\d{14})?$/;
  function caminhoDecklist(eventoId, posicao, jogadorId, extensao) {
    return `assets/img/decklists/${eventoId}-${posicao}-${jogadorId}.${extensao || "jpg"}`;
  }
  function carimbo(agora) {
    const d = agora || new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  }
  const semVersao = caminho => String(caminho || "").split("?")[0];

  function validarDecklist(entrada) {
    /* O tipo do deck fica na linha do resultado (resultados.json), não na decklist */
    const dados = { lista_texto: String(entrada.lista_texto || "").trim().replace(/\r\n/g, "\n") };
    const erros = {};
    if (dados.lista_texto.length > 3000) erros.lista_texto = `Use até 3000 caracteres (agora: ${dados.lista_texto.length}).`;
    return { dados, erros };
  }

  /* Depois de corrigir um resultado: atualiza a posição das decklists do evento.
     Quem saiu do Top 3 (ou do resultado) com decklist cadastrada bloqueia a publicação. */
  function ajustarDecklists(decklists, eventoId, colocacoes, apelido) {
    const erros = [];
    let mudou = false;
    const lista = decklists.map(d => {
      if (d.evento_id !== eventoId) return d;
      const c = colocacoes.find(x => x.jogador_id === d.jogador_id);
      if (!c || c.posicao > 3) {
        erros.push(`${apelido ? apelido(d.jogador_id) : d.jogador_id} tem decklist cadastrada, mas ${c ? `ficou em ${c.posicao}º` : "saiu do resultado"}. Apague a decklist antes.`);
        return d;
      }
      if (c.posicao !== d.posicao) { mudou = true; return { ...d, posicao: c.posicao }; }
      return d;
    });
    return { lista, erros, mudou };
  }

  const pos1 = colocacoes => colocacoes.filter(c => c.posicao === 1).length;

  const api = { STATUS, OBS, idEvento, formReal, validarEvento, validarResultado, DECKLIST_VALIDA, caminhoDecklist, carimbo, semVersao, validarDecklist, ajustarDecklists };
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.RegrasEventos = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

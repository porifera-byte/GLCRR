/* Painel GLC RR — tela do Torneio suíço (motor em regras-suico.js).
   Fluxo: escolher o evento → marcar os jogadores (com tipo do deck) → parear → placares por toque → fechar rodada
   → classificação → desempate manual → conferência (Template B) → publicar em data/resultados.json.
   Rascunho: localStorage a cada ação; GLC-privado rascunhos/<evento_id>.json ao começar e a cada rodada fechada.
   O rascunho guarda só ids e números. Mensagens de commit levam só ids. */
(function () {
  "use strict";

  const S = RegrasSuico;
  const RE = RegrasEventos;
  const RJ = RegrasJogadores;
  const PREFIXO = "glcrr-suico-";
  const PASTA = "rascunhos";
  const arqRascunho = id => `${PASTA}/${id}.json`;
  let recado = "";

  function mostrarMensagem(el, texto, tipo) {
    el.textContent = texto;
    el.classList.toggle("erro", tipo === "erro");
    el.classList.toggle("ok", tipo === "ok");
  }

  /* Rascunho no aparelho: { estado, salvo_em } */
  const local = {
    ler(id) {
      try {
        const w = JSON.parse(localStorage.getItem(PREFIXO + id) || "null");
        return w && w.estado ? w : null;
      } catch (e) { return null; }
    },
    gravar(id, estado) {
      try { localStorage.setItem(PREFIXO + id, JSON.stringify({ estado, salvo_em: new Date().toISOString() })); } catch (e) { /* sem espaço: segue só com o GitHub */ }
    },
    apagar(id) { try { localStorage.removeItem(PREFIXO + id); } catch (e) { /* nada */ } },
    ids() {
      try {
        return Object.keys(localStorage).filter(k => k.startsWith(PREFIXO)).map(k => k.slice(PREFIXO.length));
      } catch (e) { return []; }
    }
  };

  const fechadas = estado => estado.rodadas.filter(r => r.fechada).length;
  const pts = n => n.toLocaleString("pt-BR");
  const PLACAR_ROTULO = { "2-0": "2-0", "2-1": "2-1", "1-1": "1-1", "1-2": "1-2", "0-2": "0-2" };

  /* ---------- Lista de eventos ---------- */

  async function lista(tela) {
    tela.innerHTML = `
      <div><p class="eyebrow">Melhor de 3</p><h1 id="titulo-tela" tabindex="-1">Torneio suíço</h1></div>
      <p class="lead">Escolha o evento. O painel pareia as rodadas, calcula a classificação com os desempates e, no fim, publica o resultado.</p>
      <p class="adm-msg" id="msg-lista" role="status" aria-live="polite">Carregando…</p>
      <div id="lista-suico" aria-busy="true"></div>`;
    const msg = tela.querySelector("#msg-lista");
    let d, remotos;
    try {
      [d, remotos] = await Promise.all([PainelResultados.carregar(), GitHub.listar("privado", PASTA)]);
    } catch (e) {
      if (tela.isConnected) mostrarMensagem(msg, e.message, "erro");
      return;
    }
    if (!tela.isConnected) return;
    mostrarMensagem(msg, recado, recado ? "ok" : "");
    recado = "";
    const andamento = new Set(local.ids().concat(remotos.filter(n => n.endsWith(".json")).map(n => n.slice(0, -5))));
    const hoje = hojeBV();
    const comResultado = id => d.resultados.some(r => r.evento_id === id);
    const emAndamento = d.eventos.filter(e => andamento.has(e.id));
    const livres = d.eventos.filter(e => !andamento.has(e.id) && !comResultado(e.id));
    const proximos = livres.filter(e => e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));
    const anteriores = livres.filter(e => e.data < hoje).sort((a, b) => b.data.localeCompare(a.data));
    const publicados = d.eventos.filter(e => !andamento.has(e.id) && comResultado(e.id)).sort((a, b) => b.data.localeCompare(a.data));
    const cartoes = l => `<div class="list">${l.map(e => PainelEventos.cartaoEvento(e, d, "suico")).join("")}</div>`;
    const caixa = tela.querySelector("#lista-suico");
    caixa.removeAttribute("aria-busy");
    caixa.className = "adm-grupos";
    caixa.innerHTML = `
      ${emAndamento.length ? `<div class="group-title">Em andamento</div>${cartoes(emAndamento)}` : ""}
      <div class="group-title">De hoje e próximos</div>
      ${proximos.length ? cartoes(proximos) : `<div class="empty"><b>Nenhum evento de hoje ou futuro sem resultado.</b>Cadastre o evento em <a href="#eventos/novo">Eventos</a>.</div>`}
      ${anteriores.length ? `<details class="adm-mais"><summary>Anteriores sem resultado (${anteriores.length})</summary>${cartoes(anteriores)}</details>` : ""}
      ${publicados.length ? `<details class="adm-mais"><summary>Com resultado publicado (${publicados.length})</summary>
        <p class="adm-nota">Rodar o suíço de novo substitui o resultado publicado.</p>${cartoes(publicados)}</details>` : ""}`;
  }

  /* ---------- Torneio ---------- */

  /* Escolhe o rascunho mais adiantado entre o aparelho e o GitHub */
  function escolherRascunho(eventoId, loc, rem) {
    const valido = w => w && w.estado && w.estado.evento_id === eventoId && S.validarEstado(w.estado).ok;
    const a = valido(loc) ? loc : null;
    const b = valido(rem) ? rem : null;
    const avisos = [];
    if (loc && !a) avisos.push("O rascunho deste aparelho estava inválido e foi ignorado.");
    if (rem && !b) avisos.push("O rascunho do GitHub estava inválido e foi ignorado.");
    if (!a && !b) return { w: null, origem: "", avisos };
    if (!a || !b) return { w: a || b, origem: a ? "aparelho" : "GitHub", avisos };
    const fa = fechadas(a.estado);
    const fb = fechadas(b.estado);
    const usaLocal = fa !== fb ? fa > fb : String(a.salvo_em) >= String(b.salvo_em);
    return { w: usaLocal ? a : b, origem: usaLocal ? "aparelho" : "GitHub", avisos };
  }

  async function torneio(tela, eventoId) {
    tela.innerHTML = `
      <a class="link-voltar" href="#suico">‹ Torneio suíço</a>
      <h1 id="titulo-tela" tabindex="-1">Carregando…</h1>
      <p class="adm-msg" id="msg-topo" role="status" aria-live="polite"></p>`;
    const msgTopo = tela.querySelector("#msg-topo");
    let d, rem;
    try {
      [d, rem] = await Promise.all([PainelResultados.carregar(), GitHub.lerJSON("privado", arqRascunho(eventoId), null)]);
    } catch (e) {
      if (tela.isConnected) mostrarMensagem(msgTopo, e.message, "erro");
      return;
    }
    if (!tela.isConnected) return;
    const ev = d.eventos.find(e => e.id === eventoId);
    if (!ev) {
      tela.querySelector("h1").textContent = "Evento não encontrado";
      mostrarMensagem(msgTopo, "Confira o endereço ou volte para a lista.", "erro");
      return;
    }
    tela.querySelector("h1").textContent = ev.nome;
    const existente = d.resultados.find(r => r.evento_id === ev.id);
    const escolha = escolherRascunho(ev.id, local.ler(ev.id), rem.dados);
    let estado = escolha.w ? escolha.w.estado : null;
    if (recado) { mostrarMensagem(msgTopo, recado, "ok"); recado = ""; }
    else if (estado) mostrarMensagem(msgTopo, `Torneio retomado (rascunho do ${escolha.origem}).`, "ok");
    if (escolha.avisos.length) mostrarMensagem(msgTopo, escolha.avisos.join(" "), "erro");

    const apelido = id => (d.jogadores.find(j => j.id === id) || {}).apelido || id;
    const tiposPokemon = d.tiposPokemon || [];
    const opcoesTipo = sel => `<option value="">—</option>` +
      tiposPokemon.map(t => `<option ${t === sel ? "selected" : ""}>${esc(t)}</option>`).join("") +
      (sel && !tiposPokemon.includes(sel) ? `<option selected>${esc(sel)}</option>` : "");
    const campoTipo = (nome, valor, rotulo) => tiposPokemon.length
      ? `<select name="${nome}" aria-label="${esc(rotulo)}">${opcoesTipo(valor)}</select>`
      : `<input name="${nome}" maxlength="30" autocomplete="off" placeholder="Tipo" aria-label="${esc(rotulo)}" value="${esc(valor || "")}">`;

    const info = document.createElement("p");
    info.className = "lead";
    info.innerHTML = `${[dataBR(ev.data), ev.local, ev.tipo].filter(Boolean).map(esc).join(" · ")}
      ${existente ? ` · <span class="pill warn">já tem resultado publicado</span>` : ""}`;
    const corpo = document.createElement("div");
    corpo.className = "adm-form adm-suico";
    const msgRemoto = document.createElement("p");
    msgRemoto.className = "adm-msg";
    msgRemoto.setAttribute("role", "status");
    msgRemoto.setAttribute("aria-live", "polite");
    tela.append(info, corpo, msgRemoto);

    /* ---- Gravação ---- */

    function guardar(novo) {
      estado = novo;
      local.gravar(ev.id, estado);
    }

    async function salvarRemoto(motivo) {
      const meu = estado;
      mostrarMensagem(msgRemoto, "Salvando o rascunho no GitHub…");
      try {
        await GitHub.atualizarJSON("privado", arqRascunho(ev.id), atual => {
          if (atual && atual.estado && atual.estado.evento_id === ev.id && fechadas(atual.estado) > fechadas(meu)) {
            throw new Error("O rascunho do GitHub tem mais rodadas fechadas (outro aparelho?). Recarregue a página para continuar por ele.");
          }
          return { estado: meu, salvo_em: new Date().toISOString() };
        }, `Rascunho do suíço ${ev.id}: ${motivo}`, null);
        if (tela.isConnected) mostrarMensagem(msgRemoto, "Rascunho salvo no GitHub (repositório privado).", "ok");
      } catch (e) {
        if (tela.isConnected) mostrarMensagem(msgRemoto, `Rascunho guardado só neste aparelho: ${e.message}`, "erro");
      }
    }

    /* Aplica uma ação do motor; erro vira mensagem. Devolve true se deu certo. */
    function agir(fn, msgEl) {
      try {
        guardar(fn(estado));
        return true;
      } catch (e) {
        mostrarMensagem(msgEl || msgTopo, e.message, "erro");
        return false;
      }
    }

    /* Redesenha e devolve o foco ao elemento equivalente */
    function desenhar(foco) {
      if (!tela.isConnected) return;
      corpo.innerHTML = "";
      if (!estado) montar();
      else andamento();
      if (foco) {
        const alvo = corpo.querySelector(foco);
        if (alvo) alvo.focus({ preventScroll: false });
      }
    }

    /* ---- "+ Novo jogador" (cadastro rápido, reaproveita tela-jogadores.js) ---- */

    function blocoNovoJogador(aoCriar) {
      const det = document.createElement("details");
      det.className = "adm-mais adm-novo-jog";
      det.innerHTML = `
        <summary>+ Novo jogador</summary>
        <div class="adm-grupo">
          <p class="adm-nota">Cadastro rápido com o apelido. Nome e nascimento ficam para depois, em Jogadores.</p>
          <label class="campo"><span>Apelido *</span><input name="nj_apelido" maxlength="30" autocomplete="off" autocapitalize="words"></label>
          <label class="campo"><span>Cidade</span><input name="nj_cidade" maxlength="40" autocomplete="off" placeholder="Opcional"></label>
          <div class="adm-alerta" data-parecidos hidden></div>
          <button class="btn btn-line adm-btn" type="button" data-acao="cadastrar">Cadastrar e incluir</button>
          <p class="adm-msg" role="status" aria-live="polite"></p>
        </div>`;
      const apel = det.querySelector("[name=nj_apelido]");
      const cid = det.querySelector("[name=nj_cidade]");
      const caixaPar = det.querySelector("[data-parecidos]");
      const msg = det.querySelector(".adm-msg");
      const botao = det.querySelector("[data-acao=cadastrar]");
      let confirmouNovo = false;
      apel.addEventListener("input", () => { confirmouNovo = false; caixaPar.hidden = true; });

      async function cadastrar() {
        const texto = apel.value.trim();
        if (!texto) { mostrarMensagem(msg, "Informe o apelido.", "erro"); apel.focus(); return; }
        const parecidos = RJ.parecidosCom(texto, d.jogadores);
        if (parecidos.length && !confirmouNovo) {
          caixaPar.innerHTML = `<p><b>Já existe apelido parecido.</b> É o mesmo jogador?</p>
            <div class="adm-acoes">${parecidos.map(j => `<button class="btn btn-line" type="button" data-mesmo="${esc(j.id)}">Sim, é ${esc(j.apelido)}</button>`).join("")}
            <button class="btn btn-line" type="button" data-novo>Não, é um jogador novo</button></div>`;
          caixaPar.hidden = false;
          mostrarMensagem(msg, "", "");
          caixaPar.querySelector("button").focus();
          return;
        }
        botao.disabled = true;
        mostrarMensagem(msg, "Cadastrando…");
        try {
          const reg = await PainelJogadores.cadastrarRapido({ apelido: texto, cidade: cid.value });
          d.jogadores.push(reg);
          aoCriar(reg.id, `${reg.apelido} cadastrado. O site atualiza em cerca de 1 minuto.`);
        } catch (e) {
          mostrarMensagem(msg, e.message, "erro");
          botao.disabled = false;
        }
      }
      caixaPar.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-novo")) { confirmouNovo = true; caixaPar.hidden = true; cadastrar(); }
        else { caixaPar.hidden = true; aoCriar(b.dataset.mesmo, `${apelido(b.dataset.mesmo)} incluído.`); }
      });
      botao.addEventListener("click", cadastrar);
      apel.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); cadastrar(); } });
      return det;
    }

    /* ---- Montagem (antes de começar) ---- */

    const montagem = { marcados: new Map(), rodadas: "", editouRodadas: false, busca: "" };
    if (existente && !estado) {
      /* Sugere os jogadores e tipos do resultado publicado */
      existente.colocacoes.forEach(c => montagem.marcados.set(c.jogador_id, c.tipo_pokemon || ""));
    }

    function montar() {
      const ordenados = [...d.jogadores].sort((a, b) => a.apelido.localeCompare(b.apelido, "pt-BR"));
      const n = montagem.marcados.size;
      if (!montagem.editouRodadas) montagem.rodadas = String(S.rodadasSugeridas(n) || "");
      corpo.innerHTML = `
        <h2>Jogadores do torneio</h2>
        <p class="adm-nota">Marque quem vai jogar e, se quiser, o tipo do deck. Dá para incluir atrasados e dar drop durante o torneio.</p>
        <label class="campo adm-busca"><span>Buscar</span><input type="search" name="busca" autocomplete="off" value="${esc(montagem.busca)}" placeholder="Apelido"></label>
        <ul class="adm-sel-lista" id="sel-lista">
          ${ordenados.map(j => {
            const marcado = montagem.marcados.has(j.id);
            const visivel = !montagem.busca || RJ.semAcento(j.apelido).includes(RJ.semAcento(montagem.busca));
            return `<li class="adm-sel ${marcado ? "marcado" : ""}" data-id="${esc(j.id)}" ${visivel ? "" : "hidden"}>
              <label class="adm-check"><input type="checkbox" name="jogador" value="${esc(j.id)}" ${marcado ? "checked" : ""}><span>${esc(j.apelido)}</span></label>
              <span class="adm-sel-tipo">${marcado ? campoTipo("tipo", montagem.marcados.get(j.id), `Tipo do deck de ${j.apelido}`) : ""}</span>
            </li>`;
          }).join("")}
        </ul>
        <div data-novo></div>
        <div class="adm-grupo adm-resumo-torneio">
          <p><b id="n-sel">${n}</b> jogador(es) marcado(s)${n >= 2 ? ` · rodadas sugeridas: <b>${S.rodadasSugeridas(n)}</b>` : ""}</p>
          <label class="campo adm-campo-curto"><span>Rodadas</span>
            <input name="rodadas" type="number" inputmode="numeric" min="1" max="20" value="${esc(montagem.rodadas)}"></label>
          <button class="btn btn-ouro adm-btn" type="button" id="comecar" ${n < 2 ? "disabled" : ""}>Começar torneio</button>
          <p class="adm-msg" id="msg-montar" role="status" aria-live="polite"></p>
        </div>`;
      const listaEl = corpo.querySelector("#sel-lista");
      corpo.querySelector("[data-novo]").replaceWith(blocoNovoJogador((id, texto) => {
        montagem.marcados.set(id, montagem.marcados.get(id) || "");
        montagem.busca = "";
        desenhar(`[data-id="${id}"] input[type=checkbox]`);
        mostrarMensagem(corpo.querySelector("#msg-montar"), texto, "ok");
      }));
      corpo.querySelector("[name=busca]").addEventListener("input", e => {
        montagem.busca = e.target.value;
        const termo = RJ.semAcento(montagem.busca);
        listaEl.querySelectorAll("li").forEach(li => {
          li.hidden = !!termo && !RJ.semAcento(apelido(li.dataset.id)).includes(termo);
        });
      });
      listaEl.addEventListener("change", e => {
        const li = e.target.closest("li");
        if (!li) return;
        if (e.target.name === "jogador") {
          if (e.target.checked) montagem.marcados.set(li.dataset.id, "");
          else montagem.marcados.delete(li.dataset.id);
          desenhar(`[data-id="${li.dataset.id}"] input[type=checkbox]`);
        } else if (e.target.name === "tipo") {
          montagem.marcados.set(li.dataset.id, e.target.value);
        }
      });
      listaEl.addEventListener("input", e => {
        if (e.target.name === "tipo" && e.target.tagName === "INPUT") montagem.marcados.set(e.target.closest("li").dataset.id, e.target.value);
      });
      corpo.querySelector("[name=rodadas]").addEventListener("input", e => {
        montagem.rodadas = e.target.value;
        montagem.editouRodadas = true;
      });
      corpo.querySelector("#comecar").addEventListener("click", () => {
        const msg = corpo.querySelector("#msg-montar");
        const tipos = Object.fromEntries(montagem.marcados);
        const ok = agir(() => S.novoTorneio(ev.id, [...montagem.marcados.keys()], { rodadas: Number(montagem.rodadas), tipos }), msg);
        if (!ok) return;
        desenhar("#parear");
        salvarRemoto("início");
      });
    }

    /* ---- Torneio em andamento ---- */

    function andamento() {
      const aberta = S.rodadaAberta(estado);
      const nFech = fechadas(estado);
      const fim = S.encerrado(estado);
      const ativos = estado.jogadores.filter(j => j.drop_apos_rodada === null).length;
      corpo.innerHTML = `
        <div class="adm-situacao">
          <span class="pill">${estado.jogadores.length} jogadores</span>
          ${ativos !== estado.jogadores.length ? `<span class="pill">${ativos} ativos</span>` : ""}
          <span class="pill">${fim ? "rodadas encerradas" : `rodada ${aberta ? aberta.numero : nFech + 1} de ${estado.rodadas_previstas}`}</span>
        </div>
        <div data-rodada></div>
        <div data-final></div>
        <section class="adm-bloco" aria-labelledby="t-classif" data-classif></section>
        <div data-opcoes></div>`;
      const caixaRodada = corpo.querySelector("[data-rodada]");
      if (aberta) caixaRodada.replaceWith(blocoRodada(aberta, true));
      else if (!fim) {
        caixaRodada.outerHTML = `
          <div class="adm-acoes adm-proxima">
            <button class="btn btn-ouro adm-btn" type="button" id="parear">Parear a rodada ${nFech + 1}</button>
          </div>
          <p class="adm-msg" id="msg-parear" role="status" aria-live="polite"></p>`;
        corpo.querySelector("#parear").addEventListener("click", () => {
          if (agir(e => S.parear(e), corpo.querySelector("#msg-parear"))) desenhar(".adm-mesa button");
        });
      } else caixaRodada.remove();

      if (!aberta && nFech) {
        const ultima = estado.rodadas[estado.rodadas.length - 1];
        const det = document.createElement("details");
        det.className = "adm-mais";
        det.innerHTML = `<summary>Corrigir placar da rodada ${ultima.numero}</summary>`;
        det.appendChild(blocoRodada(ultima, false));
        det.open = corrigirAberto;
        det.addEventListener("toggle", () => { corrigirAberto = det.open; });
        corpo.querySelector(fim ? "[data-final]" : "[data-classif]").before(det);
      }

      if (fim) corpo.querySelector("[data-final]").replaceWith(blocoFinal());
      else corpo.querySelector("[data-final]").remove();
      if (nFech) desenharClassificacao(corpo.querySelector("[data-classif]"));
      else corpo.querySelector("[data-classif]").remove();
      corpo.querySelector("[data-opcoes]").replaceWith(blocoOpcoes());
    }

    /* Mesas com placar por toque. aberta = rodada em andamento (com fechar e refazer) */
    function blocoRodada(r, aberta) {
      const sec = document.createElement("section");
      sec.className = "adm-bloco";
      sec.setAttribute("aria-labelledby", `t-rodada-${r.numero}`);
      sec.innerHTML = `
        <h2 id="t-rodada-${r.numero}">Rodada ${r.numero}</h2>
        <p class="adm-nota">Placar na ordem da mesa: o primeiro número é do jogador da esquerda.</p>
        <ol class="adm-mesas">${r.mesas.map(m => htmlMesa(r, m)).join("")}</ol>
        ${aberta ? `
          <div class="adm-acoes">
            <button class="btn btn-ouro adm-btn" type="button" data-acao="fechar">Fechar a rodada ${r.numero}</button>
            <button class="btn btn-line adm-btn" type="button" data-acao="refazer">Refazer pareamento</button>
          </div>` : ""}
        <p class="adm-msg" role="status" aria-live="polite"></p>`;
      const msg = sec.querySelector(".adm-msg");
      sec.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.placar !== undefined) {
          const mesa = Number(b.closest("[data-mesa]").dataset.mesa);
          const novo = b.getAttribute("aria-pressed") === "true" && aberta ? null : b.dataset.placar;
          if (!agir(e2 => S.registrarPlacar(e2, r.numero, mesa, novo), msg)) return;
          if (!aberta) {
            corrigirAberto = true;
            desenhar(`[data-mesa="${mesa}"] [data-placar="${b.dataset.placar}"]`);
            salvarRemoto(`corrige rodada ${r.numero}`);
            return;
          }
          atualizarMesa(sec, r.numero, mesa);
        } else if (b.dataset.acao === "fechar") {
          if (!agir(e2 => S.fecharRodada(e2), msg)) return;
          desenhar(S.encerrado(estado) ? "#t-final" : "#parear");
          salvarRemoto(`rodada ${r.numero} fechada`);
        } else if (b.dataset.acao === "refazer") {
          if (b.dataset.confirma !== "1") {
            b.dataset.confirma = "1";
            b.textContent = "Toque de novo para refazer";
            mostrarMensagem(msg, "Os placares desta rodada serão perdidos.", "erro");
            setTimeout(() => { if (b.isConnected) { b.dataset.confirma = ""; b.textContent = "Refazer pareamento"; } }, 5000);
            return;
          }
          if (agir(e2 => S.cancelarRodada(e2), msg)) desenhar("#parear");
        }
      });
      atualizarBotaoFechar(sec, r.numero);
      return sec;
    }

    function htmlMesa(r, m) {
      if (m.b === null) {
        return `<li class="adm-mesa adm-mesa-bye" data-mesa="${m.mesa}">
          <span class="adm-mesa-n">Mesa ${m.mesa}</span>
          <div class="adm-mesa-jog"><b class="venceu">${esc(apelido(m.a))}</b><span class="adm-bye">bye · vitória 2-0</span></div>
        </li>`;
      }
      const [x, y] = m.placar ? m.placar.split("-").map(Number) : [0, 0];
      return `<li class="adm-mesa" data-mesa="${m.mesa}">
        <span class="adm-mesa-n">Mesa ${m.mesa}</span>
        <div class="adm-mesa-jog">
          <b class="${m.placar && x > y ? "venceu" : ""}">${esc(apelido(m.a))}</b>
          <span class="adm-x" aria-hidden="true">×</span>
          <b class="${m.placar && y > x ? "venceu" : ""}">${esc(apelido(m.b))}</b>
        </div>
        <div class="adm-placar" role="group" aria-label="Placar da mesa ${m.mesa}">
          ${S.PLACARES.map(p => {
            const [pa, pb] = p.split("-");
            return `<button type="button" class="btn btn-line" data-placar="${p}" aria-pressed="${m.placar === p}"
              aria-label="${esc(apelido(m.a))} ${pa}, ${esc(apelido(m.b))} ${pb}">${PLACAR_ROTULO[p]}</button>`;
          }).join("")}
        </div>
      </li>`;
    }

    /* Atualiza só a mesa tocada (o foco fica no botão) */
    function atualizarMesa(sec, numero, mesa) {
      const r = estado.rodadas.find(x => x.numero === numero);
      const m = r.mesas.find(x => x.mesa === mesa);
      const li = sec.querySelector(`[data-mesa="${mesa}"]`);
      li.querySelectorAll("[data-placar]").forEach(b => b.setAttribute("aria-pressed", String(m.placar === b.dataset.placar)));
      const [x, y] = m.placar ? m.placar.split("-").map(Number) : [0, 0];
      const nomes = li.querySelectorAll(".adm-mesa-jog b");
      nomes[0].classList.toggle("venceu", !!m.placar && x > y);
      nomes[1].classList.toggle("venceu", !!m.placar && y > x);
      atualizarBotaoFechar(sec, numero);
    }

    function atualizarBotaoFechar(sec, numero) {
      const b = sec.querySelector("[data-acao=fechar]");
      if (!b) return;
      const r = estado.rodadas.find(x => x.numero === numero);
      const faltam = r.mesas.filter(m => !m.placar).length;
      b.textContent = faltam ? `Fechar a rodada ${numero} (faltam ${faltam})` : `Fechar a rodada ${numero}`;
      b.setAttribute("aria-disabled", String(!!faltam));
    }

    function desenharClassificacao(sec) {
      const cl = S.classificacao(estado);
      const marca = l => (l.empatados ? (l.desempate_pendente && S.encerrado(estado) ? " ⚠️" : " =") : "");
      sec.innerHTML = `
        <h2 id="t-classif">Classificação</h2>
        <p class="adm-nota">Depois de ${fechadas(estado)} rodada(s) fechada(s). Desempates: vitórias contra empatados (VE), Buchholz mediano (Buch.) e saldo de jogos.${S.encerrado(estado) ? "" : " \"=\" marca empate em todos os critérios."}</p>
        <div class="table-box" role="region" aria-labelledby="t-classif" tabindex="0">
          <table class="adm-classif"><thead><tr><th>Pos.</th><th>Jogador</th><th>Pts</th><th>V-D-E</th><th><abbr title="Vitórias contra empatados">VE</abbr></th><th><abbr title="Buchholz mediano">Buch.</abbr></th><th>Saldo</th></tr></thead>
          <tbody>${cl.map(l => `<tr class="${l.drop ? "adm-drop" : ""}">
            <td>${l.posicao}º${marca(l)}</td>
            <td>${htmlTipo(l.tipo_pokemon, { base: "../" })}${esc(apelido(l.jogador_id))}${l.drop ? ` <span class="pill">drop</span>` : ""}</td>
            <td>${pts(l.pontos)}</td><td>${l.vitorias}-${l.derrotas}-${l.empates}</td><td>${l.vce}</td><td>${pts(l.buchholz)}</td><td>${l.saldo > 0 ? "+" : ""}${l.saldo}</td>
          </tr>`).join("")}</tbody></table>
        </div>`;
    }

    /* ---- Fim: desempate manual, conferência e publicação ---- */

    function blocoFinal() {
      const sec = document.createElement("section");
      sec.className = "adm-bloco";
      sec.setAttribute("aria-labelledby", "t-final");
      const cl = S.classificacao(estado);
      /* Grupos empatados em todos os critérios, na ordem atual da classificação */
      const grupos = [];
      const porChave = new Map();
      cl.filter(l => l.empatados).forEach(l => {
        const k = l.empatados.slice().sort().join(",");
        if (!porChave.has(k)) { porChave.set(k, { ids: [], pendente: l.desempate_pendente, pos: l.posicao }); grupos.push(porChave.get(k)); }
        porChave.get(k).ids.push(l.jogador_id);
      });
      const pendentes = grupos.filter(g => g.pendente).length;
      sec.innerHTML = `
        <h2 id="t-final" tabindex="-1">Fim do torneio</h2>
        ${grupos.length ? `
          <div class="adm-grupo">
            <p><b>Desempate manual</b> — ${pendentes ? `${pendentes} grupo(s) empatado(s) em todos os critérios. Ordene e confirme cada um.` : "todos os grupos já foram ordenados. Dá para mudar a ordem, se precisar."}</p>
            ${grupos.map((g, gi) => `
              <div class="adm-desempate ${g.pendente ? "pendente" : ""}" data-grupo="${gi}">
                <p class="adm-nota">A partir do ${g.pos}º lugar${g.pendente ? " · <b>⚠️ pendente</b>" : ""}</p>
                <ol class="adm-ordem">${g.ids.map((id, i) => `
                  <li data-id="${esc(id)}"><span>${esc(apelido(id))}</span>
                    <span class="adm-mover">
                      <button type="button" class="btn btn-line" data-mover="-1" aria-label="Subir ${esc(apelido(id))}" ${i === 0 ? "disabled" : ""}>↑</button>
                      <button type="button" class="btn btn-line" data-mover="1" aria-label="Descer ${esc(apelido(id))}" ${i === g.ids.length - 1 ? "disabled" : ""}>↓</button>
                    </span></li>`).join("")}</ol>
                <button type="button" class="btn btn-line adm-btn" data-confirmar>Confirmar esta ordem</button>
              </div>`).join("")}
          </div>` : ""}
        <div class="adm-alerta adm-alerta-erro" data-erros role="alert" tabindex="-1" hidden></div>
        <div class="adm-acoes"><button class="btn btn-ouro adm-btn" type="button" id="conferir">Conferir resultado</button></div>
        <div data-conferencia hidden></div>
        <p class="adm-msg" role="status" aria-live="polite"></p>`;
      const msg = sec.querySelector(".adm-msg");
      const caixaErros = sec.querySelector("[data-erros]");
      const caixaConf = sec.querySelector("[data-conferencia]");

      sec.querySelectorAll("[data-grupo]").forEach(div => {
        const ol = div.querySelector("ol");
        div.addEventListener("click", e => {
          const mover = e.target.closest("[data-mover]");
          if (mover) {
            const li = mover.closest("li");
            const alvo = Number(mover.dataset.mover) < 0 ? li.previousElementSibling : li.nextElementSibling;
            if (!alvo) return;
            if (Number(mover.dataset.mover) < 0) ol.insertBefore(li, alvo); else ol.insertBefore(alvo, li);
            const itens = [...ol.children];
            itens.forEach((x, i) => {
              x.querySelector("[data-mover='-1']").disabled = i === 0;
              x.querySelector("[data-mover='1']").disabled = i === itens.length - 1;
            });
            const mesmo = li.querySelector(`[data-mover="${mover.dataset.mover}"]`);
            (mesmo.disabled ? li.querySelector("button:not(:disabled)") : mesmo).focus();
          } else if (e.target.closest("[data-confirmar]")) {
            const ids = [...ol.children].map(li => li.dataset.id);
            if (agir(e2 => S.desempatarManual(e2, ids), msg)) desenhar("#t-final");
          }
        });
      });

      sec.querySelector("#conferir").addEventListener("click", () => {
        const { colocacoes, erros } = S.paraResultado(estado);
        const mostrarErros = lista => {
          caixaErros.innerHTML = `<p><b>Antes de conferir:</b></p><ul>${lista.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
          caixaErros.hidden = false;
          caixaConf.hidden = true;
          caixaErros.focus();
        };
        if (erros.length) return mostrarErros(erros);
        const tiposUsados = colocacoes.map(c => c.tipo_pokemon).filter(Boolean);
        const val = RE.validarResultado(colocacoes, d.jogadores.map(j => j.id), ev.data, hojeBV(),
          tiposPokemon.length ? tiposPokemon.concat(tiposUsados) : null);
        if (val.erros.length) return mostrarErros(val.erros);
        const ajuste = RE.ajustarDecklists(d.decklists, ev.id, val.colocacoes, apelido);
        if (ajuste.erros.length) return mostrarErros(ajuste.erros);
        caixaErros.hidden = true;
        caixaConf.hidden = false;
        caixaConf.innerHTML = `
          ${PainelResultados.htmlConferencia(ev, val.colocacoes, val.avisos, existente, apelido)}
          <div class="adm-acoes">
            <button class="btn btn-ouro adm-btn" type="button" id="publicar">Confere, publicar</button>
          </div>`;
        caixaConf.querySelector("h2").focus();
        caixaConf.querySelector("#publicar").addEventListener("click", async e => {
          const botao = e.currentTarget;
          botao.disabled = true;
          mostrarMensagem(msg, "Gravando…");
          try {
            await PainelResultados.publicar(ev, val.colocacoes, existente, ajuste, apelido);
          } catch (erro) {
            mostrarMensagem(msg, erro.message, "erro");
            botao.disabled = false;
            return;
          }
          /* Publicado: o rascunho não é mais necessário */
          local.apagar(ev.id);
          await GitHub.apagarArquivo("privado", arqRascunho(ev.id), `Remove rascunho do suíço ${ev.id} (resultado publicado)`).catch(() => {});
          estado = null;
          corpo.innerHTML = `
            <div class="adm-alerta" tabindex="-1" id="publicado">
              <p><b>Resultado de ${esc(ev.nome)} publicado.</b> O site atualiza em cerca de 1 minuto.</p>
              <p><a class="btn btn-ouro adm-btn" href="#resultados/${encodeURIComponent(ev.id)}">Enviar as decklists do Top 3</a></p>
            </div>`;
          msgRemoto.textContent = "";
          corpo.querySelector("#publicado").focus();
        });
      });
      return sec;
    }

    /* ---- Jogadores e opções ---- */

    function blocoOpcoes() {
      const det = document.createElement("details");
      det.className = "adm-mais adm-opcoes";
      det.open = opcoesAbertas;
      det.addEventListener("toggle", () => { opcoesAbertas = det.open; });
      const proxima = estado.rodadas.length + 1;
      const usados = new Set(estado.jogadores.map(j => j.id));
      const fora = [...d.jogadores].filter(j => !usados.has(j.id)).sort((a, b) => a.apelido.localeCompare(b.apelido, "pt-BR"));
      const temMesa = id => estado.rodadas.some(r => r.mesas.some(m => m.a === id || m.b === id));
      const situacao = j => j.drop_apos_rodada !== null
        ? (j.drop_apos_rodada === 0 ? "saiu antes da 1ª rodada" : `drop após a rodada ${j.drop_apos_rodada}`)
        : j.entrou_na_rodada > 1 ? `entrou na rodada ${j.entrou_na_rodada}` : "ativo";
      det.innerHTML = `
        <summary>Jogadores e opções</summary>
        <div class="adm-grupo">
          <h3>Jogadores</h3>
          <ul class="adm-sel-lista">${[...estado.jogadores].sort((a, b) => apelido(a.id).localeCompare(apelido(b.id), "pt-BR")).map(j => `
            <li class="adm-sel ${j.drop_apos_rodada !== null ? "adm-drop" : ""}" data-id="${esc(j.id)}">
              <span><b>${esc(apelido(j.id))}</b><small class="adm-nota"> · ${situacao(j)}</small></span>
              <span class="adm-sel-tipo">${campoTipo("tipo", j.tipo_pokemon || "", `Tipo do deck de ${apelido(j.id)}`)}</span>
              ${j.drop_apos_rodada === null
                ? (temMesa(j.id) || estado.rodadas.length ? `<button type="button" class="btn btn-line" data-acao="drop">Drop</button>`
                  : `<button type="button" class="btn btn-line" data-acao="remover">Remover</button>`)
                : j.drop_apos_rodada >= estado.rodadas.length ? `<button type="button" class="btn btn-line" data-acao="voltar">Desfazer drop</button>` : ""}
            </li>`).join("")}</ul>
          <p class="adm-msg" data-msg-jog role="status" aria-live="polite"></p>
          ${proxima <= estado.rodadas_previstas ? `
            <h3>Incluir jogador</h3>
            <p class="adm-nota">${estado.rodadas.length
              ? `Entra na rodada ${proxima} e conta derrota (0-2) em cada rodada já pareada.${S.rodadaAberta(estado) ? " Para ele jogar a rodada aberta, use \"Refazer pareamento\" antes de lançar placares." : ""}`
              : "Entra desde a 1ª rodada."}</p>
            <div class="adm-incluir">
              <label class="campo"><span>Jogador cadastrado</span><select name="incluir"><option value="">Escolha…</option>${fora.map(j => `<option value="${esc(j.id)}">${esc(j.apelido)}</option>`).join("")}</select></label>
              <button type="button" class="btn btn-line adm-btn" data-acao="incluir">Incluir</button>
            </div>
            <div data-novo></div>` : ""}
          <h3>Rodadas</h3>
          <div class="adm-incluir">
            <label class="campo adm-campo-curto"><span>Rodadas previstas</span><input name="previstas" type="number" inputmode="numeric" min="1" max="20" value="${estado.rodadas_previstas}"></label>
            <button type="button" class="btn btn-line adm-btn" data-acao="previstas">Alterar</button>
          </div>
          <p class="adm-nota">Sugestão para ${estado.jogadores.length} jogadores: ${S.rodadasSugeridas(estado.jogadores.length)}.</p>
          <h3>Rascunho</h3>
          <p class="adm-nota">Fica neste aparelho a cada toque e no GitHub (repositório privado) ao começar e a cada rodada fechada.</p>
          <div class="adm-acoes">
            <button type="button" class="btn btn-line adm-btn" data-acao="salvar">Salvar no GitHub agora</button>
            <button type="button" class="btn adm-btn adm-btn-perigo" data-acao="descartar">Descartar torneio</button>
          </div>
          <p class="adm-msg" data-msg-op role="status" aria-live="polite"></p>
        </div>`;
      const msgJog = det.querySelector("[data-msg-jog]");
      const msgOp = det.querySelector("[data-msg-op]");
      const novo = det.querySelector("[data-novo]");
      if (novo) {
        novo.replaceWith(blocoNovoJogador((id, texto) => {
          if (estado.jogadores.some(j => j.id === id)) { mostrarMensagem(msgJog, "Este jogador já está no torneio.", "erro"); return; }
          if (agir(e => S.incluirJogador(e, id), msgJog)) {
            desenhar(".adm-opcoes summary");
            mostrarMensagem(corpo.querySelector(".adm-opcoes [data-msg-jog]"), texto, "ok");
          }
        }));
      }
      det.addEventListener("change", e => {
        if (e.target.name !== "tipo" || e.target.tagName !== "SELECT") return;
        const id = e.target.closest("li").dataset.id;
        if (agir(x => S.definirTipo(x, id, e.target.value), msgJog)) {
          desenhar(`.adm-opcoes [data-id="${id}"] [name=tipo]`);
        }
      });
      det.addEventListener("input", e => {
        if (e.target.name === "tipo" && e.target.tagName === "INPUT") agir(x => S.definirTipo(x, e.target.closest("li").dataset.id, e.target.value), msgJog);
      });
      det.addEventListener("click", e => {
        const b = e.target.closest("button[data-acao]");
        if (!b) return;
        const id = b.closest("li") ? b.closest("li").dataset.id : null;
        const acao = b.dataset.acao;
        if (acao === "drop") {
          if (agir(x => S.dropJogador(x, id), msgJog)) {
            desenhar(`.adm-opcoes [data-id="${id}"] button`);
            mostrarMensagem(corpo.querySelector(".adm-opcoes [data-msg-jog]"),
              `${apelido(id)} sai do torneio${S.rodadaAberta(estado) && S.rodadaAberta(estado).mesas.some(m => m.a === id || m.b === id) ? " depois desta rodada (lance o placar dele)" : ""}.`, "ok");
          }
        } else if (acao === "voltar") {
          if (agir(x => S.desfazerDrop(x, id), msgJog)) desenhar(`.adm-opcoes [data-id="${id}"] button`);
        } else if (acao === "remover") {
          if (agir(x => S.removerJogador(x, id), msgJog)) desenhar(".adm-opcoes summary");
        } else if (acao === "incluir") {
          const sel = det.querySelector("[name=incluir]");
          if (!sel.value) { mostrarMensagem(msgJog, "Escolha o jogador.", "erro"); sel.focus(); return; }
          const nome = apelido(sel.value);
          if (agir(x => S.incluirJogador(x, sel.value), msgJog)) {
            desenhar(".adm-opcoes [name=incluir]");
            mostrarMensagem(corpo.querySelector(".adm-opcoes [data-msg-jog]"), `${nome} incluído.`, "ok");
          }
        } else if (acao === "previstas") {
          if (agir(x => S.definirRodadas(x, det.querySelector("[name=previstas]").value), msgOp)) desenhar(".adm-opcoes [name=previstas]");
        } else if (acao === "salvar") {
          salvarRemoto("salvo manualmente");
        } else if (acao === "descartar") {
          if (b.dataset.confirma !== "1") {
            b.dataset.confirma = "1";
            b.textContent = "Toque de novo para descartar";
            mostrarMensagem(msgOp, "Apaga o torneio deste aparelho e do GitHub. O resultado publicado (se houver) não muda.", "erro");
            setTimeout(() => { if (b.isConnected) { b.dataset.confirma = ""; b.textContent = "Descartar torneio"; } }, 5000);
            return;
          }
          b.disabled = true;
          local.apagar(ev.id);
          GitHub.apagarArquivo("privado", arqRascunho(ev.id), `Descarta rascunho do suíço ${ev.id}`)
            .then(() => { recado = "Torneio descartado."; location.hash = "#suico"; })
            .catch(erro => { estado = null; desenhar(); mostrarMensagem(msgTopo, `Descartado neste aparelho, mas não no GitHub: ${erro.message}`, "erro"); });
        }
      });
      return det;
    }
    let opcoesAbertas = false;
    let corrigirAberto = false;

    desenhar();
  }

  /* #suico = lista de eventos; #suico/<evento_id> = torneio */
  (window.TELAS_PAINEL = window.TELAS_PAINEL || {}).suico = (tela, secao, param) =>
    param ? torneio(tela, decodeURIComponent(param)) : lista(tela);
})();

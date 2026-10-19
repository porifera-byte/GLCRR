/* Painel GLC RR — tela de Resultados: lançamento manual da classificação de um evento.
   Fluxo: digitar → Conferir (tabela no formato do Template B) → Publicar em GLCRR data/resultados.json.
   Rascunho da digitação fica no sessionStorage da aba (só ids e números, nada pessoal). */
(function () {
  "use strict";

  const R = RegrasEventos;
  const ARQ = "data/resultados.json";
  const PREFIXO_RASCUNHO = "glcrr-res-";
  let recado = "";

  function mostrarMensagem(el, texto, tipo) {
    el.textContent = texto;
    el.classList.toggle("erro", tipo === "erro");
    el.classList.toggle("ok", tipo === "ok");
  }

  const rascunho = {
    ler(id) { try { return JSON.parse(sessionStorage.getItem(PREFIXO_RASCUNHO + id) || "null"); } catch (e) { return null; } },
    gravar(id, linhas) { try { sessionStorage.setItem(PREFIXO_RASCUNHO + id, JSON.stringify(linhas)); } catch (e) { /* sem espaço: segue sem rascunho */ } },
    apagar(id) { try { sessionStorage.removeItem(PREFIXO_RASCUNHO + id); } catch (e) { /* nada */ } }
  };

  async function carregar() {
    const [base, jog] = await Promise.all([PainelEventos.carregar(), GitHub.lerJSON("publico", "data/jogadores.json")]);
    return { ...base, jogadores: jog.dados };
  }

  /* ---------- Lista ---------- */

  async function lista(tela) {
    tela.innerHTML = `
      <div><p class="eyebrow">Lançamento manual</p><h1 id="titulo-tela" tabindex="-1">Resultados</h1></div>
      <p class="lead">Escolha o evento para lançar ou corrigir a classificação. Para torneio suíço feito no painel, o resultado é gravado no fim do torneio.</p>
      <p class="adm-msg" id="msg-lista" role="status" aria-live="polite">Carregando…</p>
      <div id="lista-res" aria-busy="true"></div>`;
    const msg = tela.querySelector("#msg-lista");
    let d;
    try {
      d = await carregar();
    } catch (e) {
      if (tela.isConnected) mostrarMensagem(msg, e.message, "erro");
      return;
    }
    if (!tela.isConnected) return;
    mostrarMensagem(msg, recado, recado ? "ok" : "");
    recado = "";
    const caixa = tela.querySelector("#lista-res");
    caixa.removeAttribute("aria-busy");
    const hoje = hojeBV();
    const realizados = d.eventos.filter(e => e.data <= hoje).sort((a, b) => b.data.localeCompare(a.data));
    const futuros = d.eventos.filter(e => e.data > hoje).sort((a, b) => a.data.localeCompare(b.data));
    caixa.className = "adm-grupos";
    caixa.innerHTML = `
      <div class="group-title past">Realizados e de hoje</div>
      ${realizados.length ? `<div class="list">${realizados.map(e => PainelEventos.cartaoEvento(e, d, "resultados")).join("")}</div>`
        : `<div class="empty"><b>Nenhum evento realizado.</b>Cadastre o evento em <a href="#eventos">Eventos</a>.</div>`}
      ${futuros.length ? `<details class="adm-mais"><summary>Eventos futuros (${futuros.length})</summary>
        <div class="list">${futuros.map(e => PainelEventos.cartaoEvento(e, d, "resultados")).join("")}</div></details>` : ""}`;
  }

  /* ---------- Formulário ---------- */

  const linhaVazia = pos => ({ posicao: pos, jogador_id: "", vitorias: "", derrotas: "", empates: "", obs: "" });

  async function formulario(tela, eventoId) {
    tela.innerHTML = `
      <a class="link-voltar" href="#resultados">‹ Resultados</a>
      <h1 id="titulo-tela" tabindex="-1">Carregando…</h1>
      <p class="adm-msg" id="msg-form" role="status" aria-live="polite"></p>`;
    const msgTopo = tela.querySelector("#msg-form");
    let d;
    try {
      d = await carregar();
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
    const nDecklists = d.decklists.filter(x => x.evento_id === ev.id).length;
    const jogadores = [...d.jogadores].sort((a, b) => a.apelido.localeCompare(b.apelido, "pt-BR"));
    const apelido = id => (d.jogadores.find(j => j.id === id) || {}).apelido || id;

    let linhas;
    const salvo = rascunho.ler(ev.id);
    if (salvo && salvo.length) {
      linhas = salvo;
      mostrarMensagem(msgTopo, "Rascunho desta aba restaurado.", "ok");
    } else if (existente) {
      linhas = [...existente.colocacoes].sort((a, b) => a.posicao - b.posicao)
        .map(c => ({ posicao: c.posicao, jogador_id: c.jogador_id, vitorias: c.vitorias ?? 0, derrotas: c.derrotas ?? 0, empates: c.empates ?? 0, obs: c.obs || "" }));
    } else {
      linhas = [linhaVazia(1), linhaVazia(2), linhaVazia(3), linhaVazia(4)];
    }

    const corpo = document.createElement("div");
    corpo.className = "adm-form";
    corpo.innerHTML = `
      <p class="lead">${[dataBR(ev.data), ev.local, ev.tipo].filter(Boolean).map(esc).join(" · ")}
        · <span class="pill ${existente ? "" : "warn"}">${existente ? "resultado publicado" : "sem resultado"}</span></p>
      <div id="etapa-digitar">
        <p class="adm-nota">Uma linha por jogador, em ordem de classificação. Empate de colocação: mesma posição e "empate" na observação.
          Jogador fora da lista? Cadastre em <a href="#jogadores/novo">Jogadores</a>; a digitação fica guardada nesta aba.</p>
        <ol class="adm-colocacoes" id="linhas"></ol>
        <div class="adm-acoes">
          <button class="btn btn-line adm-btn" type="button" id="mais">+ Adicionar jogador</button>
          <button class="btn btn-line adm-btn" type="button" id="numerar">Numerar pela ordem</button>
        </div>
        <div class="adm-alerta adm-alerta-erro" id="erros" role="alert" tabindex="-1" hidden></div>
        <div class="adm-acoes">
          <button class="btn btn-ouro adm-btn" type="button" id="conferir">Conferir</button>
        </div>
      </div>
      <div id="etapa-conferir" hidden></div>
      <p class="adm-msg" id="msg-salvar" role="status" aria-live="polite"></p>`;
    tela.appendChild(corpo);
    const caixaLinhas = corpo.querySelector("#linhas");
    const caixaErros = corpo.querySelector("#erros");
    const etapaDigitar = corpo.querySelector("#etapa-digitar");
    const etapaConferir = corpo.querySelector("#etapa-conferir");
    const msgSalvar = corpo.querySelector("#msg-salvar");

    const opcoesJogador = sel => `<option value="">Escolha…</option>` +
      jogadores.map(j => `<option value="${esc(j.id)}" ${j.id === sel ? "selected" : ""}>${esc(j.apelido)}</option>`).join("") +
      (sel && !jogadores.some(j => j.id === sel) ? `<option value="${esc(sel)}" selected>${esc(sel)} (não cadastrado)</option>` : "");

    function desenhar(focar) {
      caixaLinhas.innerHTML = linhas.map((l, i) => `
        <li class="adm-colocacao" data-i="${i}">
          <label class="campo adm-pos"><span>Pos.</span><input name="posicao" type="number" inputmode="numeric" min="1" value="${esc(l.posicao)}"></label>
          <label class="campo adm-sel-jogador"><span>Jogador</span><select name="jogador_id">${opcoesJogador(l.jogador_id)}</select></label>
          <label class="campo adm-num"><span>V</span><input name="vitorias" type="number" inputmode="numeric" min="0" max="30" value="${esc(l.vitorias)}" placeholder="0"></label>
          <label class="campo adm-num"><span>D</span><input name="derrotas" type="number" inputmode="numeric" min="0" max="30" value="${esc(l.derrotas)}" placeholder="0"></label>
          <label class="campo adm-num"><span>E</span><input name="empates" type="number" inputmode="numeric" min="0" max="30" value="${esc(l.empates)}" placeholder="0"></label>
          <label class="campo adm-obs"><span>Obs.</span><select name="obs">${R.OBS.map(o => `<option value="${o}" ${l.obs === o ? "selected" : ""}>${o || "—"}</option>`).join("")}</select></label>
          <div class="adm-mover">
            <button type="button" class="btn btn-line" data-acao="subir" aria-label="Subir linha ${i + 1}" ${i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="btn btn-line" data-acao="descer" aria-label="Descer linha ${i + 1}" ${i === linhas.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="btn btn-line" data-acao="remover" aria-label="Remover linha ${i + 1}">✕</button>
          </div>
        </li>`).join("");
      if (focar !== undefined) {
        const alvo = caixaLinhas.querySelector(`[data-i="${focar.i}"] ${focar.sel}`);
        if (alvo && !alvo.disabled) alvo.focus();
      }
      rascunho.gravar(ev.id, linhas);
    }

    caixaLinhas.addEventListener("input", e => {
      const li = e.target.closest("[data-i]");
      if (!li || !e.target.name) return;
      linhas[Number(li.dataset.i)][e.target.name] = e.target.value;
      rascunho.gravar(ev.id, linhas);
    });
    caixaLinhas.addEventListener("click", e => {
      const b = e.target.closest("button[data-acao]");
      if (!b) return;
      const i = Number(b.closest("[data-i]").dataset.i);
      if (b.dataset.acao === "remover") {
        linhas.splice(i, 1);
        if (!linhas.length) linhas.push(linhaVazia(1));
        desenhar({ i: Math.min(i, linhas.length - 1), sel: "[name=jogador_id]" });
      } else {
        const j = b.dataset.acao === "subir" ? i - 1 : i + 1;
        [linhas[i], linhas[j]] = [linhas[j], linhas[i]];
        desenhar({ i: j, sel: `[data-acao=${b.dataset.acao}]` });
      }
    });
    corpo.querySelector("#mais").addEventListener("click", () => {
      const ultima = linhas.reduce((m, l) => Math.max(m, Number(l.posicao) || 0), 0);
      linhas.push(linhaVazia(ultima + 1));
      desenhar({ i: linhas.length - 1, sel: "[name=jogador_id]" });
    });
    corpo.querySelector("#numerar").addEventListener("click", () => {
      linhas.forEach((l, i) => { l.posicao = i + 1; if (l.obs === "empate") l.obs = ""; });
      desenhar();
    });

    /* Conferir: valida e mostra a tabela antes de publicar */
    corpo.querySelector("#conferir").addEventListener("click", () => {
      const preenchidas = linhas.filter(l => l.jogador_id || String(l.vitorias) + l.derrotas + l.empates !== "");
      const { colocacoes, erros, avisos } = R.validarResultado(preenchidas, d.jogadores.map(j => j.id), ev.data, hojeBV());
      if (erros.length) {
        caixaErros.innerHTML = `<p><b>Corrija antes de conferir:</b></p><ul>${erros.map(e => `<li>${esc(e)}</li>`).join("")}</ul>`;
        caixaErros.hidden = false;
        caixaErros.focus();
        return;
      }
      caixaErros.hidden = true;
      etapaDigitar.hidden = true;
      etapaConferir.hidden = false;
      etapaConferir.innerHTML = `
        <h2 tabindex="-1" id="t-conferencia">📋 Conferência — ${esc(ev.nome)}, ${dataBR(ev.data)}</h2>
        <div class="table-box" role="region" aria-labelledby="t-conferencia" tabindex="0">
          <table><thead><tr><th>Pos.</th><th>Jogador</th><th>V-D-E</th><th>Obs</th></tr></thead>
          <tbody>${colocacoes.map(c => `<tr><td>${c.posicao}º</td><td>${esc(apelido(c.jogador_id))}</td><td>${c.vitorias}-${c.derrotas}-${c.empates}</td><td>${esc(c.obs || "")}</td></tr>`).join("")}</tbody></table>
        </div>
        ${avisos.length ? `<div class="adm-alerta"><p><b>⚠️ Confira:</b></p><ul>${avisos.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
        ${existente ? `<p class="adm-nota">Este evento já tem resultado publicado: ele será substituído por esta tabela.</p>` : ""}
        <div class="adm-acoes">
          <button class="btn btn-ouro adm-btn" type="button" id="publicar">Confere, publicar</button>
          <button class="btn btn-line adm-btn" type="button" id="corrigir">Voltar e corrigir</button>
        </div>`;
      etapaConferir.querySelector("h2").focus();
      etapaConferir.querySelector("#corrigir").addEventListener("click", () => {
        etapaConferir.hidden = true;
        etapaDigitar.hidden = false;
        mostrarMensagem(msgSalvar, "", "");
        corpo.querySelector("#conferir").focus();
      });
      etapaConferir.querySelector("#publicar").addEventListener("click", async e => {
        const botao = e.currentTarget;
        botao.disabled = true;
        mostrarMensagem(msgSalvar, "Gravando…");
        try {
          await GitHub.atualizarJSON("publico", ARQ, lista => {
            const i = lista.findIndex(r => r.evento_id === ev.id);
            const reg = { evento_id: ev.id, colocacoes };
            if (i >= 0) lista[i] = reg; else lista.push(reg);
            return lista;
          }, `${existente ? "Corrige" : "Lança"} resultado do evento ${ev.id}`);
          rascunho.apagar(ev.id);
          recado = `Resultado de ${ev.nome} publicado. O site atualiza em cerca de 1 minuto.`;
          location.hash = "#resultados";
        } catch (erro) {
          mostrarMensagem(msgSalvar, erro.message, "erro");
          botao.disabled = false;
        }
      });
    });

    desenhar();
    if (existente) tela.appendChild(blocoApagar(ev, nDecklists));
  }

  /* ---------- Apagar resultado ---------- */

  function blocoApagar(ev, nDecklists) {
    const bloco = document.createElement("section");
    bloco.className = "adm-perigo";
    bloco.setAttribute("aria-labelledby", "t-apagar");
    if (nDecklists) {
      bloco.innerHTML = `<h2 id="t-apagar">Apagar resultado</h2>
        <p class="adm-nota">Não é possível apagar: o evento tem ${nDecklists} decklist(s) do Top 3 ligadas a este resultado. Peça pelo chat do projeto.</p>`;
      return bloco;
    }
    bloco.innerHTML = `
      <h2 id="t-apagar">Apagar resultado</h2>
      <p class="adm-nota">Remove a classificação deste evento do site, do ranking e dos perfis. O evento continua no Calendário.</p>
      <button class="btn adm-btn adm-btn-perigo" type="button" id="apagar">Apagar resultado</button>
      <div class="adm-confirma" id="confirma-apagar" hidden>
        <p><b>Apagar o resultado de ${esc(ev.nome)}?</b></p>
        <div class="adm-acoes">
          <button class="btn adm-btn adm-btn-perigo" type="button" id="apagar-sim">Sim, apagar</button>
          <button class="btn btn-line adm-btn" type="button" id="apagar-nao">Cancelar</button>
        </div>
      </div>
      <p class="adm-msg" id="msg-apagar" role="status" aria-live="polite"></p>`;
    const botao = bloco.querySelector("#apagar");
    const confirma = bloco.querySelector("#confirma-apagar");
    const sim = bloco.querySelector("#apagar-sim");
    const msg = bloco.querySelector("#msg-apagar");
    botao.addEventListener("click", () => { botao.hidden = true; confirma.hidden = false; bloco.querySelector("#apagar-nao").focus(); });
    bloco.querySelector("#apagar-nao").addEventListener("click", () => { confirma.hidden = true; botao.hidden = false; botao.focus(); });
    sim.addEventListener("click", async () => {
      sim.disabled = true;
      mostrarMensagem(msg, "Apagando…");
      try {
        const dl = await GitHub.lerJSON("publico", "data/decklists.json");
        if (dl.dados.some(x => x.evento_id === ev.id)) throw new Error("O evento acabou de receber decklist. Nada foi apagado.");
        await GitHub.atualizarJSON("publico", ARQ, lista => lista.filter(r => r.evento_id !== ev.id), `Apaga resultado do evento ${ev.id}`);
        rascunho.apagar(ev.id);
        recado = `Resultado de ${ev.nome} apagado. O site atualiza em cerca de 1 minuto.`;
        location.hash = "#resultados";
      } catch (e) {
        mostrarMensagem(msg, e.message, "erro");
        sim.disabled = false;
      }
    });
    return bloco;
  }

  /* #resultados = lista de eventos; #resultados/<evento_id> = lançamento */
  (window.TELAS_PAINEL = window.TELAS_PAINEL || {}).resultados = (tela, secao, param) =>
    param ? formulario(tela, decodeURIComponent(param)) : lista(tela);
})();

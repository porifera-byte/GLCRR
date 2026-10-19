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

  const linhaVazia = pos => ({ posicao: pos, jogador_id: "", vitorias: "", derrotas: "", empates: "", tipo_pokemon: "", obs: "" });

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

    const valoresAntigos = new Set(existente ? existente.colocacoes.map(c => c.tipo_pokemon).filter(Boolean) : []);
    let linhas;
    const salvo = rascunho.ler(ev.id);
    if (recado) {
      mostrarMensagem(msgTopo, recado, "ok");
      recado = "";
    }
    if (salvo && salvo.length) {
      linhas = salvo;
      mostrarMensagem(msgTopo, "Rascunho desta aba restaurado.", "ok");
    } else if (existente) {
      linhas = [...existente.colocacoes].sort((a, b) => a.posicao - b.posicao)
        .map(c => ({ posicao: c.posicao, jogador_id: c.jogador_id, vitorias: c.vitorias ?? 0, derrotas: c.derrotas ?? 0, empates: c.empates ?? 0,
          tipo_pokemon: c.tipo_pokemon || "", obs: c.obs || "" }));
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

    /* Tipos de config.json; um valor antigo fora da lista continua aparecendo para não se perder */
    const tiposPokemon = d.tiposPokemon || [];
    const opcoesTipo = sel => `<option value="">—</option>` +
      tiposPokemon.map(t => `<option ${t === sel ? "selected" : ""}>${esc(t)}</option>`).join("") +
      (sel && !tiposPokemon.includes(sel) ? `<option selected>${esc(sel)}</option>` : "");

    function desenhar(focar) {
      caixaLinhas.innerHTML = linhas.map((l, i) => `
        <li class="adm-colocacao" data-i="${i}">
          <label class="campo adm-pos"><span>Pos.</span><input name="posicao" type="number" inputmode="numeric" min="1" value="${esc(l.posicao)}"></label>
          <label class="campo adm-sel-jogador"><span>Jogador</span><select name="jogador_id">${opcoesJogador(l.jogador_id)}</select></label>
          <label class="campo adm-num"><span>V</span><input name="vitorias" type="number" inputmode="numeric" min="0" max="30" value="${esc(l.vitorias)}" placeholder="0"></label>
          <label class="campo adm-num"><span>D</span><input name="derrotas" type="number" inputmode="numeric" min="0" max="30" value="${esc(l.derrotas)}" placeholder="0"></label>
          <label class="campo adm-num"><span>E</span><input name="empates" type="number" inputmode="numeric" min="0" max="30" value="${esc(l.empates)}" placeholder="0"></label>
          <label class="campo adm-tipo"><span>Tipo do deck</span><select name="tipo_pokemon">${opcoesTipo(l.tipo_pokemon)}</select></label>
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
      const { colocacoes, erros, avisos } = R.validarResultado(preenchidas, d.jogadores.map(j => j.id), ev.data, hojeBV(),
        tiposPokemon.concat(preenchidas.map(l => l.tipo_pokemon).filter(t => t && !tiposPokemon.includes(t) && valoresAntigos.has(t))));
      if (erros.length) {
        caixaErros.innerHTML = `<p><b>Corrija antes de conferir:</b></p><ul>${erros.map(e => `<li>${esc(e)}</li>`).join("")}</ul>`;
        caixaErros.hidden = false;
        caixaErros.focus();
        return;
      }
      /* Decklists já cadastradas precisam continuar no Top 3 */
      const ajuste = R.ajustarDecklists(d.decklists, ev.id, colocacoes, apelido);
      if (ajuste.erros.length) {
        caixaErros.innerHTML = `<p><b>Corrija antes de conferir:</b></p><ul>${ajuste.erros.map(e => `<li>${esc(e)}</li>`).join("")}</ul>`;
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
          <table><thead><tr><th>Pos.</th><th>Jogador</th><th>V-D-E</th><th>Tipo</th><th>Obs</th></tr></thead>
          <tbody>${colocacoes.map(c => `<tr><td>${c.posicao}º</td><td>${esc(apelido(c.jogador_id))}</td><td>${c.vitorias}-${c.derrotas}-${c.empates}</td><td>${esc(c.tipo_pokemon || "")}</td><td>${esc(c.obs || "")}</td></tr>`).join("")}</tbody></table>
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
          if (ajuste.mudou) {
            await GitHub.atualizarJSON("publico", "data/decklists.json", lista => {
              const novo = R.ajustarDecklists(lista, ev.id, colocacoes, apelido);
              if (novo.erros.length) throw new Error(`Resultado publicado, mas as decklists não foram ajustadas: ${novo.erros.join(" ")}`);
              return novo.lista;
            }, `Ajusta posições das decklists do evento ${ev.id}`);
          }
          rascunho.apagar(ev.id);
          recado = `Resultado de ${ev.nome} publicado. O site atualiza em cerca de 1 minuto. Agora você pode enviar as decklists do Top 3 abaixo.`;
          formulario(tela, ev.id);   // fica no evento para enviar as decklists
        } catch (erro) {
          mostrarMensagem(msgSalvar, erro.message, "erro");
          botao.disabled = false;
        }
      });
    });

    desenhar();
    if (existente) {
      tela.appendChild(blocoDecklists(ev, existente, d, apelido));
      tela.appendChild(blocoApagar(ev, nDecklists));
    }
  }

  /* ---------- Decklists do Top 3 ---------- */

  const RESERVA = "../assets/img/decklists/sem-imagem.svg";
  const prepararDecklist = arquivo => Imagens.preparar(arquivo, { maxLado: 1600, minimo: 300, formatos: ["jpeg"], qualidade: 0.85 });

  function blocoDecklists(ev, resultado, d, apelido) {
    const top3 = [...resultado.colocacoes].filter(c => c.posicao <= 3).sort((a, b) => a.posicao - b.posicao);
    const secao = document.createElement("section");
    secao.className = "adm-decklists";
    secao.setAttribute("aria-labelledby", "t-decklists");
    secao.innerHTML = `
      <h2 id="t-decklists">Decklists do Top 3</h2>
      <p class="adm-nota">Enquanto não houver imagem, o site mostra a imagem de reserva "Decklist em breve". Enviar uma imagem nova substitui a anterior.</p>
      <div class="adm-decks"></div>`;
    const caixa = secao.querySelector(".adm-decks");
    top3.forEach(c => caixa.appendChild(cartaoDecklist(ev, c, d, apelido)));
    return secao;
  }

  function cartaoDecklist(ev, c, d, apelido) {
    let atual = d.decklists.find(x => x.evento_id === ev.id && x.jogador_id === c.jogador_id) || null;
    let nova;            // imagem escolhida e ainda não gravada
    let removerImagem = false;
    const cartao = document.createElement("article");
    cartao.className = "adm-deck";
    const idc = `dk-${c.posicao}-${c.jogador_id}`;
    cartao.innerHTML = `
      <figure class="adm-deck-previa">
        <img alt="" id="${idc}-img">
        <figcaption id="${idc}-legenda"></figcaption>
      </figure>
      <form class="adm-form adm-deck-form" novalidate>
        <h3><span class="pos p${c.posicao}">${c.posicao}º</span> ${esc(apelido(c.jogador_id))}</h3>
        <div class="adm-icone-acoes">
          <label class="btn btn-line adm-btn-arquivo">
            <input type="file" name="arquivo" accept="image/png,image/jpeg,image/webp" class="adm-arquivo">
            <span class="rotulo-arquivo"></span>
          </label>
          <button class="btn btn-line adm-btn-arquivo" type="button" data-acao="remover-imagem">Usar a reserva</button>
        </div>
        <small class="adm-erro" data-erro="imagem"></small>
        <label class="adm-check" hidden>
          <input type="checkbox" name="imagem_ok">
          <span>Confirmo que a imagem <b>não mostra nome completo, documento, rosto</b> nem outro dado pessoal.</span>
        </label>
        <p class="adm-nota">Tipo do deck: <b>${esc(c.tipo_pokemon || "não informado")}</b> (vem da linha do resultado, acima).</p>
        <details class="adm-mais"${atual && atual.lista_texto ? " open" : ""}>
          <summary>Lista em texto (opcional)</summary>
          <label class="campo">
            <span class="adm-oculto">Lista em texto</span>
            <textarea name="lista_texto" maxlength="3000" rows="6">${esc(atual ? atual.lista_texto || "" : "")}</textarea>
            <small class="adm-erro" data-erro="lista_texto"></small>
          </label>
        </details>
        <div class="adm-acoes">
          <button class="btn btn-ouro adm-btn" type="submit">Salvar decklist</button>
          <button class="btn btn-line adm-btn adm-btn-texto-perigo" type="button" data-acao="apagar">Apagar decklist</button>
        </div>
        <p class="adm-msg" role="status" aria-live="polite"></p>
      </form>`;
    const img = cartao.querySelector("img");
    const legenda = cartao.querySelector("figcaption");
    const form = cartao.querySelector("form");
    const msg = form.querySelector(".adm-msg");
    const erroImg = form.querySelector("[data-erro=imagem]");
    const confirma = form.querySelector(".adm-check");
    const botaoReserva = form.querySelector("[data-acao=remover-imagem]");
    const botaoApagar = form.querySelector("[data-acao=apagar]");
    const temImagemGravada = () => !!(atual && R.DECKLIST_VALIDA.test(atual.imagem || ""));

    function atualizarVista() {
      if (nova) {
        img.src = nova.url;
        legenda.textContent = "Nova imagem (ainda não salva)";
      } else if (temImagemGravada() && !removerImagem) {
        img.src = `../${atual.imagem}`;
        legenda.textContent = "Imagem publicada";
      } else {
        img.src = RESERVA;
        legenda.textContent = removerImagem ? "Volta para a reserva ao salvar" : "Reserva (sem imagem enviada)";
      }
      img.alt = `Decklist de ${apelido(c.jogador_id)}: ${legenda.textContent.toLowerCase()}`;
      form.querySelector(".rotulo-arquivo").textContent = temImagemGravada() || nova ? "Trocar imagem" : "Enviar imagem";
      botaoReserva.hidden = !(nova || (temImagemGravada() && !removerImagem));
      confirma.hidden = !nova;
      botaoApagar.hidden = !atual;
    }
    /* Imagem recém-enviada leva ~1 min para ser publicada: até lá, mostra a reserva */
    img.addEventListener("error", () => {
      if (!img.src.endsWith("sem-imagem.svg")) { img.src = RESERVA; legenda.textContent = "Imagem enviada; aparece em cerca de 1 minuto"; }
    });
    atualizarVista();

    form.arquivo.addEventListener("change", async () => {
      const arquivo = form.arquivo.files[0];
      erroImg.textContent = "";
      if (!arquivo) return;
      try {
        const preparado = await prepararDecklist(arquivo);
        if (nova) URL.revokeObjectURL(nova.url);
        nova = preparado;
        removerImagem = false;
        form.imagem_ok.checked = false;
        atualizarVista();
      } catch (e) {
        erroImg.textContent = e.message;
      } finally {
        form.arquivo.value = "";
      }
    });
    form.imagem_ok.addEventListener("change", () => { if (form.imagem_ok.checked) erroImg.textContent = ""; });
    botaoReserva.addEventListener("click", () => {
      if (nova) { URL.revokeObjectURL(nova.url); nova = undefined; }
      else removerImagem = true;
      atualizarVista();
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      form.querySelectorAll("[data-erro]").forEach(el => { el.textContent = ""; });
      const { dados, erros } = R.validarDecklist({ lista_texto: form.lista_texto.value });
      if (nova && !form.imagem_ok.checked) erros.imagem = "Marque a confirmação sobre a imagem.";
      if (Object.keys(erros).length) {
        Object.entries(erros).forEach(([k, v]) => { form.querySelector(`[data-erro="${k}"]`).textContent = v; });
        mostrarMensagem(msg, "Confira os campos marcados.", "erro");
        return;
      }
      const antiga = temImagemGravada() ? R.semVersao(atual.imagem) : "";
      let imagem = removerImagem ? "" : atual ? atual.imagem || "" : "";
      const igual = !nova && imagem === (atual ? atual.imagem || "" : "") &&
        dados.lista_texto === (atual ? atual.lista_texto || "" : "");
      if (igual) { mostrarMensagem(msg, "Nada mudou.", "ok"); return; }
      const botoes = form.querySelectorAll("button");
      botoes.forEach(b => { b.disabled = true; });
      mostrarMensagem(msg, "Gravando…");
      try {
        let caminhoNovo = "";
        if (nova) {
          caminhoNovo = R.caminhoDecklist(ev.id, c.posicao, c.jogador_id, nova.extensao);
          await GitHub.gravarBinario("publico", caminhoNovo, nova.bytes, `Imagem da decklist de ${c.jogador_id} no evento ${ev.id}`);
          imagem = `${caminhoNovo}?v=${R.carimbo()}`;
        }
        const registro = { evento_id: ev.id, jogador_id: c.jogador_id, posicao: c.posicao,
          lista_texto: dados.lista_texto, imagem };
        const vazio = !imagem && !dados.lista_texto;
        await GitHub.atualizarJSON("publico", "data/decklists.json", lista => {
          const i = lista.findIndex(x => x.evento_id === ev.id && x.jogador_id === c.jogador_id);
          if (vazio) { if (i >= 0) lista.splice(i, 1); return lista; }
          if (i >= 0) { lista[i] = { ...lista[i], ...registro }; delete lista[i].tipo_pokemon; } else lista.push(registro);
          return lista;
        }, `Decklist de ${c.jogador_id} no evento ${ev.id}`);
        if (antiga && antiga !== caminhoNovo && (nova || removerImagem)) {
          await GitHub.apagarArquivo("publico", antiga, `Remove imagem antiga da decklist de ${c.jogador_id}`).catch(() => {});
        }
        atual = vazio ? null : registro;
        d.decklists = d.decklists.filter(x => !(x.evento_id === ev.id && x.jogador_id === c.jogador_id)).concat(atual ? [atual] : []);
        if (nova) { URL.revokeObjectURL(nova.url); nova = undefined; }
        removerImagem = false;
        atualizarVista();
        mostrarMensagem(msg, "Decklist salva. O site atualiza em cerca de 1 minuto.", "ok");
      } catch (erro) {
        mostrarMensagem(msg, erro.message, "erro");
      } finally {
        botoes.forEach(b => { b.disabled = false; });
      }
    });

    /* Apagar: dois toques (o primeiro pede confirmação) */
    let confirmandoApagar = false;
    botaoApagar.addEventListener("click", async () => {
      if (!confirmandoApagar) {
        confirmandoApagar = true;
        botaoApagar.textContent = "Toque de novo para apagar";
        setTimeout(() => { confirmandoApagar = false; botaoApagar.textContent = "Apagar decklist"; }, 5000);
        return;
      }
      confirmandoApagar = false;
      const botoes = form.querySelectorAll("button");
      botoes.forEach(b => { b.disabled = true; });
      mostrarMensagem(msg, "Apagando…");
      try {
        const antiga = temImagemGravada() ? R.semVersao(atual.imagem) : "";
        await GitHub.atualizarJSON("publico", "data/decklists.json",
          lista => lista.filter(x => !(x.evento_id === ev.id && x.jogador_id === c.jogador_id)),
          `Apaga decklist de ${c.jogador_id} no evento ${ev.id}`);
        if (antiga) await GitHub.apagarArquivo("publico", antiga, `Remove imagem da decklist de ${c.jogador_id}`).catch(() => {});
        atual = null;
        d.decklists = d.decklists.filter(x => !(x.evento_id === ev.id && x.jogador_id === c.jogador_id));
        form.lista_texto.value = "";
        if (nova) { URL.revokeObjectURL(nova.url); nova = undefined; }
        removerImagem = false;
        atualizarVista();
        mostrarMensagem(msg, "Decklist apagada. O site volta a mostrar a reserva.", "ok");
      } catch (erro) {
        mostrarMensagem(msg, erro.message, "erro");
      } finally {
        botoes.forEach(b => { b.disabled = false; });
        botaoApagar.textContent = "Apagar decklist";
      }
    });
    return cartao;
  }

  /* ---------- Apagar resultado ---------- */

  function blocoApagar(ev, nDecklists) {
    const bloco = document.createElement("section");
    bloco.className = "adm-perigo";
    bloco.setAttribute("aria-labelledby", "t-apagar");
    if (nDecklists) {
      bloco.innerHTML = `<h2 id="t-apagar">Apagar resultado</h2>
        <p class="adm-nota">Não é possível apagar: o evento tem ${nDecklists} decklist(s) cadastrada(s). Apague as decklists na seção acima antes.</p>`;
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

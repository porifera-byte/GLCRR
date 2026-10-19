/* Painel GLC RR — tela de Eventos: lista, cadastro, edição e exclusão.
   Grava em GLCRR data/eventos.json. id = AAAA-MM-DD-slug(nome).
   O id acompanha data e nome enquanto o evento não tem resultado nem decklist; depois fica fixo. */
(function () {
  "use strict";

  const R = RegrasEventos;
  const ARQ = "data/eventos.json";
  let recado = "";

  async function carregar() {
    const [ev, res, dl, cfg] = await Promise.all([
      GitHub.lerJSON("publico", ARQ),
      GitHub.lerJSON("publico", "data/resultados.json"),
      GitHub.lerJSON("publico", "data/decklists.json"),
      GitHub.lerJSON("publico", "data/config.json", {})
    ]);
    return { eventos: ev.dados, resultados: res.dados, decklists: dl.dados, tipos: cfg.dados.tipos_evento || [], tiposPokemon: cfg.dados.tipos_pokemon || [] };
  }

  const usos = (id, d) => ({
    resultado: d.resultados.some(r => r.evento_id === id),
    decklists: d.decklists.filter(x => x.evento_id === id).length
  });

  function mostrarMensagem(el, texto, tipo) {
    el.textContent = texto;
    el.classList.toggle("erro", tipo === "erro");
    el.classList.toggle("ok", tipo === "ok");
  }

  function caixaData(iso) {
    const [, m, d] = iso.split("-");
    return `<div class="date" aria-hidden="true"><b>${esc(d)}</b><span>${esc(MESES[Number(m) - 1] || "")}</span></div>`;
  }

  /* Cartão de evento do painel (mesmo visual do Calendário). destino: "eventos" ou "resultados" */
  function cartaoEvento(ev, d, destino) {
    const u = usos(ev.id, d);
    const st = statusDe(ev);
    const res = d.resultados.find(r => r.evento_id === ev.id);
    return `<a class="ev adm-ev" href="#${destino}/${encodeURIComponent(ev.id)}">
      ${caixaData(ev.data)}
      <div class="ev-body">
        <h3>${esc(ev.nome)}</h3>
        <div class="pills">
          <span class="pill ${st === "Inscrições abertas" ? "abertas" : st === "Encerrado" ? "enc" : ""}">${esc(st)}</span>
          ${ev.tipo ? `<span class="pill">${esc(ev.tipo)}</span>` : ""}
          ${u.resultado ? `<span class="pill">resultado: ${(res.colocacoes || []).length} jogadores</span>` : destino === "resultados" ? `<span class="pill warn">sem resultado</span>` : ""}
          ${ev.teste ? `<span class="pill">teste</span>` : ""}
        </div>
        <div class="meta"><span>${dataBR(ev.data)}${ev.horario ? ` · ${esc(ev.horario)}` : ""}</span><span>${esc(ev.local || "")}</span></div>
      </div>
    </a>`;
  }

  /* ---------- Lista ---------- */

  async function lista(tela) {
    tela.innerHTML = `
      <div class="adm-topo">
        <div><p class="eyebrow">Calendário</p><h1 id="titulo-tela" tabindex="-1">Eventos</h1></div>
        <a class="btn btn-ouro adm-btn-topo" href="#eventos/novo">+ Novo evento</a>
      </div>
      <p class="adm-msg" id="msg-lista" role="status" aria-live="polite">Carregando…</p>
      <div id="lista-eventos" aria-busy="true"></div>`;
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
    const caixa = tela.querySelector("#lista-eventos");
    caixa.removeAttribute("aria-busy");
    const hoje = hojeBV();
    const futuros = d.eventos.filter(e => e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));
    const passados = d.eventos.filter(e => e.data < hoje).sort((a, b) => b.data.localeCompare(a.data));
    caixa.className = "adm-grupos";
    caixa.innerHTML = `
      <div class="group-title">Próximos</div>
      ${futuros.length ? `<div class="list">${futuros.map(e => cartaoEvento(e, d, "eventos")).join("")}</div>`
        : `<div class="empty"><b>Nenhum evento agendado.</b>Use o botão "+ Novo evento".</div>`}
      <div class="group-title past">Realizados</div>
      ${passados.length ? `<div class="list">${passados.map(e => cartaoEvento(e, d, "eventos")).join("")}</div>`
        : `<div class="empty"><b>Nenhum evento realizado.</b></div>`}`;
  }

  /* ---------- Formulário ---------- */

  async function formulario(tela, id) {
    const novo = id === "novo";
    tela.innerHTML = `
      <a class="link-voltar" href="#eventos">‹ Eventos</a>
      <h1 id="titulo-tela" tabindex="-1">${novo ? "Novo evento" : "Carregando…"}</h1>
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
    const atual = novo ? null : d.eventos.find(e => e.id === id);
    if (!novo && !atual) {
      tela.querySelector("h1").textContent = "Evento não encontrado";
      mostrarMensagem(msgTopo, "Confira o endereço ou volte para a lista.", "erro");
      return;
    }
    const u = atual ? usos(atual.id, d) : { resultado: false, decklists: 0 };
    const idFixo = u.resultado || u.decklists > 0;
    const v = campo => esc(atual ? atual[campo] ?? "" : "");
    tela.querySelector("h1").textContent = novo ? "Novo evento" : atual.nome;
    if (recado) { mostrarMensagem(msgTopo, recado, "ok"); recado = ""; }

    const tipos = d.tipos.includes(atual && atual.tipo) || !(atual && atual.tipo) ? d.tipos : d.tipos.concat(atual.tipo);
    const form = document.createElement("form");
    form.className = "adm-form";
    form.noValidate = true;
    form.innerHTML = `
      <fieldset class="adm-grupo">
        <legend>Evento <small>aparece no Calendário</small></legend>
        <label class="campo">
          <span>Nome *</span>
          <input name="nome" maxlength="80" autocomplete="off" value="${v("nome")}" required>
          <small class="adm-erro" data-erro="nome"></small>
        </label>
        <div class="adm-linha adm-linha-meio">
          <label class="campo">
            <span>Data *</span>
            <input name="data" type="date" value="${v("data")}" required>
            <small class="adm-erro" data-erro="data"></small>
          </label>
          <label class="campo">
            <span>Horário</span>
            <input name="horario" type="time" value="${v("horario")}">
            <small class="adm-erro" data-erro="horario"></small>
          </label>
        </div>
        <small class="adm-id" id="info-id"></small>
        <label class="campo">
          <span>Local *</span>
          <input name="local" maxlength="80" autocomplete="off" value="${v("local")}" placeholder="Ex.: Loja X, Boa Vista" required>
          <small class="adm-erro" data-erro="local"></small>
        </label>
        <div class="adm-linha adm-linha-meio">
          <label class="campo">
            <span>Tipo</span>
            <select name="tipo">
              <option value="">—</option>
              ${tipos.map(t => `<option ${atual && atual.tipo === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
            </select>
            <small class="adm-erro" data-erro="tipo"></small>
          </label>
          <label class="campo">
            <span>Vagas</span>
            <input name="vagas" type="number" inputmode="numeric" min="2" max="512" value="${v("vagas")}" placeholder="Opcional">
            <small class="adm-erro" data-erro="vagas"></small>
          </label>
        </div>
        <label class="campo">
          <span>Link de inscrição (Google Forms)</span>
          <input name="inscricao_url" type="url" inputmode="url" autocomplete="off" spellcheck="false" value="${v("inscricao_url")}" placeholder="https://forms.gle/...">
          <small>O botão "Inscreva-se" só aparece com link de Google Forms e em eventos futuros.</small>
          <small class="adm-erro" data-erro="inscricao_url"></small>
        </label>
        <label class="campo">
          <span>Descrição</span>
          <textarea name="descricao" maxlength="600" rows="4" class="adm-texto">${v("descricao")}</textarea>
          <small id="conta-descricao"></small>
          <small class="adm-erro" data-erro="descricao"></small>
        </label>
        <label class="campo">
          <span>Status</span>
          <select name="status">
            ${R.STATUS.map(s => `<option value="${esc(s)}" ${atual && (atual.status || "") === s ? "selected" : ""}>${s ? esc(s) : "Automático (recomendado)"}</option>`).join("")}
          </select>
          <small>Automático: data passada = Encerrado; futura com link do Forms = Inscrições abertas; senão, Agendado.</small>
          <small class="adm-erro" data-erro="status"></small>
        </label>
      </fieldset>
      <div class="adm-alerta" id="avisos" role="alert" hidden></div>
      <div class="adm-acoes">
        <button class="btn btn-ouro adm-btn" type="submit">${novo ? "Cadastrar evento" : "Salvar alterações"}</button>
        ${atual ? `<a class="btn btn-line adm-btn" href="#resultados/${encodeURIComponent(atual.id)}">${u.resultado ? "Editar resultado" : "Lançar resultado"}</a>` : ""}
      </div>
      <p class="adm-msg" id="msg-salvar" role="status" aria-live="polite"></p>`;
    tela.appendChild(form);

    const msgSalvar = form.querySelector("#msg-salvar");
    const infoId = form.querySelector("#info-id");
    const conta = form.querySelector("#conta-descricao");
    const caixaAvisos = form.querySelector("#avisos");
    let avisosVistos = "";

    const idCalculado = () => R.idEvento(form.data.value, form.nome.value);
    const atualizarInfo = () => {
      if (idFixo) infoId.textContent = `Identificador: ${atual.id} (fixo: o evento já tem resultado ou decklist)`;
      else if (form.data.value && form.nome.value.trim()) infoId.textContent = `Identificador: ${idCalculado()}`;
      else infoId.textContent = "";
      conta.textContent = `${form.descricao.value.length}/600`;
    };
    ["input", "change"].forEach(t => form.addEventListener(t, () => { atualizarInfo(); caixaAvisos.hidden = true; avisosVistos = ""; }));
    atualizarInfo();

    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      form.querySelectorAll("[data-erro]").forEach(el => { el.textContent = ""; });
      form.querySelectorAll("[aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
      const { dados, erros, avisos } = R.validarEvento(Object.fromEntries(new FormData(form)), hojeBV(), tipos);
      const campos = Object.keys(erros);
      if (campos.length) {
        campos.forEach(c => {
          form.querySelector(`[data-erro="${c}"]`).textContent = erros[c];
          form[c].setAttribute("aria-invalid", "true");
        });
        form[campos[0]].focus();
        mostrarMensagem(msgSalvar, "Confira os campos marcados.", "erro");
        return;
      }
      const novoId = idFixo ? atual.id : R.idEvento(dados.data, dados.nome);
      const outro = d.eventos.find(e => e.id === novoId && (!atual || e.id !== atual.id));
      if (outro) {
        mostrarMensagem(msgSalvar, `Já existe um evento com o identificador ${novoId} (${outro.nome}). Mude o nome ou a data.`, "erro");
        return;
      }
      /* Avisos: mostra uma vez; o segundo toque em salvar confirma */
      const chave = avisos.join("|");
      if (avisos.length && avisosVistos !== chave) {
        caixaAvisos.innerHTML = `<p><b>Confira antes de salvar:</b></p><ul>${avisos.map(a => `<li>${esc(a)}</li>`).join("")}</ul><p class="adm-nota">Toque de novo em salvar para confirmar.</p>`;
        caixaAvisos.hidden = false;
        avisosVistos = chave;
        mostrarMensagem(msgSalvar, "", "");
        return;
      }

      const registro = { id: novoId, nome: dados.nome, data: dados.data, horario: dados.horario, local: dados.local,
        vagas: dados.vagas, tipo: dados.tipo, status: dados.status, inscricao_url: dados.inscricao_url, descricao: dados.descricao };
      if (atual && !novo) {
        const igual = Object.keys(registro).every(k => (atual[k] ?? "") === registro[k]);
        if (igual) { mostrarMensagem(msgSalvar, "Nada mudou.", "ok"); return; }
      }
      const botao = form.querySelector("button[type=submit]");
      botao.disabled = true;
      mostrarMensagem(msgSalvar, "Gravando…");
      try {
        await GitHub.atualizarJSON("publico", ARQ, lista => {
          if (lista.some(e => e.id === novoId && (!atual || e.id !== atual.id))) throw new Error(`Outro organizador acabou de criar o evento ${novoId}. Recarregue a lista.`);
          if (novo) {
            lista.push(registro);
          } else {
            const e = lista.find(x => x.id === atual.id);
            if (!e) throw new Error("Este evento não existe mais no GitHub. Recarregue a lista.");
            Object.assign(e, registro);
          }
          return lista.sort((a, b) => a.data.localeCompare(b.data));
        }, novo ? `Cadastra evento ${novoId}` : novoId !== atual.id ? `Edita evento ${atual.id} → ${novoId}` : `Edita evento ${novoId}`);
        recado = novo ? `${dados.nome} cadastrado. O site atualiza em cerca de 1 minuto.` : "Alterações salvas. O site atualiza em cerca de 1 minuto.";
        location.hash = "#eventos";
      } catch (e) {
        mostrarMensagem(msgSalvar, e.message, "erro");
      } finally {
        botao.disabled = false;
      }
    });

    if (!novo) tela.appendChild(blocoExclusao(atual, u));
    if (novo) form.nome.focus();
  }

  /* ---------- Exclusão ---------- */

  function blocoExclusao(atual, u) {
    const bloco = document.createElement("section");
    bloco.className = "adm-perigo";
    bloco.setAttribute("aria-labelledby", "t-excluir");
    if (u.resultado || u.decklists) {
      bloco.innerHTML = `
        <h2 id="t-excluir">Excluir evento</h2>
        <p class="adm-nota">Não é possível excluir: o evento tem ${u.resultado ? "resultado" : ""}${u.resultado && u.decklists ? " e " : ""}${u.decklists ? `${u.decklists} decklist(s)` : ""}. Apague o resultado antes, em Resultados.</p>`;
      return bloco;
    }
    bloco.innerHTML = `
      <h2 id="t-excluir">Excluir evento</h2>
      <p class="adm-nota">Remove o evento do Calendário. Não dá para desfazer pelo painel.</p>
      <button class="btn adm-btn adm-btn-perigo" type="button" id="excluir">Excluir evento</button>
      <div class="adm-confirma" id="confirma-exclusao" hidden>
        <p><b>Excluir ${esc(atual.nome)} de vez?</b></p>
        <div class="adm-acoes">
          <button class="btn adm-btn adm-btn-perigo" type="button" id="excluir-sim">Sim, excluir</button>
          <button class="btn btn-line adm-btn" type="button" id="excluir-nao">Cancelar</button>
        </div>
      </div>
      <p class="adm-msg" id="msg-excluir" role="status" aria-live="polite"></p>`;
    const botao = bloco.querySelector("#excluir");
    const confirma = bloco.querySelector("#confirma-exclusao");
    const sim = bloco.querySelector("#excluir-sim");
    const msg = bloco.querySelector("#msg-excluir");
    botao.addEventListener("click", () => { botao.hidden = true; confirma.hidden = false; bloco.querySelector("#excluir-nao").focus(); });
    bloco.querySelector("#excluir-nao").addEventListener("click", () => { confirma.hidden = true; botao.hidden = false; botao.focus(); });
    sim.addEventListener("click", async () => {
      sim.disabled = true;
      mostrarMensagem(msg, "Excluindo…");
      try {
        const d = await carregar();
        const agora = usos(atual.id, d);
        if (agora.resultado || agora.decklists) throw new Error("O evento acabou de receber resultado ou decklist. A exclusão foi cancelada.");
        await GitHub.atualizarJSON("publico", ARQ, lista => lista.filter(e => e.id !== atual.id), `Exclui evento ${atual.id}`);
        recado = `${atual.nome} excluído. O site atualiza em cerca de 1 minuto.`;
        location.hash = "#eventos";
      } catch (e) {
        mostrarMensagem(msg, e.message, "erro");
        sim.disabled = false;
      }
    });
    return bloco;
  }

  /* Compartilhado com a tela de Resultados */
  window.PainelEventos = { carregar, cartaoEvento, caixaData };

  /* #eventos = lista; #eventos/novo = cadastro; #eventos/<id> = edição */
  (window.TELAS_PAINEL = window.TELAS_PAINEL || {}).eventos = (tela, secao, param) =>
    param ? formulario(tela, decodeURIComponent(param)) : lista(tela);
})();

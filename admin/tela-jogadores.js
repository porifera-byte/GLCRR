/* Painel GLC RR — tela de Jogadores: lista, busca, cadastro e edição.
   Público (apelido, cidade, desde) → GLCRR data/jogadores.json
   Privado (nome, nascimento)       → GLC-privado jogadores-privado.json
   Mensagens de commit levam só o id do jogador, nunca nome ou data. */
(function () {
  "use strict";

  const R = RegrasJogadores;
  const ARQ_PUBLICO = "data/jogadores.json";
  const ARQ_PRIVADO = "jogadores-privado.json";

  let cache = null;      // { publicos, privados }
  let recado = "";       // mensagem mostrada na próxima tela (depois de salvar)

  async function carregar() {
    const [pub, priv] = await Promise.all([
      GitHub.lerJSON("publico", ARQ_PUBLICO),
      GitHub.lerJSON("privado", ARQ_PRIVADO)
    ]);
    cache = { publicos: pub.dados, privados: priv.dados };
    return cache;
  }

  const privadoDe = (id, privados) => privados.find(p => p.id === id) || null;
  const inicial = nome => esc((nome || "?").trim().charAt(0).toUpperCase());
  const ordenar = lista => [...lista].sort((a, b) => a.apelido.localeCompare(b.apelido, "pt-BR"));

  function textoIdade(nascimento) {
    const anos = R.idade(nascimento, hojeBV());
    if (anos === null) return "";
    return anos < 18 ? `${anos} anos · menor` : `${anos} anos`;
  }

  function mostrarMensagem(el, texto, tipo) {
    el.textContent = texto;
    el.classList.toggle("erro", tipo === "erro");
    el.classList.toggle("ok", tipo === "ok");
  }

  /* ---------- Lista ---------- */

  function cartao(j, priv) {
    const idadeTxt = priv ? textoIdade(priv.nascimento) : "";
    return `<a class="player adm-jogador" href="#jogadores/${encodeURIComponent(j.id)}" data-busca="${esc(R.semAcento([j.apelido, j.id, j.cidade, priv && priv.nome].join(" ")))}">
      <span class="avatar" aria-hidden="true">${inicial(j.apelido)}</span>
      <b>${esc(j.apelido)}</b>
      ${priv && priv.nome ? `<span class="adm-privado">${esc(priv.nome)}</span>` : ""}
      <span class="mini">
        ${j.cidade ? `<span>${esc(j.cidade)}</span>` : ""}
        <span>Desde <b>${esc(j.desde)}</b></span>
        ${idadeTxt ? `<span>${esc(idadeTxt)}</span>` : ""}
      </span>
      <span class="pills">
        ${j.teste ? `<span class="pill">teste</span>` : ""}
        ${!priv ? `<span class="pill warn">sem dados privados</span>` : ""}
      </span>
    </a>`;
  }

  async function lista(tela) {
    tela.innerHTML = `
      <div class="adm-topo">
        <div><p class="eyebrow">Cadastro</p><h1 id="titulo-tela" tabindex="-1">Jogadores</h1></div>
        <a class="btn btn-ouro adm-btn-topo" href="#jogadores/novo">+ Novo jogador</a>
      </div>
      <p class="adm-msg" id="msg-lista" role="status" aria-live="polite"></p>
      <label class="campo adm-busca">
        <span>Buscar</span>
        <input type="search" id="busca" placeholder="Apelido, nome ou cidade" autocomplete="off" disabled>
      </label>
      <p class="adm-nota" id="contagem" aria-live="polite">Carregando…</p>
      <div class="players" id="lista-jogadores" aria-busy="true"></div>`;
    const msg = tela.querySelector("#msg-lista");
    if (recado) { mostrarMensagem(msg, recado, "ok"); recado = ""; }
    let dados;
    try {
      dados = await carregar();
    } catch (e) {
      if (tela.isConnected) { mostrarMensagem(msg, e.message, "erro"); tela.querySelector("#contagem").textContent = ""; }
      return;
    }
    if (!tela.isConnected) return;
    const caixa = tela.querySelector("#lista-jogadores");
    const busca = tela.querySelector("#busca");
    const contagem = tela.querySelector("#contagem");
    const jogadores = ordenar(dados.publicos);
    caixa.removeAttribute("aria-busy");
    if (!jogadores.length) {
      caixa.outerHTML = `<div class="empty"><b>Nenhum jogador cadastrado.</b>Use o botão "+ Novo jogador".</div>`;
      contagem.textContent = "";
      return;
    }
    caixa.innerHTML = jogadores.map(j => cartao(j, privadoDe(j.id, dados.privados))).join("");
    const filtrar = () => {
      const termo = R.semAcento(busca.value.trim());
      let visiveis = 0;
      caixa.querySelectorAll(".adm-jogador").forEach(a => {
        const mostra = !termo || a.dataset.busca.includes(termo);
        a.hidden = !mostra;
        if (mostra) visiveis++;
      });
      contagem.textContent = termo ? `${visiveis} de ${jogadores.length} jogadores` : `${jogadores.length} jogadores`;
    };
    busca.disabled = false;
    busca.addEventListener("input", filtrar);
    filtrar();
  }

  /* ---------- Formulário ---------- */

  async function formulario(tela, id) {
    const novo = id === "novo";
    tela.innerHTML = `
      <a class="link-voltar" href="#jogadores">‹ Jogadores</a>
      <h1 id="titulo-tela" tabindex="-1">${novo ? "Novo jogador" : "Carregando…"}</h1>
      <p class="adm-msg" id="msg-form" role="status" aria-live="polite"></p>`;
    const msgTopo = tela.querySelector("#msg-form");
    let dados;
    try {
      dados = cache || await carregar();
    } catch (e) {
      if (tela.isConnected) mostrarMensagem(msgTopo, e.message, "erro");
      return;
    }
    if (!tela.isConnected) return;
    const atual = novo ? null : dados.publicos.find(j => j.id === id);
    if (!novo && !atual) {
      tela.querySelector("h1").textContent = "Jogador não encontrado";
      mostrarMensagem(msgTopo, "Confira o endereço ou volte para a lista.", "erro");
      return;
    }
    const priv = atual ? privadoDe(atual.id, dados.privados) : null;
    const anoAtual = hojeBV().slice(0, 4);
    tela.querySelector("h1").textContent = novo ? "Novo jogador" : atual.apelido;

    const form = document.createElement("form");
    form.className = "adm-form";
    form.noValidate = true;
    form.innerHTML = `
      <fieldset class="adm-grupo">
        <legend>Público <small>aparece no site</small></legend>
        <label class="campo">
          <span>Apelido *</span>
          <input name="apelido" maxlength="30" autocomplete="off" autocapitalize="words" value="${esc(atual ? atual.apelido : "")}" required>
          <small class="adm-id" id="info-id"></small>
          <small class="adm-erro" data-erro="apelido"></small>
        </label>
        <div class="adm-linha">
          <label class="campo">
            <span>Cidade</span>
            <input name="cidade" maxlength="40" autocomplete="off" value="${esc(atual ? atual.cidade || "" : "")}" placeholder="Opcional">
            <small class="adm-erro" data-erro="cidade"></small>
          </label>
          <label class="campo">
            <span>Na liga desde *</span>
            <input name="desde" type="number" inputmode="numeric" min="2020" max="${Number(anoAtual) + 1}" value="${esc(atual ? atual.desde : anoAtual)}" required>
            <small class="adm-erro" data-erro="desde"></small>
          </label>
        </div>
      </fieldset>
      <fieldset class="adm-grupo adm-grupo-privado">
        <legend>Privado <small>só organizadores</small></legend>
        <label class="campo">
          <span>Nome completo</span>
          <input name="nome" maxlength="80" autocomplete="off" autocapitalize="words" value="${esc(priv ? priv.nome || "" : "")}">
          <small class="adm-erro" data-erro="nome"></small>
        </label>
        <label class="campo">
          <span>Data de nascimento</span>
          <input name="nascimento" type="date" min="1920-01-01" max="${hojeBV()}" value="${esc(priv ? priv.nascimento || "" : "")}">
          <small id="info-idade"></small>
          <small class="adm-erro" data-erro="nascimento"></small>
        </label>
        <p class="adm-nota">Ficam no repositório GLC-privado e nunca vão para o site. Para menores de idade, preencha a data de nascimento.</p>
      </fieldset>
      <div class="adm-alerta" id="parecidos" role="alert" hidden></div>
      <div class="adm-acoes">
        <button class="btn btn-ouro adm-btn" type="submit">${novo ? "Cadastrar" : "Salvar alterações"}</button>
        ${atual && atual.teste ? `<span class="pill">registro de teste</span>` : ""}
      </div>
      <p class="adm-msg" id="msg-salvar" role="status" aria-live="polite"></p>`;
    tela.appendChild(form);
    if (recado) { mostrarMensagem(form.querySelector("#msg-salvar"), recado, "ok"); recado = ""; }

    let confirmouNovo = false;
    const infoId = form.querySelector("#info-id");
    const infoIdade = form.querySelector("#info-idade");
    const atualizarInfo = () => {
      if (novo) {
        const prev = R.idUnico(R.slug(form.apelido.value), dados.publicos.map(j => j.id));
        infoId.textContent = form.apelido.value.trim() ? `Perfil no site: #jogadores/${prev} (não muda depois)` : "";
      } else {
        infoId.textContent = `Perfil no site: #jogadores/${atual.id} (fixo)`;
      }
      infoIdade.textContent = textoIdade(form.nascimento.value);
    };
    form.apelido.addEventListener("input", () => { atualizarInfo(); confirmouNovo = false; form.querySelector("#parecidos").hidden = true; });
    form.nascimento.addEventListener("input", atualizarInfo);
    atualizarInfo();

    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const msg = form.querySelector("#msg-salvar");
      const caixaParecidos = form.querySelector("#parecidos");
      form.querySelectorAll("[data-erro]").forEach(el => { el.textContent = ""; });
      form.querySelectorAll("[aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
      const { dados: d, erros } = R.validar(Object.fromEntries(new FormData(form)), hojeBV());
      const campos = Object.keys(erros);
      if (campos.length) {
        campos.forEach(c => {
          form.querySelector(`[data-erro="${c}"]`).textContent = erros[c];
          form[c].setAttribute("aria-invalid", "true");
        });
        form[campos[0]].focus();
        mostrarMensagem(msg, "Confira os campos marcados.", "erro");
        return;
      }

      /* Apelido parecido com outro jogador: pergunta antes de gravar */
      const mudouApelido = novo || R.chaveComparacao(d.apelido) !== R.chaveComparacao(atual.apelido);
      const parecidos = mudouApelido ? R.parecidosCom(d.apelido, dados.publicos, atual && atual.id) : [];
      if (parecidos.length && !confirmouNovo) {
        caixaParecidos.innerHTML = `
          <p><b>Já existe apelido parecido.</b> ${novo ? "É o mesmo jogador?" : "Confira antes de salvar."}</p>
          <ul>${parecidos.map(j => `<li><a href="#jogadores/${encodeURIComponent(j.id)}">${esc(j.apelido)}</a> <span class="adm-nota">(#jogadores/${esc(j.id)})</span>${novo ? " — é o mesmo: abrir este cadastro" : ""}</li>`).join("")}</ul>
          <button class="btn btn-line adm-btn" type="button" id="confirma-novo">${novo ? "Não, é um jogador novo" : "Sim, manter este apelido"}</button>`;
        caixaParecidos.hidden = false;
        caixaParecidos.querySelector("#confirma-novo").addEventListener("click", () => {
          confirmouNovo = true;
          caixaParecidos.hidden = true;
          form.requestSubmit();
        });
        mostrarMensagem(msg, "", "");
        caixaParecidos.querySelector("a").focus();
        return;
      }

      const botao = form.querySelector("button[type=submit]");
      botao.disabled = true;
      mostrarMensagem(msg, "Gravando…");
      try {
        const idFinal = await salvar(novo, atual, priv, d);
        cache = null;
        if (idFinal === null) {
          mostrarMensagem(msg, "Nada mudou.", "ok");
        } else if (novo) {
          recado = `${d.apelido} cadastrado. O site atualiza em cerca de 1 minuto.`;
          location.hash = `#jogadores/${idFinal}`;
        } else {
          recado = "Alterações salvas. O site atualiza em cerca de 1 minuto.";
          location.hash = "#jogadores";
        }
      } catch (e) {
        mostrarMensagem(msg, e.message, "erro");
        cache = null;
      } finally {
        botao.disabled = false;
      }
    });
    if (novo) form.apelido.focus();
  }

  /* Grava público e privado. Devolve o id, ou null se nada mudou. */
  async function salvar(novo, atual, priv, d) {
    const publico = { apelido: d.apelido, cidade: d.cidade, desde: d.desde };
    const temPrivado = !!(d.nome || d.nascimento);
    const mudouPublico = novo || Object.keys(publico).some(k => (atual[k] ?? "") !== publico[k]);
    const mudouPrivado = temPrivado
      ? !priv || (priv.nome || "") !== d.nome || (priv.nascimento || "") !== d.nascimento
      : !!priv;
    if (!mudouPublico && !mudouPrivado) return null;

    let id = atual ? atual.id : null;
    if (mudouPublico) {
      if (novo) id = R.idUnico(R.slug(d.apelido), (cache ? cache.publicos : []).map(j => j.id));
      await GitHub.atualizarJSON("publico", ARQ_PUBLICO, listaAtual => {
        if (novo) {
          if (listaAtual.some(j => j.id === id)) id = R.idUnico(R.slug(d.apelido), listaAtual.map(j => j.id));
          listaAtual.push({ id, ...publico });
        } else {
          const j = listaAtual.find(x => x.id === id);
          if (!j) throw new Error("Este jogador não existe mais no GitHub. Recarregue a lista.");
          Object.assign(j, publico);
        }
        return listaAtual;
      }, () => `${novo ? "Cadastra" : "Edita"} jogador ${id}`);
    }

    if (mudouPrivado) {
      try {
        await GitHub.atualizarJSON("privado", ARQ_PRIVADO, listaAtual => {
          const i = listaAtual.findIndex(p => p.id === id);
          if (!temPrivado) { if (i >= 0) listaAtual.splice(i, 1); return listaAtual; }
          const reg = { id, nome: d.nome, nascimento: d.nascimento };
          if (i >= 0) listaAtual[i] = { ...listaAtual[i], ...reg };
          else listaAtual.push(reg);
          return listaAtual;
        }, `Dados privados do jogador ${id}`);
      } catch (e) {
        if (mudouPublico) {
          recado = "";
          throw new Error(`Os dados públicos foram gravados, mas os privados não: ${e.message} Abra o cadastro e salve de novo.`);
        }
        throw e;
      }
    }
    return id;
  }

  /* #jogadores = lista; #jogadores/novo = cadastro; #jogadores/<id> = edição */
  (window.TELAS_PAINEL = window.TELAS_PAINEL || {}).jogadores = (tela, secao, param) =>
    param ? formulario(tela, decodeURIComponent(param)) : lista(tela);
})();

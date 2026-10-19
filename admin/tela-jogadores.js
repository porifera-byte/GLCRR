/* Painel GLC RR — tela de Jogadores: lista, busca, cadastro, edição, ícone e exclusão.
   Público (apelido, cidade, desde, icone) → GLCRR data/jogadores.json + assets/img/jogadores/
   Privado (nome, nascimento)              → GLC-privado jogadores-privado.json
   Mensagens de commit levam só o id do jogador, nunca nome ou data. */
(function () {
  "use strict";

  const R = RegrasJogadores;
  const ARQ_PUBLICO = "data/jogadores.json";
  const ARQ_PRIVADO = "jogadores-privado.json";
  const LADO_ICONE = 256;                 // px do ícone gravado
  const MAX_ENTRADA = 15 * 1024 * 1024;   // arquivo escolhido: até 15 MB

  let cache = null;      // { publicos, privados, resultados, decklists }
  let recado = "";       // mensagem mostrada na próxima tela (depois de salvar)

  async function carregar() {
    const [pub, priv, res, dl] = await Promise.all([
      GitHub.lerJSON("publico", ARQ_PUBLICO),
      GitHub.lerJSON("privado", ARQ_PRIVADO),
      GitHub.lerJSON("publico", "data/resultados.json"),
      GitHub.lerJSON("publico", "data/decklists.json")
    ]);
    cache = { publicos: pub.dados, privados: priv.dados, resultados: res.dados, decklists: dl.dados };
    return cache;
  }

  const privadoDe = (id, privados) => privados.find(p => p.id === id) || null;
  const inicial = nome => esc((nome || "?").trim().charAt(0).toUpperCase());
  const ordenar = lista => [...lista].sort((a, b) => a.apelido.localeCompare(b.apelido, "pt-BR"));

  /* Em quantos resultados e decklists o jogador aparece */
  function participacoes(id, dados) {
    const resultados = dados.resultados.filter(r => (r.colocacoes || []).some(c => c.jogador_id === id)).length;
    const decklists = dados.decklists.filter(d => d.jogador_id === id).length;
    return { resultados, decklists, total: resultados + decklists };
  }

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

  /* Avatar: ícone gravado (caminho relativo à raiz do site) ou inicial */
  function avatarHtml(j) {
    return `<span class="avatar" aria-hidden="true" data-inicial="${inicial(j.apelido)}">${R.ICONE_VALIDO.test(j.icone || "")
      ? `<img src="../${esc(j.icone)}" alt="">` : inicial(j.apelido)}</span>`;
  }

  /* Ícone recém-enviado só aparece depois da publicação do site (~1 min): até lá, mostra a inicial */
  function prepararAvatares(raiz) {
    raiz.querySelectorAll(".avatar img").forEach(img => img.addEventListener("error", () => {
      const span = img.parentElement;
      if (span) span.textContent = span.dataset.inicial || "?";
    }));
  }

  /* ---------- Imagem do ícone ---------- */

  /* Recorta o centro em quadrado, reduz para 256 px e regrava (isso também apaga dados ocultos da foto, como GPS).
     Devolve { bytes, extensao, url } */
  async function prepararIcone(arquivo) {
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw new Error("Use uma imagem PNG, JPEG ou WEBP.");
    if (arquivo.size > MAX_ENTRADA) throw new Error("Imagem grande demais (máximo 15 MB).");
    const urlOrigem = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.src = urlOrigem;
      await img.decode().catch(() => { throw new Error("Não foi possível abrir esta imagem."); });
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      if (lado < 64) throw new Error("Imagem pequena demais (mínimo 64 px).");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = LADO_ICONE;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO_ICONE, LADO_ICONE);
      const comoBlob = (tipo, q) => new Promise(ok => canvas.toBlob(ok, tipo, q));
      let blob = await comoBlob("image/webp", 0.85);
      if (!blob || blob.type !== "image/webp") blob = await comoBlob("image/png");   // Safari antigo não gera WEBP
      if (!blob) throw new Error("Não foi possível converter a imagem.");
      return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        extensao: blob.type === "image/webp" ? "webp" : "png",
        url: URL.createObjectURL(blob)
      };
    } finally {
      URL.revokeObjectURL(urlOrigem);
    }
  }

  /* ---------- Lista ---------- */

  function cartao(j, priv) {
    const idadeTxt = priv ? textoIdade(priv.nascimento) : "";
    return `<a class="player adm-jogador" href="#jogadores/${encodeURIComponent(j.id)}" data-busca="${esc(R.semAcento([j.apelido, j.id, j.cidade, priv && priv.nome].join(" ")))}">
      ${avatarHtml(j)}
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
    prepararAvatares(caixa);
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
      dados = await carregar();   // sempre atualizado: a exclusão depende dos resultados atuais
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
    const temIconeAtual = !!(atual && R.ICONE_VALIDO.test(atual.icone || ""));
    tela.querySelector("h1").textContent = novo ? "Novo jogador" : atual.apelido;

    const form = document.createElement("form");
    form.className = "adm-form";
    form.noValidate = true;
    form.innerHTML = `
      <fieldset class="adm-grupo">
        <legend>Público <small>aparece no site</small></legend>
        <div class="adm-icone">
          <span id="previa-icone">${avatarHtml(atual || { apelido: "?" })}</span>
          <div class="adm-icone-acoes">
            <span class="adm-rotulo">Ícone</span>
            <label class="btn btn-line adm-btn-arquivo">
              <input type="file" name="arquivo_icone" accept="image/png,image/jpeg,image/webp" class="adm-arquivo">
              Escolher imagem
            </label>
            <button class="btn btn-line adm-btn-arquivo" type="button" id="remover-icone" ${temIconeAtual ? "" : "hidden"}>Remover ícone</button>
          </div>
        </div>
        <label class="adm-check" id="confirma-icone" hidden>
          <input type="checkbox" name="icone_ok">
          <span>Confirmo que a imagem <b>não mostra rosto</b> de ninguém e <b>não é arte, carta ou logo oficial da Pokémon</b>.</span>
        </label>
        <small class="adm-erro" data-erro="icone"></small>
        <p class="adm-nota">Opcional. O painel recorta o centro em quadrado e reduz para 256 px. Sem ícone, o site mostra a inicial do apelido.</p>
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
    prepararAvatares(form);
    const msgSalvar = form.querySelector("#msg-salvar");
    if (recado) { mostrarMensagem(msgSalvar, recado, "ok"); recado = ""; }

    let confirmouNovo = false;
    /* Ícone: undefined = sem mudança; null = remover o atual; objeto = nova imagem */
    let iconeNovo;
    const previa = form.querySelector("#previa-icone");
    const botaoRemover = form.querySelector("#remover-icone");
    const caixaConfirma = form.querySelector("#confirma-icone");
    const erroIcone = form.querySelector("[data-erro=icone]");

    const mostrarPrevia = () => {
      const apelido = form.apelido.value || (atual && atual.apelido) || "?";
      if (iconeNovo) previa.innerHTML = `<span class="avatar" aria-hidden="true"><img src="${iconeNovo.url}" alt=""></span>`;
      else if (iconeNovo === null || !temIconeAtual) previa.innerHTML = `<span class="avatar" aria-hidden="true">${inicial(apelido)}</span>`;
    };

    form.arquivo_icone.addEventListener("change", async () => {
      const arquivo = form.arquivo_icone.files[0];
      erroIcone.textContent = "";
      if (!arquivo) return;
      try {
        const preparado = await prepararIcone(arquivo);
        if (iconeNovo && iconeNovo.url) URL.revokeObjectURL(iconeNovo.url);
        iconeNovo = preparado;
        form.icone_ok.checked = false;
        caixaConfirma.hidden = false;
        botaoRemover.hidden = false;
        mostrarPrevia();
      } catch (e) {
        erroIcone.textContent = e.message;
      } finally {
        form.arquivo_icone.value = "";
      }
    });

    form.icone_ok.addEventListener("change", () => { if (form.icone_ok.checked) erroIcone.textContent = ""; });

    botaoRemover.addEventListener("click", () => {
      if (iconeNovo && iconeNovo.url) URL.revokeObjectURL(iconeNovo.url);
      iconeNovo = temIconeAtual ? null : undefined;
      caixaConfirma.hidden = true;
      botaoRemover.hidden = true;
      erroIcone.textContent = "";
      mostrarPrevia();
    });

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
    form.apelido.addEventListener("input", () => {
      atualizarInfo();
      confirmouNovo = false;
      form.querySelector("#parecidos").hidden = true;
      mostrarPrevia();
    });
    form.nascimento.addEventListener("input", atualizarInfo);
    atualizarInfo();

    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const caixaParecidos = form.querySelector("#parecidos");
      form.querySelectorAll("[data-erro]").forEach(el => { el.textContent = ""; });
      form.querySelectorAll("[aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
      const { dados: d, erros } = R.validar(Object.fromEntries(new FormData(form)), hojeBV());
      if (iconeNovo && !form.icone_ok.checked) erros.icone = "Marque a confirmação sobre a imagem.";
      const campos = Object.keys(erros);
      if (campos.length) {
        campos.forEach(c => {
          form.querySelector(`[data-erro="${c}"]`).textContent = erros[c];
          if (c !== "icone") form[c].setAttribute("aria-invalid", "true");
        });
        (campos[0] === "icone" ? form.icone_ok : form[campos[0]]).focus();
        mostrarMensagem(msgSalvar, "Confira os campos marcados.", "erro");
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
        mostrarMensagem(msgSalvar, "", "");
        caixaParecidos.querySelector("a").focus();
        return;
      }

      const botao = form.querySelector("button[type=submit]");
      botao.disabled = true;
      mostrarMensagem(msgSalvar, "Gravando…");
      try {
        const idFinal = await salvar(novo, atual, priv, d, iconeNovo);
        cache = null;
        if (idFinal === null) {
          mostrarMensagem(msgSalvar, "Nada mudou.", "ok");
        } else if (novo) {
          recado = `${d.apelido} cadastrado. O site atualiza em cerca de 1 minuto.`;
          location.hash = `#jogadores/${idFinal}`;
        } else {
          recado = "Alterações salvas. O site atualiza em cerca de 1 minuto.";
          location.hash = "#jogadores";
        }
      } catch (e) {
        mostrarMensagem(msgSalvar, e.message, "erro");
        cache = null;
      } finally {
        botao.disabled = false;
      }
    });

    if (!novo) tela.appendChild(blocoExclusao(atual, dados));
    if (novo) form.apelido.focus();
  }

  /* Grava ícone, público e privado. Devolve o id, ou null se nada mudou. */
  async function salvar(novo, atual, priv, d, iconeNovo) {
    const publico = { apelido: d.apelido, cidade: d.cidade, desde: d.desde };
    const temPrivado = !!(d.nome || d.nascimento);
    const mudouIcone = iconeNovo !== undefined;
    const mudouPublico = novo || mudouIcone || Object.keys(publico).some(k => (atual[k] ?? "") !== publico[k]);
    const mudouPrivado = temPrivado
      ? !priv || (priv.nome || "") !== d.nome || (priv.nascimento || "") !== d.nascimento
      : !!priv;
    if (!mudouPublico && !mudouPrivado) return null;

    let id = atual ? atual.id : null;
    const iconeAntigo = atual && R.ICONE_VALIDO.test(atual.icone || "") ? atual.icone : null;
    if (mudouPublico) {
      if (novo) id = R.idUnico(R.slug(d.apelido), (cache ? cache.publicos : []).map(j => j.id));
      if (iconeNovo) {
        publico.icone = R.caminhoIcone(id, iconeNovo.extensao);
        await GitHub.gravarBinario("publico", publico.icone, iconeNovo.bytes, `Ícone do jogador ${id}`);
      }
      await GitHub.atualizarJSON("publico", ARQ_PUBLICO, listaAtual => {
        if (novo) {
          if (listaAtual.some(j => j.id === id)) throw new Error("Outro organizador acabou de cadastrar um jogador com este apelido. Volte à lista e confira.");
          listaAtual.push({ id, ...publico });
        } else {
          const j = listaAtual.find(x => x.id === id);
          if (!j) throw new Error("Este jogador não existe mais no GitHub. Recarregue a lista.");
          Object.assign(j, publico);
          if (iconeNovo === null) delete j.icone;
        }
        return listaAtual;
      }, `${novo ? "Cadastra" : "Edita"} jogador ${id}`);
      /* O ícone antigo sai depois que o JSON já aponta para o novo */
      if (mudouIcone && iconeAntigo) {
        await GitHub.apagarArquivo("publico", iconeAntigo, `Remove ícone antigo do jogador ${id}`).catch(() => {});
      }
    }

    if (mudouPrivado) {
      try {
        await gravarPrivado(id, temPrivado ? { id, nome: d.nome, nascimento: d.nascimento } : null);
      } catch (e) {
        if (mudouPublico) throw new Error(`Os dados públicos foram gravados, mas os privados não: ${e.message} Abra o cadastro e salve de novo.`);
        throw e;
      }
    }
    return id;
  }

  /* reg = null apaga o registro privado */
  function gravarPrivado(id, reg) {
    return GitHub.atualizarJSON("privado", ARQ_PRIVADO, listaAtual => {
      const i = listaAtual.findIndex(p => p.id === id);
      if (!reg) { if (i >= 0) listaAtual.splice(i, 1); return listaAtual; }
      if (i >= 0) listaAtual[i] = { ...listaAtual[i], ...reg };
      else listaAtual.push(reg);
      return listaAtual;
    }, `Dados privados do jogador ${id}`);
  }

  /* ---------- Exclusão ---------- */

  function blocoExclusao(atual, dados) {
    const uso = participacoes(atual.id, dados);
    const bloco = document.createElement("section");
    bloco.className = "adm-perigo";
    bloco.setAttribute("aria-labelledby", "t-excluir");
    if (uso.total) {
      bloco.innerHTML = `
        <h2 id="t-excluir">Excluir jogador</h2>
        <p class="adm-nota">Não é possível excluir: ${esc(atual.apelido)} aparece em ${uso.resultados} resultado(s) e ${uso.decklists} decklist(s). Apagar quebraria o histórico dos eventos. Se precisar mesmo, peça pelo chat do projeto.</p>`;
      return bloco;
    }
    bloco.innerHTML = `
      <h2 id="t-excluir">Excluir jogador</h2>
      <p class="adm-nota">Apaga o cadastro público, os dados privados e o ícone. Não dá para desfazer pelo painel.</p>
      <button class="btn adm-btn adm-btn-perigo" type="button" id="excluir">Excluir ${esc(atual.apelido)}</button>
      <div class="adm-confirma" id="confirma-exclusao" hidden>
        <p><b>Excluir ${esc(atual.apelido)} de vez?</b></p>
        <div class="adm-acoes">
          <button class="btn adm-btn adm-btn-perigo" type="button" id="excluir-sim">Sim, excluir</button>
          <button class="btn btn-line adm-btn" type="button" id="excluir-nao">Cancelar</button>
        </div>
      </div>
      <p class="adm-msg" id="msg-excluir" role="status" aria-live="polite"></p>`;
    const confirma = bloco.querySelector("#confirma-exclusao");
    const botao = bloco.querySelector("#excluir");
    const botaoSim = bloco.querySelector("#excluir-sim");
    const msg = bloco.querySelector("#msg-excluir");
    botao.addEventListener("click", () => {
      botao.hidden = true;
      confirma.hidden = false;
      bloco.querySelector("#excluir-nao").focus();
    });
    bloco.querySelector("#excluir-nao").addEventListener("click", () => {
      confirma.hidden = true;
      botao.hidden = false;
      botao.focus();
    });
    botaoSim.addEventListener("click", async () => {
      botaoSim.disabled = true;
      mostrarMensagem(msg, "Excluindo…");
      try {
        await excluir(atual);
        cache = null;
        recado = `${atual.apelido} excluído. O site atualiza em cerca de 1 minuto.`;
        location.hash = "#jogadores";
      } catch (e) {
        mostrarMensagem(msg, e.message, "erro");
        botaoSim.disabled = false;
        cache = null;
      }
    });
    return bloco;
  }

  async function excluir(atual) {
    const id = atual.id;
    /* Confere de novo no GitHub: alguém pode ter lançado um resultado agora */
    const dados = await carregar();
    if (participacoes(id, dados).total) throw new Error("Este jogador acabou de entrar em um resultado. A exclusão foi cancelada.");
    await GitHub.atualizarJSON("publico", ARQ_PUBLICO, lista => lista.filter(j => j.id !== id), `Exclui jogador ${id}`);
    if (privadoDe(id, dados.privados)) await gravarPrivado(id, null);
    if (R.ICONE_VALIDO.test(atual.icone || "")) {
      await GitHub.apagarArquivo("publico", atual.icone, `Remove ícone do jogador ${id}`).catch(() => {});
    }
  }

  /* #jogadores = lista; #jogadores/novo = cadastro; #jogadores/<id> = edição */
  (window.TELAS_PAINEL = window.TELAS_PAINEL || {}).jogadores = (tela, secao, param) =>
    param ? formulario(tela, decodeURIComponent(param)) : lista(tela);
})();

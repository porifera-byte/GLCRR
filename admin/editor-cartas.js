/* Painel GLC RR — montador de decklist (usado no cartão "Decklists do Top 3" da tela de Resultados).
   Busca de cartas na API pública do pokemontcg.io (só cartas legais no Expanded, sem Rule Box nem ACE SPEC),
   lista com quantidades, importação do texto exportado do TCG Live e conferências do GLC (só avisam).
   As regras ficam em regras-cartas.js; agrupar e gerar o texto do TCG Live vêm de assets/js/data.js. */
(function () {
  "use strict";

  const R = RegrasCartas;
  const ESPERA = 15000;
  /* O pokemontcg.io falha com frequência (HTTP 500 ou queda passageira, que o navegador mostra como erro de rede).
     Por isso cada busca tenta até 3 vezes, com pausa crescente, antes de mostrar o erro. */
  const TENTATIVAS = 3;
  const PAUSAS = [1200, 2500];
  const pausa = ms => new Promise(r => setTimeout(r, ms));

  class ErroApi extends Error {
    constructor(mensagem, repetir) { super(mensagem); this.repetir = repetir; }
  }

  async function lerUmaVez(url) {
    const ctrl = new AbortController();
    const relogio = setTimeout(() => ctrl.abort(), ESPERA);
    let resp;
    try {
      resp = await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    } catch (e) {
      throw new ErroApi(e.name === "AbortError" ? "A base de cartas (pokemontcg.io) demorou demais para responder."
        : "A base de cartas (pokemontcg.io) não respondeu.", true);
    } finally {
      clearTimeout(relogio);
    }
    if (resp.status === 429) throw new ErroApi("A base de cartas limitou as buscas por agora. Espere alguns minutos ou cole a lista do TCG Live.", false);
    if (!resp.ok) throw new ErroApi(`A base de cartas (pokemontcg.io) respondeu com erro (HTTP ${resp.status}).`, resp.status >= 500);
    const json = await resp.json().catch(() => { throw new ErroApi("A base de cartas mandou uma resposta incompleta.", true); });
    return { cartas: Array.isArray(json.data) ? json.data : [], total: Number(json.totalCount) || 0 };
  }

  /* aoTentarDeNovo(n): avisa a tela antes da tentativa n (2 ou 3) */
  async function lerApi(url, aoTentarDeNovo) {
    for (let n = 1; ; n++) {
      try {
        return await lerUmaVez(url);
      } catch (e) {
        if (!e.repetir || n >= TENTATIVAS) {
          throw new Error(e.repetir ? `${e.message} Tentei ${TENTATIVAS} vezes; o serviço costuma voltar em instantes. Tente de novo ou cole a lista do TCG Live.` : e.message);
        }
        if (aoTentarDeNovo) aoTentarDeNovo(n + 1);
        await pausa(PAUSAS[n - 1]);
      }
    }
  }

  const imgCarta = (url, classe) => R.CARTA_IMG_VALIDA.test(url || "")
    ? `<img class="${classe}" src="${esc(url)}" alt="" loading="lazy" decoding="async">` : `<span class="${classe} adm-carta-sem"></span>`;
  const codigo = c => [c.colecao, c.numero].filter(Boolean).join(" ");

  let sequencia = 0;

  /* opcoes: { cartas, tipo (do deck, em português), banlist (Promise de data/banlist.json), aoMudar,
     anteriores: RegrasCartas.listasAnteriores(...) do mesmo jogador, para copiar e ajustar } */
  function criar(opcoes) {
    const id = `mt${++sequencia}`;
    let cartas = R.sanitizarCartas(opcoes.cartas);
    const anteriores = opcoes.anteriores || [];
    let banlist = { cartas: [] };
    let avisosImportacao = [];
    let resultados = [];
    let termo = "", categoria = "", pagina = 1, totalBusca = 0, escondidas = 0;
    Promise.resolve(opcoes.banlist).then(b => { if (b && Array.isArray(b.cartas)) { banlist = b; desenharAvisos(); } }).catch(() => {});

    const el = document.createElement("section");
    el.className = "adm-montar";
    el.setAttribute("aria-labelledby", `${id}-t`);
    el.innerHTML = `
      <div class="adm-montar-topo">
        <h4 id="${id}-t">Lista montada <span class="adm-montar-total"></span></h4>
        <button class="btn btn-line btn-sm adm-btn-texto-perigo" type="button" data-acao="limpar">Limpar lista</button>
      </div>
      ${anteriores.length ? `<div class="adm-montar-anteriores">
        <p class="adm-nota">Partir de uma lista anterior do jogador (substitui a lista atual; depois é só ajustar o que mudou):</p>
        <div class="adm-acoes">${anteriores.map((a, i) => `<button class="btn btn-line btn-sm" type="button" data-anterior="${i}">${esc(a.nome)}${a.data ? ` · ${esc(dataBR(a.data))}` : ""} (${R.total(a.cartas)} cartas)</button>`).join("")}</div>
        <p class="adm-msg" data-msg="anterior" role="status" aria-live="polite"></p>
      </div>` : ""}
      <ul class="adm-montar-avisos" aria-live="polite"></ul>
      <div class="adm-montar-grade">
        <div class="adm-montar-lista" aria-label="Cartas da lista"></div>
        <div class="adm-montar-busca">
          <div class="adm-montar-campo" role="search">
            <label class="campo">
              <span>Buscar carta</span>
              <input type="search" name="termo" placeholder="Ex.: dusclops, iono, energy" autocomplete="off" spellcheck="false" maxlength="60">
            </label>
            <button class="btn btn-ouro" type="button" data-acao="buscar">Buscar</button>
          </div>
          <div class="filtros" role="group" aria-label="Categoria da carta">
            ${["", ...R.CATEGORIAS].map(c => `<button type="button" class="chip-filtro" data-categoria="${esc(c)}" aria-pressed="${c === ""}">${c || "Todas"}</button>`).join("")}
          </div>
          <p class="adm-msg" data-msg="busca" role="status" aria-live="polite">Só aparecem cartas legais no Expanded, sem Rule Box nem ACE SPEC. Toque numa carta para incluir.</p>
          <ul class="adm-montar-resultados"></ul>
          <button class="btn btn-line adm-btn" type="button" data-acao="mais" hidden>Mostrar mais</button>
        </div>
      </div>
      <details class="adm-mais">
        <summary>Colar lista do TCG Live</summary>
        <div class="adm-form">
          <label class="campo">
            <span>Texto exportado (Exportar lista no TCG Live)</span>
            <textarea name="importar" rows="8" maxlength="6000" placeholder="Pokémon: 12&#10;1 Duskull SFA 18&#10;..."></textarea>
          </label>
          <p class="adm-nota">A importação substitui a lista atual. Cartas não encontradas entram só com o nome, sem imagem.</p>
          <button class="btn btn-line adm-btn" type="button" data-acao="importar">Importar lista</button>
          <p class="adm-msg" data-msg="importar" role="status" aria-live="polite"></p>
        </div>
      </details>`;

    const $ = sel => el.querySelector(sel);
    const campoTermo = $("[name=termo]");
    const msgBusca = $("[data-msg=busca]");
    const msgImportar = $("[data-msg=importar]");
    const botaoMais = $("[data-acao=mais]");
    const botaoLimpar = $("[data-acao=limpar]");
    const listaResultados = $(".adm-montar-resultados");

    function mensagem(alvo, texto, tipo) {
      alvo.textContent = texto;
      alvo.classList.toggle("erro", tipo === "erro");
      alvo.classList.toggle("ok", tipo === "ok");
    }

    function mudou() {
      desenharLista();
      desenharAvisos();
      marcarResultados();
      if (opcoes.aoMudar) opcoes.aoMudar(cartas);
    }

    function desenharLista() {
      const n = R.total(cartas);
      $(".adm-montar-total").textContent = `· ${n} ${n === 1 ? "carta" : "cartas"}`;
      botaoLimpar.hidden = !cartas.length;
      const caixa = $(".adm-montar-lista");
      if (!cartas.length) {
        caixa.innerHTML = `<p class="adm-nota">Nenhuma carta ainda. Busque e toque nas cartas, ou cole a lista exportada do TCG Live.</p>`;
        return;
      }
      caixa.innerHTML = R.CATEGORIAS.map(cat => {
        const doGrupo = cartas.map((c, i) => [c, i]).filter(([c]) => c.categoria === cat);
        if (!doGrupo.length) return "";
        const soma = doGrupo.reduce((s, [c]) => s + c.qtd, 0);
        return `<h5>${esc(cat)} <span>${soma}</span></h5><ul class="adm-cartas">${doGrupo.map(([c, i]) => `
          <li class="adm-carta">
            ${imgCarta(c.img, "adm-carta-mini")}
            <span class="adm-carta-nome"><b>${esc(c.nome)}</b><small>${esc(codigo(c))}</small></span>
            <span class="adm-carta-qtd">
              <button class="btn btn-line" type="button" data-menos="${i}" aria-label="Tirar uma ${esc(c.nome)}">−</button>
              <b>${c.qtd}</b>
              <button class="btn btn-line" type="button" data-mais="${i}" aria-label="Pôr mais uma ${esc(c.nome)}">+</button>
            </span>
          </li>`).join("")}</ul>`;
      }).join("");
    }

    function desenharAvisos() {
      const avisos = cartas.length ? [...avisosImportacao, ...R.conferirLista(cartas, opcoes.tipo, banlist)] : avisosImportacao;
      $(".adm-montar-avisos").innerHTML = avisos.map(a => `<li>⚠️ ${esc(a)}</li>`).join("");
    }

    function marcarResultados() {
      listaResultados.querySelectorAll("[data-i]").forEach(b => {
        const c = resultados[Number(b.dataset.i)];
        const na = cartas.find(x => x.id === c.id);
        const selo = b.querySelector(".adm-res-qtd");
        selo.hidden = !na;
        selo.textContent = na ? `×${na.qtd}` : "";
      });
    }

    function desenharResultados(inicio) {
      const html = resultados.slice(inicio).map((c, k) => {
        const i = inicio + k;
        const r = R.cartaDaApi(c);
        const set = (c.set && c.set.name) || "";
        return `<li><button type="button" class="adm-res" data-i="${i}" aria-label="Incluir ${esc(r.nome)} (${esc(codigo(r))})">
          ${imgCarta(r.img, "adm-res-img")}
          <span class="adm-res-nome">${esc(r.nome)}</span>
          <small>${esc([codigo(r), set].filter(Boolean).join(" · "))}</small>
          <span class="adm-res-qtd" hidden></span>
        </button></li>`;
      }).join("");
      if (inicio === 0) listaResultados.innerHTML = html;
      else listaResultados.insertAdjacentHTML("beforeend", html);
      marcarResultados();
    }

    async function buscar(novaBusca) {
      if (novaBusca) {
        termo = campoTermo.value.trim();
        pagina = 1;
        escondidas = 0;
      }
      const url = R.urlBusca(termo, categoria, pagina);
      if (!url) { mensagem(msgBusca, "Digite o nome da carta (ao menos 2 letras).", "erro"); campoTermo.focus(); return; }
      const botoes = el.querySelectorAll("[data-acao=buscar],[data-acao=mais]");
      botoes.forEach(b => { b.disabled = true; });
      mensagem(msgBusca, "Buscando…");
      try {
        const resposta = await lerApi(url, n => mensagem(msgBusca, `A base de cartas falhou; tentando de novo (${n}ª tentativa)…`));
        totalBusca = resposta.total;
        const validas = resposta.cartas.filter(c => !R.motivoIlegal(c, banlist));
        escondidas += resposta.cartas.length - validas.length;
        const inicio = novaBusca ? 0 : resultados.length;
        resultados = novaBusca ? validas : resultados.concat(validas);
        desenharResultados(inicio);
        const vistas = pagina * R.POR_PAGINA;
        botaoMais.hidden = vistas >= totalBusca;
        mensagem(msgBusca, !resultados.length ? "Nenhuma carta encontrada. Confira o nome (em inglês, como no TCG Live)."
          : `${resultados.length} ${resultados.length === 1 ? "carta" : "cartas"}${totalBusca > vistas ? ` de ${totalBusca}` : ""}` +
            `${escondidas ? ` (${escondidas} fora do GLC escondidas)` : ""}. Toque para incluir.`, resultados.length ? "ok" : "erro");
      } catch (e) {
        mensagem(msgBusca, e.message, "erro");
      } finally {
        botoes.forEach(b => { b.disabled = false; });
      }
    }

    async function importar() {
      const { linhas, erros } = R.lerTextoLive($("[name=importar]").value);
      if (!linhas.length) { mensagem(msgImportar, erros[0] || "Cole o texto exportado do TCG Live.", "erro"); return; }
      const botao = $("[data-acao=importar]");
      botao.disabled = true;
      mensagem(msgImportar, "Procurando as cartas na base…");
      try {
        let achadas = [];
        let falhou = "";
        for (const url of R.consultasImportacao(linhas)) {
          try { achadas = achadas.concat((await lerApi(url, n => mensagem(msgImportar, `A base de cartas falhou; tentando de novo (${n}ª tentativa)…`))).cartas); }
          catch (e) { falhou = e.message; break; }
        }
        const r = R.resolverImportacao(linhas, achadas, banlist);
        cartas = R.sanitizarCartas(r.cartas);
        avisosImportacao = [...erros, ...(falhou ? [`Busca interrompida: ${falhou} As cartas que faltaram entraram só com o nome.`] : []), ...r.avisos];
        mudou();
        mensagem(msgImportar, `${R.total(cartas)} cartas importadas${avisosImportacao.length ? "; confira os avisos acima da lista" : ""}.`, "ok");
      } finally {
        botao.disabled = false;
      }
    }

    el.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b || !el.contains(b)) return;
      if (b.dataset.acao === "buscar") { buscar(true); return; }
      if (b.dataset.acao === "mais") { pagina++; buscar(false); return; }
      if (b.dataset.acao === "importar") { importar(); return; }
      if (b.dataset.acao === "limpar") {
        if (b.dataset.confirmar !== "1") {
          b.dataset.confirmar = "1";
          b.textContent = "Toque de novo para limpar";
          setTimeout(() => { b.dataset.confirmar = ""; b.textContent = "Limpar lista"; }, 5000);
          return;
        }
        b.dataset.confirmar = "";
        b.textContent = "Limpar lista";
        cartas = [];
        avisosImportacao = [];
        mudou();
        return;
      }
      if (b.dataset.anterior != null) {
        const a = anteriores[Number(b.dataset.anterior)];
        const msg = $("[data-msg=anterior]");
        if (cartas.length && b.dataset.confirmar !== "1") {
          el.querySelectorAll("[data-anterior]").forEach(x => { x.dataset.confirmar = ""; });
          b.dataset.confirmar = "1";
          mensagem(msg, `A lista atual (${R.total(cartas)} cartas) será substituída. Toque de novo em "${a.nome}" para confirmar.`, "erro");
          setTimeout(() => { if (b.dataset.confirmar === "1") { b.dataset.confirmar = ""; mensagem(msg, ""); } }, 5000);
          return;
        }
        b.dataset.confirmar = "";
        cartas = R.sanitizarCartas(a.cartas);
        avisosImportacao = [];
        mudou();
        mensagem(msg, `Lista de ${a.nome} copiada (${R.total(cartas)} cartas). Ajuste o que mudou e salve a decklist.`, "ok");
        return;
      }
      if (b.hasAttribute("data-categoria")) {
        categoria = b.dataset.categoria;
        el.querySelectorAll("[data-categoria]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        if (campoTermo.value.trim()) buscar(true);
        return;
      }
      if (b.dataset.i != null) {
        cartas = R.sanitizarCartas(R.somar(cartas, R.cartaDaApi(resultados[Number(b.dataset.i)])));
        mudou();
        return;
      }
      const i = Number(b.dataset.mais ?? b.dataset.menos);
      if (!cartas[i]) return;
      const nome = cartas[i].nome;
      if (b.dataset.mais != null) cartas[i].qtd = Math.min(60, cartas[i].qtd + 1);
      else if (--cartas[i].qtd < 1) cartas.splice(i, 1);
      mudou();
      /* Mantém o foco na mesma carta depois de redesenhar */
      const mesma = [...el.querySelectorAll(".adm-carta")].find(li => li.querySelector("b").textContent === nome);
      const alvo = mesma && mesma.querySelector(b.dataset.mais != null ? "[data-mais]" : "[data-menos]");
      (alvo || campoTermo).focus();
    });
    campoTermo.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); buscar(true); } });
    /* Imagem de carta que não carrega some, sem handler inline (CSP) */
    el.addEventListener("error", e => {
      if (e.target instanceof HTMLImageElement) e.target.replaceWith(Object.assign(document.createElement("span"), { className: `${e.target.className} adm-carta-sem` }));
    }, true);

    desenharLista();
    desenharAvisos();

    return {
      el,
      valor: () => R.sanitizarCartas(cartas),
      definir(lista) { cartas = R.sanitizarCartas(lista); avisosImportacao = []; mudou(); }
    };
  }

  window.EditorCartas = { criar };
})();

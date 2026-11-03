/* Painel GLC RR — montador de decklist (usado no cartão "Decklists do Top 3" da tela de Resultados).
   Cartas da TCGdex (api.tcgdex.net), consultada em tempo real: busca em português e em inglês, imagens direto
   do servidor da TCGdex (não ficam no repositório). As regras do GLC ficam em regras-cartas.js; agrupar e gerar
   o texto do TCG Live vêm de assets/js/data.js. Tudo o que já foi consultado fica em cache no navegador. */
(function () {
  "use strict";

  const R = RegrasCartas;

  /* ---------- Cache no navegador ----------
     Memória da aba + localStorage (sobrevive entre sessões). localStorage pode faltar ou estar cheio:
     tudo em try/catch, e o painel funciona sem ele (só faz mais pedidos). */
  const PREFIXO = "glcrr-tcgdex:";
  const DIA = 24 * 60 * 60 * 1000;
  const memoria = new Map();
  const cache = {
    ler(chave, validade) {
      if (memoria.has(chave)) return memoria.get(chave);
      try {
        const item = JSON.parse(localStorage.getItem(PREFIXO + chave) || "null");
        if (item && Date.now() - item.t < validade) { memoria.set(chave, item.v); return item.v; }
      } catch (e) { /* sem cache: segue */ }
      return undefined;
    },
    gravar(chave, valor) {
      memoria.set(chave, valor);
      const texto = JSON.stringify({ t: Date.now(), v: valor });
      try { localStorage.setItem(PREFIXO + chave, texto); }
      catch (e) {
        /* Cheio: apaga o cache do montador e tenta uma vez */
        try {
          Object.keys(localStorage).filter(k => k.startsWith(PREFIXO)).forEach(k => localStorage.removeItem(k));
          localStorage.setItem(PREFIXO + chave, texto);
        } catch (e2) { /* fica só na memória */ }
      }
    }
  };

  /* ---------- TCGdex ---------- */

  const ESPERA = 15000;
  const TENTATIVAS = 3;
  const PAUSAS = [800, 2000];
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
      throw new ErroApi(e.name === "AbortError" ? "A base de cartas (TCGdex) demorou demais para responder." : "A base de cartas (TCGdex) não respondeu.", true);
    } finally {
      clearTimeout(relogio);
    }
    if (resp.status === 404) return null;
    if (resp.status === 429) throw new ErroApi("A base de cartas limitou os pedidos por agora. Espere alguns minutos.", false);
    if (!resp.ok) throw new ErroApi(`A base de cartas (TCGdex) respondeu com erro (HTTP ${resp.status}).`, resp.status >= 500);
    return resp.json().catch(() => { throw new ErroApi("A base de cartas mandou uma resposta incompleta.", true); });
  }

  /* GET com até 3 tentativas. 404 devolve null (ex.: carta sem versão em português). */
  async function ler(url, aoTentarDeNovo) {
    for (let n = 1; ; n++) {
      try {
        return await lerUmaVez(url);
      } catch (e) {
        if (!e.repetir || n >= TENTATIVAS) throw new Error(e.repetir ? `${e.message} Tentei ${TENTATIVAS} vezes. Tente de novo em instantes.` : e.message);
        if (aoTentarDeNovo) aoTentarDeNovo(n + 1);
        await pausa(PAUSAS[n - 1]);
      }
    }
  }

  /* Executa fn em todos os itens, até `limite` pedidos ao mesmo tempo */
  async function emParalelo(itens, limite, fn) {
    const saida = new Array(itens.length);
    let proximo = 0;
    await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (proximo < itens.length) { const i = proximo++; saida[i] = await fn(itens[i], i); }
    }));
    return saida;
  }

  /* Coleções permitidas no GLC (séries de Black & White em diante), guardadas por 7 dias */
  let colecoesPromessa = null;
  function colecoesGLC() {
    const guardado = cache.ler("colecoes", 7 * DIA);
    if (guardado) return Promise.resolve(guardado);
    if (!colecoesPromessa) {
      colecoesPromessa = Promise.all(R.SERIES_GLC.map(id => ler(R.urlSerie(id)))).then(series => {
        const mapa = R.colecoesDasSeries(series);
        if (!Object.keys(mapa).length) throw new Error("A base de cartas não devolveu as coleções. Tente de novo.");
        cache.gravar("colecoes", mapa);
        return mapa;
      }).finally(() => { colecoesPromessa = null; });
    }
    return colecoesPromessa;
  }

  /* Detalhe da carta em inglês (regras do GLC e nome gravado), guardado por 30 dias */
  async function detalhe(id) {
    const chave = `carta:${id}`;
    const guardado = cache.ler(chave, 30 * DIA);
    if (guardado) return guardado;
    const d = R.resumirDetalhe(await ler(R.urlCarta(id, "en")));
    if (d) cache.gravar(chave, d);
    return d;
  }

  /* Coleção completa (sigla oficial e números das cartas), guardada por 30 dias */
  async function colecao(id) {
    const chave = `colecao:${id}`;
    const guardado = cache.ler(chave, 30 * DIA);
    if (guardado) return guardado;
    const c = await ler(R.urlColecao(id));
    if (!c) return null;
    const r = { id: c.id, sigla: (c.abbreviation && c.abbreviation.official) || c.tcgOnline || "",
      cards: (c.cards || []).map(x => ({ id: x.id, localId: x.localId })) };
    cache.gravar(chave, r);
    return r;
  }

  /* Coleção pela sigla do TCG Live (ex.: SFA), só entre as permitidas */
  async function colecaoPorSigla(sigla, colecoes) {
    const chave = `sigla:${sigla}`;
    let id = cache.ler(chave, 30 * DIA);
    if (id === undefined) {
      const lista = await ler(R.urlColecaoPorSigla(sigla)) || [];
      const achada = lista.find(s => s && colecoes[s.id]);
      id = achada ? achada.id : "";
      cache.gravar(chave, id);
    }
    return id ? colecao(id) : null;
  }

  /* Busca nas duas línguas; o resultado de cada termo fica na memória da aba */
  async function buscarCartas(termo, categoria, colecoes, aoTentarDeNovo) {
    const urls = R.urlsBusca(termo, categoria);
    if (!urls) return null;
    const chave = `${urls.pt}|${urls.en}`;
    if (memoria.has(chave)) return memoria.get(chave);
    const [pt, en] = await Promise.allSettled([ler(urls.pt), ler(urls.en, aoTentarDeNovo)]);
    if (pt.status === "rejected" && en.status === "rejected") throw en.reason;
    const r = R.juntarResultados(pt.status === "fulfilled" ? pt.value : [], en.status === "fulfilled" ? en.value : [], colecoes);
    memoria.set(chave, r);
    return r;
  }

  /* Linhas (texto do TCG Live ou cartas antigas) → cartas da TCGdex */
  async function resolverLinhas(linhas, banlist, aoTentarDeNovo) {
    const colecoes = await colecoesGLC();
    const siglas = {};
    await emParalelo([...new Set(linhas.filter(l => l.colecao && l.numero).map(l => l.colecao.toUpperCase()))], 4, async s => {
      siglas[s] = await colecaoPorSigla(s, colecoes).catch(() => null);
    });
    const achadas = R.idsDasLinhas(linhas, siglas);
    const detalhes = {};
    await emParalelo([...new Set(achadas.map(a => a.id).filter(Boolean))], 6, async id => {
      detalhes[id] = await detalhe(id).catch(() => null);
    });
    return R.resolverImportacao(achadas, detalhes, colecoes, banlist);
  }

  /* ---------- Tela ---------- */

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
    let visiveis = 0;
    let categoria = "";
    const incluindo = new Set();
    Promise.resolve(opcoes.banlist).then(b => { if (b && Array.isArray(b.cartas)) { banlist = b; desenharAvisos(); } }).catch(() => {});

    const el = document.createElement("section");
    el.className = "adm-montar";
    el.setAttribute("aria-labelledby", `${id}-t`);
    el.innerHTML = `
      <div class="adm-montar-topo">
        <h4 id="${id}-t">Lista montada <span class="adm-montar-total"></span></h4>
        <button class="btn btn-line btn-sm adm-btn-texto-perigo" type="button" data-acao="limpar">Limpar lista</button>
      </div>
      <p class="adm-msg" data-msg="lista" role="status" aria-live="polite"></p>
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
              <input type="search" name="termo" placeholder="Ex.: dusclops, ultra bola, energia psíquica" autocomplete="off" spellcheck="false" maxlength="60">
            </label>
            <button class="btn btn-ouro" type="button" data-acao="buscar">Buscar</button>
          </div>
          <div class="filtros" role="group" aria-label="Categoria da carta">
            ${["", ...R.CATEGORIAS].map(c => `<button type="button" class="chip-filtro" data-categoria="${esc(c)}" aria-pressed="${c === ""}">${c || "Todas"}</button>`).join("")}
          </div>
          <p class="adm-msg" data-msg="busca" role="status" aria-live="polite">Busque em português ou inglês. Só aparecem cartas de Black & White em diante, sem regra especial (ex, EX, V, GX...). Toque numa carta para incluir; a lista fica com os nomes em inglês, como no TCG Live.</p>
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
    const msgLista = $("[data-msg=lista]");
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
              <button class="btn btn-line" type="button" data-mais="${i}" aria-label="Pôr mais uma ${esc(c.nome)}"${c.basica ? "" : ` disabled title="Singleton: 1 cópia de cada carta, exceto Energia Básica"`}>+</button>
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
        const r = resultados[Number(b.dataset.i)];
        const na = cartas.find(x => x.id === r.id);
        const selo = b.querySelector(".adm-res-qtd");
        selo.hidden = !na && !incluindo.has(r.id);
        selo.textContent = incluindo.has(r.id) ? "…" : na ? `×${na.qtd}` : "";
      });
    }

    function desenharResultados() {
      const inicio = listaResultados.children.length;
      const fim = Math.min(resultados.length, visiveis);
      listaResultados.insertAdjacentHTML("beforeend", resultados.slice(inicio, fim).map((r, k) => {
        const i = inicio + k;
        const local = `${R.setDoId(r.id).toUpperCase()} ${r.localId}`;
        const outroNome = r.nome_en && r.nome_en !== r.nome ? r.nome_en : "";
        return `<li><button type="button" class="adm-res" data-i="${i}" aria-label="Incluir ${esc(r.nome)}${outroNome ? ` (${esc(outroNome)})` : ""}, ${esc(local)}">
          ${imgCarta(r.img, "adm-res-img")}
          <span class="adm-res-nome">${esc(r.nome)}</span>
          <small>${esc([outroNome, local].filter(Boolean).join(" · "))}</small>
          <span class="adm-res-qtd" hidden></span>
        </button></li>`;
      }).join(""));
      botaoMais.hidden = fim >= resultados.length;
      marcarResultados();
    }

    async function buscar() {
      const termo = campoTermo.value.trim();
      if (!R.urlsBusca(termo, categoria)) { mensagem(msgBusca, "Digite o nome da carta.", "erro"); campoTermo.focus(); return; }
      const botao = $("[data-acao=buscar]");
      botao.disabled = true;
      mensagem(msgBusca, "Buscando…");
      try {
        const colecoes = await colecoesGLC();
        resultados = await buscarCartas(termo, categoria, colecoes, n => mensagem(msgBusca, `A base de cartas falhou; tentando de novo (${n}ª tentativa)…`));
        listaResultados.innerHTML = "";
        visiveis = R.POR_PAGINA;
        desenharResultados();
        mensagem(msgBusca, resultados.length ? `${resultados.length} ${resultados.length === 1 ? "carta" : "cartas"}. Toque para incluir.`
          : "Nenhuma carta de Black & White em diante com esse nome. Confira a grafia (com acento, em português) ou tente o nome em inglês.",
          resultados.length ? "ok" : "erro");
      } catch (e) {
        mensagem(msgBusca, e.message, "erro");
      } finally {
        botao.disabled = false;
      }
    }

    /* Toque numa carta da busca: lê o detalhe (em cache depois da 1ª vez) e aplica as regras do GLC */
    async function incluir(r) {
      if (incluindo.has(r.id)) return;
      incluindo.add(r.id);
      marcarResultados();
      try {
        const [colecoes, d] = await Promise.all([colecoesGLC(), detalhe(r.id)]);
        const motivo = R.motivoIlegal(d, colecoes, banlist);
        if (motivo) { mensagem(msgBusca, `${r.nome}: não vale no GLC (${motivo}).`, "erro"); return; }
        const set = await colecao(R.setDoId(r.id)).catch(() => null);
        const carta = R.cartaDoDetalhe(d, (set && set.sigla) || R.setDoId(r.id), colecoes);
        if (!carta.img && R.CARTA_IMG_VALIDA.test(r.img)) carta.img = r.img.replace("/pt/", "/en/");
        const impede = R.impedimento(cartas, carta, opcoes.tipo);
        if (impede) { mensagem(msgBusca, impede, "erro"); return; }
        cartas = R.sanitizarCartas(R.somar(cartas, carta));
        mensagem(msgBusca, `${carta.nome} incluída.`, "ok");
      } catch (e) {
        mensagem(msgBusca, e.message, "erro");
      } finally {
        incluindo.delete(r.id);
        mudou();
      }
    }

    async function importar() {
      const { linhas, erros } = R.lerTextoLive($("[name=importar]").value);
      if (!linhas.length) { mensagem(msgImportar, erros[0] || "Cole o texto exportado do TCG Live.", "erro"); return; }
      const botao = $("[data-acao=importar]");
      botao.disabled = true;
      mensagem(msgImportar, "Procurando as cartas na base…");
      try {
        const r = await resolverLinhas(linhas, banlist, n => mensagem(msgImportar, `A base de cartas falhou; tentando de novo (${n}ª tentativa)…`));
        cartas = R.sanitizarCartas(r.cartas);
        avisosImportacao = [...erros, ...r.avisos];
        mudou();
        mensagem(msgImportar, `${R.total(cartas)} cartas importadas${avisosImportacao.length ? "; confira os avisos acima da lista" : ""}.`, "ok");
      } catch (e) {
        mensagem(msgImportar, `${e.message} Nada foi alterado na lista.`, "erro");
      } finally {
        botao.disabled = false;
      }
    }

    /* Listas montadas antes da TCGdex (pokemontcg.io) ou só com o nome: troca pelas cartas da TCGdex pela coleção e pelo número */
    async function converterAntigas() {
      const antigas = cartas.filter(R.precisaConverter);
      if (!antigas.length) return;
      mensagem(msgLista, "Atualizando a lista para a base de cartas da TCGdex…");
      try {
        const r = await resolverLinhas(antigas.map(c => ({ ...c })), banlist);
        const novas = r.cartas.filter(c => R.CARTA_IMG_VALIDA.test(c.img || "") && /tcgdex/.test(c.img));
        if (!novas.length) { mensagem(msgLista, ""); return; }
        cartas = R.sanitizarCartas([...cartas.filter(c => !R.precisaConverter(c)), ...r.cartas]);
        mudou();
        mensagem(msgLista, `${novas.length} ${novas.length === 1 ? "carta atualizada" : "cartas atualizadas"} para a base TCGdex. Salve a decklist para gravar.`, "ok");
      } catch (e) {
        mensagem(msgLista, "");
      }
    }

    el.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b || !el.contains(b) || b.disabled) return;
      if (b.dataset.acao === "buscar") { buscar(); return; }
      if (b.dataset.acao === "mais") { visiveis += R.POR_PAGINA; desenharResultados(); return; }
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
        converterAntigas();
        return;
      }
      if (b.hasAttribute("data-categoria")) {
        categoria = b.dataset.categoria;
        el.querySelectorAll("[data-categoria]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        if (campoTermo.value.trim()) buscar();
        return;
      }
      if (b.dataset.i != null) { incluir(resultados[Number(b.dataset.i)]); return; }
      const i = Number(b.dataset.mais ?? b.dataset.menos);
      if (!cartas[i]) return;
      const nome = cartas[i].nome;
      if (b.dataset.mais != null) cartas[i].qtd = Math.min(60, cartas[i].qtd + 1);
      else if (--cartas[i].qtd < 1) cartas.splice(i, 1);
      mudou();
      /* Mantém o foco na mesma carta depois de redesenhar */
      const mesma = [...el.querySelectorAll(".adm-carta")].find(li => li.querySelector("b").textContent === nome);
      const alvo = mesma && mesma.querySelector(b.dataset.mais != null ? "[data-mais]" : "[data-menos]");
      (alvo && !alvo.disabled ? alvo : campoTermo).focus();
    });
    campoTermo.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); buscar(); } });
    /* Imagem que não carrega: a de português cai para a de inglês; sem nenhuma, some (sem handler inline, pela CSP) */
    el.addEventListener("error", e => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.src.includes("assets.tcgdex.net/pt/")) { img.src = img.src.replace("/pt/", "/en/"); return; }
      img.replaceWith(Object.assign(document.createElement("span"), { className: `${img.className} adm-carta-sem` }));
    }, true);

    desenharLista();
    desenharAvisos();
    converterAntigas();

    return {
      el,
      valor: () => R.sanitizarCartas(cartas),
      definir(lista) { cartas = R.sanitizarCartas(lista); avisosImportacao = []; mudou(); }
    };
  }

  window.EditorCartas = { criar };
})();

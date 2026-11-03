/* Painel GLC RR — regras do montador de decklist, sem DOM (testável no Node).
   Dados das cartas: API pública da TCGdex (api.tcgdex.net, v2), gratuita, open source e sem chave.
   Busca em português (código "pt" na TCGdex: cartas físicas; "pt-br" é só o TCG Pocket) e em inglês.
   A API não conhece o GLC: as regras do formato são aplicadas aqui.
   A decklist grava, por carta, o id da TCGdex e o mínimo para o site mostrar a lista e as estatísticas sem chamar a API. */
(function (raiz) {
  "use strict";

  const API = "https://api.tcgdex.net/v2";
  const ASSETS = "https://assets.tcgdex.net";
  const POR_PAGINA = 24;

  /* GLC: cartas de Black & White em diante (séries da TCGdex) mais a banlist do GLC.
     Não usa a legalidade "expanded" da TCGdex, que tira as banidas do Expanded oficial (outra lista). */
  const SERIES_GLC = ["bw", "xy", "sm", "swsh", "sv", "me"];

  /* Imagem de carta aceita: TCGdex (en ou pt, qualidade baixa em webp). Listas antigas (até 03/11/2026) usavam o pokemontcg.io.
     Igual à de assets/js/data.js (o teste site-dados.test.js confere). */
  const CARTA_IMG_VALIDA = /^https:\/\/(?:assets\.tcgdex\.net\/(?:en|pt)\/[a-z0-9]+\/[a-z0-9]+(?:\.[0-9]+[a-z]*)?\/[A-Za-z0-9]+\/low\.webp|images\.pokemontcg\.io\/[a-z][a-z0-9.-]*\/[A-Za-z0-9-]+\.png)$/;
  const IMG_TCGDEX = /^https:\/\/assets\.tcgdex\.net\//;
  const SET_ID = /^[a-z0-9]+(?:\.[0-9]+[a-z]*)?$/;
  const ID_CARTA = /^[a-z0-9]+(?:\.[0-9]+[a-z]*)?-[A-Za-z0-9]+$/;

  const CATEGORIAS = ["Pokémon", "Treinador", "Energia"];
  const CATEGORIA_EN = { "Pokemon": "Pokémon", "Trainer": "Treinador", "Energy": "Energia" };
  /* Filtro de categoria na busca, no idioma de cada consulta (traduções da TCGdex) */
  const CATEGORIA_FILTRO = { "Pokémon": { en: "Pokemon", pt: "Pokémon" }, "Treinador": { en: "Trainer", pt: "Treinador" }, "Energia": { en: "Energy", pt: "Energia" } };
  const TIPOS_EN = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Colorless", "Fairy"];
  /* Tipo do deck (config.json, em português) → tipo da carta na API em inglês */
  const TIPO_PT_EN = { "Planta": "Grass", "Fogo": "Fire", "Água": "Water", "Elétrico": "Lightning", "Psíquico": "Psychic",
    "Lutador": "Fighting", "Escuridão": "Darkness", "Metal": "Metal", "Dragão": "Dragon", "Incolor": "Colorless" };

  /* Regra especial (Rule Box): sufixo (EX, GX, V, ex, TAG TEAM-GX...), estágio próprio, raridade própria ou nome */
  const ESTAGIOS_RULE_BOX = ["BREAK", "VMAX", "VSTAR", "V-UNION", "MEGA", "LEVEL-UP"];
  const RARIDADES_RULE_BOX = ["Radiant Rare", "Prism Star"];
  /* Pelo nome, em inglês e em português (V-ASTRO = VSTAR, TURBO = BREAK, Radiante = Radiant) */
  const NOME_RULE_BOX = /(?:[\s-](?:EX|GX|V|VMAX|VSTAR|V-ASTRO|V-UNION|ex|BREAK|TURBO)$)|◇|\{\*\}|^Radiante?\s/;

  const chave = texto => String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
  const seguro = v => String(v || "").replace(/[^A-Za-z0-9-]/g, "");
  const semZeros = n => /^\d+$/.test(n) ? String(Number(n)) : String(n || "");
  const setDoId = id => String(id || "").slice(0, Math.max(0, String(id || "").lastIndexOf("-")));

  /* ---------- Busca ---------- */

  /* Palavras em português de Treinador e Energia → inglês, para a consulta em inglês também achar a carta
     quando o nome em português não bate (acento faltando, por exemplo). Só traduções seguras. */
  const GLOSSARIO = {
    energia: "energy", energias: "energy", basica: "basic", basicas: "basic", especial: "special",
    planta: "grass", fogo: "fire", agua: "water", eletrica: "lightning", eletrico: "lightning", raio: "lightning",
    psiquica: "psychic", psiquico: "psychic", luta: "fighting", lutador: "fighting", lutadora: "fighting",
    escuridao: "darkness", sombria: "darkness", sombrio: "darkness", metalica: "metal", fada: "fairy", dragao: "dragon", incolor: "colorless",
    bola: "ball", rapida: "quick", nivel: "level", doce: "candy", raro: "rare", rara: "rare", troca: "switch",
    pesquisa: "research", professor: "professor", professores: "professor", professora: "professor",
    chefe: "boss", ordens: "orders", ordem: "orders", comunicacao: "communication", ferramenta: "tool", estadio: "stadium"
  };
  const PALAVRAS_VAZIAS = ["de", "do", "da", "dos", "das", "e", "o", "a", "os", "as"];

  /* Palavras da busca: { pt: como digitadas, en: traduzidas pelo glossário }. Sem palavras vazias e sem letra solta. */
  function palavrasBusca(termo) {
    const digitadas = String(termo || "").normalize("NFC").slice(0, 60).split(/[^\p{L}\p{N}'’-]+/u)
      .map(p => p.replace(/’/g, "'").replace(/^['-]+|['-]+$/g, "")).filter(Boolean);
    const uteis = digitadas.filter(p => !PALAVRAS_VAZIAS.includes(chave(p)));
    const base = uteis.length ? uteis : digitadas;
    const escolher = lista => {
      const unicas = [...new Set(lista.map(p => p.toLowerCase()))];
      return (unicas.some(p => p.length > 1) ? unicas.filter(p => p.length > 1) : unicas).slice(0, 5);
    };
    return { pt: escolher(base), en: escolher(base.map(p => GLOSSARIO[chave(p)] || p)) };
  }

  /* As duas consultas da busca (português e inglês). Cada palavra é um filtro "contém" no nome (todas precisam aparecer).
     suffix=null: tira EX, GX, V, ex e TAG TEAM no servidor; o resto das regras é aplicado depois. */
  function urlsBusca(termo, categoria) {
    const p = palavrasBusca(termo);
    if (!p.en.length) return null;
    const url = (lang, palavras) => {
      const q = new URLSearchParams();
      palavras.forEach(w => q.append("name", w));
      q.append("suffix", "null:");
      const cat = CATEGORIA_FILTRO[categoria];
      if (cat) q.append("category", cat[lang]);
      return `${API}/${lang}/cards?${q.toString()}`;
    };
    return { pt: url("pt", p.pt), en: url("en", p.en) };
  }

  /* Coleções permitidas no GLC, a partir das séries (GET /v2/en/series/<id>, coleções em ordem de lançamento).
     Devolve { <set_id>: { ordem, serie } }; ordem maior = mais recente. */
  function colecoesDasSeries(series) {
    const mapa = {};
    let n = 0;
    SERIES_GLC.forEach(id => {
      const s = (series || []).find(x => x && x.id === id);
      ((s && s.sets) || []).forEach(set => { if (set && SET_ID.test(set.id || "")) mapa[set.id] = { ordem: ++n, serie: id }; });
    });
    return mapa;
  }

  const imagemBaixa = url => {
    const u = /^https:\/\/assets\.tcgdex\.net\/(?:en|pt)\/[a-z0-9]+\/[a-z0-9]+(?:\.[0-9]+[a-z]*)?\/[A-Za-z0-9]+$/.test(url || "") ? `${url}/low.webp` : "";
    return CARTA_IMG_VALIDA.test(u) ? u : "";
  };

  /* Junta os resultados das duas consultas (resumos { id, localId, name, image }) pela carta.
     Fica só o que é de Black & White em diante e não tem Rule Box no nome; prioriza nome e imagem em português.
     Ordem: coleção mais recente primeiro, depois o número. */
  function juntarResultados(listaPt, listaEn, colecoes) {
    const mapa = new Map();
    const juntar = (lista, lang) => (Array.isArray(lista) ? lista : []).forEach(b => {
      if (!b || !ID_CARTA.test(b.id || "") || !colecoes[setDoId(b.id)]) return;
      const r = mapa.get(b.id) || { id: b.id, localId: String(b.localId || b.id.slice(setDoId(b.id).length + 1)) };
      r[`nome_${lang}`] = String(b.name || "").slice(0, 60);
      r[`img_${lang}`] = imagemBaixa(b.image);
      mapa.set(b.id, r);
    });
    juntar(listaEn, "en");
    juntar(listaPt, "pt");
    return [...mapa.values()]
      .filter(r => !NOME_RULE_BOX.test(r.nome_en || "") && !NOME_RULE_BOX.test(r.nome_pt || ""))
      .map(r => ({ id: r.id, localId: r.localId, nome: r.nome_pt || r.nome_en, nome_en: r.nome_en || "",
        img: r.img_pt || r.img_en || "" }))
      .sort((a, b) => colecoes[setDoId(b.id)].ordem - colecoes[setDoId(a.id)].ordem ||
        (parseInt(a.localId, 10) || 0) - (parseInt(b.localId, 10) || 0) || a.localId.localeCompare(b.localId));
  }

  /* ---------- Carta (detalhe em inglês: GET /v2/en/cards/<id>) ---------- */

  /* Só o necessário do detalhe, para guardar em cache no navegador */
  function resumirDetalhe(d) {
    if (!d || !ID_CARTA.test(d.id || "")) return null;
    const pick = { id: d.id, localId: String(d.localId || ""), name: String(d.name || "").slice(0, 60), category: d.category,
      image: d.image || "", set: { id: (d.set && d.set.id) || setDoId(d.id) } };
    ["types", "stage", "evolveFrom", "suffix", "trainerType", "energyType", "rarity", "imagem_pt"].forEach(k => { if (d[k] != null) pick[k] = d[k]; });
    return pick;
  }

  /* Banlist do GLC (data/banlist.json): Treinador e Energia banidos valem para todas as versões ("todas_versoes": true);
     Pokémon banido vale só para aquela impressão (outro Pokémon com o mesmo nome é outra carta), pela coleção e pelo número. */
  function banida(carta, banlist) {
    const k = chave(carta && carta.nome);
    return ((banlist && banlist.cartas) || []).some(b => chave(b.nome) === k && (b.todas_versoes === true ||
      (seguro(b.colecao).toUpperCase() === seguro(carta.colecao).toUpperCase() && semZeros(seguro(b.numero).toUpperCase()) === semZeros(seguro(carta.numero).toUpperCase()))));
  }

  /* Por que a carta não vale no GLC ("" = vale). d: detalhe em inglês; colecoes: colecoesDasSeries();
     sigla: abreviação oficial da coleção, para a banlist por impressão. */
  function motivoIlegal(d, colecoes, banlist, sigla) {
    if (!d) return "carta não encontrada";
    if (!colecoes[(d.set && d.set.id) || setDoId(d.id)]) return "anterior a Black & White";
    if (d.trainerType === "Ace Spec" || d.rarity === "ACE SPEC Rare") return "ACE SPEC";
    if (d.suffix || ESTAGIOS_RULE_BOX.includes(d.stage) || RARIDADES_RULE_BOX.includes(d.rarity) || NOME_RULE_BOX.test(d.name || "")) return "Rule Box";
    if (banida({ nome: d.name, colecao: sigla || "", numero: d.localId }, banlist)) return "banlist do GLC";
    return "";
  }

  /* Detalhe (inglês) → registro gravado em decklists.json. sigla: abreviação oficial da coleção (ex.: SFA).
     Imagem só a que a TCGdex informa (em inglês; sem ela, a do português, em d.imagem_pt): a TCGdex não tem imagem de toda carta,
     e um endereço montado sem ela quebra. */
  function cartaDoDetalhe(d, sigla) {
    const categoria = CATEGORIA_EN[d.category] || "Treinador";
    const r = { qtd: 1, id: d.id, nome: String(d.name || "").slice(0, 60), colecao: seguro(sigla).toUpperCase().slice(0, 10),
      numero: seguro(semZeros(d.localId)).slice(0, 10), categoria };
    const img = imagemBaixa(d.image) || imagemBaixa(d.imagem_pt);
    if (img) r.img = img;
    if (categoria === "Pokémon") r.tipos = (d.types || []).filter(t => TIPOS_EN.includes(t));
    /* A TCGdex marca algumas Energias Especiais como "Normal" (ex.: Telepathic Psychic Energy): vale também o nome */
    if (categoria === "Energia" && d.energyType === "Normal" && NOME_ENERGIA_BASICA.test(r.nome)) r.basica = true;
    return { ...r, ...dadosDeOrdem(d) };
  }

  /* Campos usados para ordenar a lista (ordenarCartas, em data.js): estágio e de quem evolui (Pokémon), subtipo (Treinador) */
  const ESTAGIOS = ["Basic", "Stage1", "Stage2", "Restored"];
  const SUBTIPOS = { Supporter: "Apoiador", Item: "Item", Tool: "Ferramenta", "Technical Machine": "Ferramenta", Stadium: "Estádio" };
  function dadosDeOrdem(d) {
    const r = {};
    if (d.category === "Pokemon") {
      const estagio = d.stage === "RESTORED" ? "Restored" : d.stage;
      if (ESTAGIOS.includes(estagio)) r.estagio = estagio;
      if (d.evolveFrom) r.evolui_de = String(d.evolveFrom).slice(0, 60);
    }
    if (d.category === "Trainer" && SUBTIPOS[d.trainerType]) r.subtipo = SUBTIPOS[d.trainerType];
    return r;
  }
  /* A carta ainda não tem os campos de ordem? (listas salvas antes de 03/11/2026) */
  const faltaOrdem = c => !!c.id && ((c.categoria === "Pokémon" && !c.estagio) || (c.categoria === "Treinador" && !c.subtipo));

  /* ---------- Texto exportado do TCG Live ---------- */

  /* Nome de Energia Básica (o que a TCGdex chama de "Normal" só vale com este nome) */
  const NOME_ENERGIA_BASICA = /^(?:Basic\s+)?(?:\{[GRWLPFDMY]\}|Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy)\s+Energy$/i;
  const SIMBOLO_ENERGIA = { G: "Grass", R: "Fire", W: "Water", L: "Lightning", P: "Psychic", F: "Fighting", D: "Darkness", M: "Metal", Y: "Fairy" };
  /* "Basic {P} Energy", "Psychic Energy", "Basic Psychic Energy" → "Psychic Energy"; outra carta → "" */
  function energiaBasica(nome) {
    const n = String(nome || "").trim();
    let m = /^(?:Basic\s+)?\{([GRWLPFDMY])\}\s+Energy$/i.exec(n);
    if (m) return `${SIMBOLO_ENERGIA[m[1].toUpperCase()]} Energy`;
    m = /^(?:Basic\s+)?(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy)\s+Energy$/i.exec(n);
    return m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} Energy` : "";
  }

  const CABECALHO = /^(Pok[ée]mon|Trainer|Treinador|Energy|Energia)\s*(?:[:-]\s*\d*|\(\d+\))?\s*$/i;
  const SECAO = { pokemon: "Pokémon", "pokémon": "Pokémon", trainer: "Treinador", treinador: "Treinador", energy: "Energia", energia: "Energia" };

  /* Lê o texto exportado do TCG Live (ou PTCGO). Cada linha: "qtd Nome COLEÇÃO número".
     Devolve { linhas: [{qtd, nome, colecao, numero, categoria}], erros: ["Linha 4: ..."] } */
  function lerTextoLive(texto) {
    const linhas = [];
    const erros = [];
    let secao = "";
    String(texto || "").replace(/\r\n?/g, "\n").split("\n").forEach((bruta, i) => {
      const l = bruta.replace(/^\s*(?:#+|[*•-])\s*/, "").replace(/\s+/g, " ").trim();
      if (!l || /^total\s+(cards|de cartas)/i.test(l)) return;
      const cab = CABECALHO.exec(l);
      if (cab) { secao = SECAO[cab[1].toLowerCase()] || secao; return; }
      let m = /^(\d{1,2})x?\s+(.+?)\s+([A-Za-z0-9-]{2,8})\s+([A-Za-z]{0,5}\d{1,4}[a-z]?)$/.exec(l);
      let item;
      if (m) item = { qtd: Number(m[1]), nome: m[2], colecao: m[3].toUpperCase(), numero: m[4] };
      else if ((m = /^(\d{1,2})x?\s+(.+)$/.exec(l))) item = { qtd: Number(m[1]), nome: m[2], colecao: "", numero: "" };
      if (!item || !item.qtd || item.nome.length > 60) { erros.push(`Linha ${i + 1}: não entendi "${l.slice(0, 50)}".`); return; }
      const energia = energiaBasica(item.nome);
      if (energia) { item.nome = energia; item.categoria = "Energia"; item.basica = true; }
      else item.categoria = secao || "";
      linhas.push(item);
    });
    return { linhas, erros };
  }

  /* Coleção pela sigla oficial do TCG Live (a listagem de coleções filtra sobre a coleção completa) */
  const urlColecaoPorSigla = sigla => `${API}/en/sets?${new URLSearchParams({ "abbreviation.official": `eq:${seguro(sigla).toUpperCase()}` })}`;
  const urlColecao = id => `${API}/en/sets/${encodeURIComponent(id)}`;
  const urlCarta = (id, lang) => `${API}/${lang || "en"}/cards/${encodeURIComponent(id)}`;
  const urlSerie = id => `${API}/en/series/${encodeURIComponent(id)}`;

  /* Carta da coleção pelo número do TCG Live ("19" acha o localId "019"). colecao: GET /v2/en/sets/<id> ({ cards: [...] }) */
  function acharNaColecao(colecao, numero) {
    const n = seguro(numero).toUpperCase();
    const cartas = (colecao && colecao.cards) || [];
    return cartas.find(c => String(c.localId).toUpperCase() === n) ||
      cartas.find(c => semZeros(String(c.localId)) === semZeros(n)) || null;
  }

  /* Carta pelo nome exato em inglês (quando a sigla não bate, como em listas antigas): GET /v2/en/cards?name=eq:<nome> */
  const urlNomeExato = nome => `${API}/en/cards?${new URLSearchParams({ name: `eq:${String(nome || "").replace(/[|,]/g, " ").trim()}` })}`;
  /* Entre os resumos com esse nome, o que tem o mesmo número numa coleção permitida (a mais recente) */
  function escolherPorNumero(resumos, numero, colecoes) {
    const n = semZeros(seguro(numero).toUpperCase());
    return (Array.isArray(resumos) ? resumos : [])
      .filter(b => b && ID_CARTA.test(b.id || "") && colecoes[setDoId(b.id)] && semZeros(String(b.localId || "").toUpperCase()) === n)
      .sort((a, b) => colecoes[setDoId(b.id)].ordem - colecoes[setDoId(a.id)].ordem)[0] || null;
  }

  /* Linhas lidas (ou cartas antigas, sem imagem da TCGdex) → ids da TCGdex, quando a coleção e o número batem.
     siglas: { SIGLA: coleção completa ou null }. Devolve [{ linha, id }] (id "" quando não achou). */
  function idsDasLinhas(linhas, siglas) {
    return linhas.map(l => {
      const set = siglas[seguro(l.colecao).toUpperCase()];
      const c = set && l.numero ? acharNaColecao(set, l.numero) : null;
      return { linha: l, id: c && ID_CARTA.test(c.id || "") ? c.id : "" };
    });
  }

  /* Monta a lista a partir das linhas e dos detalhes achados (detalhes: { id: detalhe em inglês }).
     Linha não achada entra só com o texto (sem imagem). Devolve { cartas, avisos } */
  function resolverImportacao(achadas, detalhes, colecoes, banlist) {
    const avisos = [];
    const cartas = [];
    achadas.forEach(({ linha: l, id }) => {
      const d = id && detalhes[id];
      let carta;
      if (d) {
        carta = { ...cartaDoDetalhe(d, l.colecao), qtd: l.qtd };
        const motivo = motivoIlegal(d, colecoes, banlist, carta.colecao);
        /* Rule Box pelo nome e banlist já aparecem nas conferências da lista (conferirLista): sem aviso repetido */
        const repetido = motivo === "banlist do GLC" || (motivo === "Rule Box" && NOME_RULE_BOX.test(carta.nome));
        if (motivo && !carta.basica && !repetido) avisos.push(`${carta.nome} (${carta.colecao} ${carta.numero}): ${motivo}.`);
      } else {
        carta = { qtd: l.qtd, nome: l.nome, colecao: seguro(l.colecao), numero: seguro(l.numero), categoria: l.categoria || "Treinador" };
        if (l.basica) carta.basica = true;
        if (l.tipos) carta.tipos = l.tipos;
        if (!l.basica) avisos.push(`${l.nome}${l.colecao ? ` (${l.colecao} ${l.numero})` : ""}: não encontrada na base de cartas; entrou só com o nome. Confira ou troque pela busca.`);
      }
      somar(cartas, carta);
    });
    return { cartas, avisos };
  }

  /* Cartas da lista que ainda não vêm da TCGdex (listas antigas do pokemontcg.io ou só com o nome) */
  /* Cartas da lista que ainda não vêm da TCGdex: listas antigas (imagem do pokemontcg.io) ou só com o nome (sem id).
     Carta da TCGdex sem imagem (a TCGdex não tem) não é convertida de novo: a imagem de reserva vem pelo id. */
  const precisaConverter = c => !!(c.colecao && c.numero) && (/images\.pokemontcg\.io/.test(c.img || "") || !c.id);

  /* ---------- Lista ---------- */

  const mesmaCarta = (a, b) => (a.id && b.id) ? a.id === b.id
    : chave(a.nome) === chave(b.nome) && seguro(a.colecao).toUpperCase() === seguro(b.colecao).toUpperCase() && seguro(a.numero) === seguro(b.numero);

  /* Inclui a carta na lista (ou soma a quantidade, se já estiver) */
  function somar(cartas, carta) {
    const atual = cartas.find(x => mesmaCarta(x, carta));
    if (atual) atual.qtd = Math.min(60, atual.qtd + carta.qtd);
    else cartas.push({ ...carta });
    return cartas;
  }

  const total = cartas => (cartas || []).reduce((s, c) => s + (Number(c.qtd) || 0), 0);

  /* Pode incluir mais uma cópia desta carta? "" = pode. Singleton (exceto Energia Básica) e um tipo de Pokémon por deck. */
  function impedimento(cartas, carta, tipoDeck) {
    if (!carta.basica && cartas.some(x => !x.basica && chave(x.nome) === chave(carta.nome))) {
      return `${carta.nome} já está na lista: o GLC permite 1 cópia de cada carta, exceto Energia Básica.`;
    }
    const tipo = TIPO_PT_EN[tipoDeck] || "";
    if (tipo && carta.categoria === "Pokémon" && (carta.tipos || []).length && !carta.tipos.includes(tipo)) {
      return `${carta.nome} não é do tipo ${tipoDeck}, o tipo do deck.`;
    }
    return "";
  }

  /* Conferências do GLC. Só avisam: quem decide é o organizador. tipoDeck em português (config.json). */
  function conferirLista(cartas, tipoDeck, banlist) {
    const avisos = [];
    const n = total(cartas);
    if (n !== 60) avisos.push(`A lista tem ${n} ${n === 1 ? "carta" : "cartas"} (o GLC usa 60).`);
    const porNome = new Map();
    cartas.forEach(c => {
      if (c.basica) return;
      const k = chave(c.nome);
      porNome.set(k, { nome: c.nome, qtd: (porNome.get(k) || { qtd: 0 }).qtd + (Number(c.qtd) || 0) });
    });
    porNome.forEach(v => { if (v.qtd > 1) avisos.push(`${v.nome}: ${v.qtd} cópias (o GLC permite 1 de cada, exceto Energia Básica).`); });
    cartas.forEach(c => {
      if (NOME_RULE_BOX.test(c.nome || "")) avisos.push(`${c.nome}: parece ter Rule Box.`);
      if (!c.basica && banida(c, banlist)) avisos.push(`${c.nome}: está na banlist do GLC.`);
    });
    const pokemon = cartas.filter(c => c.categoria === "Pokémon" && (c.tipos || []).length);
    const tipo = TIPO_PT_EN[tipoDeck] || "";
    if (tipo) {
      pokemon.filter(c => !c.tipos.includes(tipo)).forEach(c => avisos.push(`${c.nome}: não é do tipo ${tipoDeck}.`));
    } else if (pokemon.length) {
      const comum = TIPOS_EN.filter(t => pokemon.every(c => c.tipos.includes(t)));
      if (!comum.length) avisos.push("Os Pokémon da lista não têm um tipo em comum (o GLC usa um tipo só).");
    }
    return avisos;
  }

  /* Limpa a lista antes de gravar: só campos e valores conhecidos. */
  function sanitizarCartas(lista) {
    const cartas = [];
    (Array.isArray(lista) ? lista : []).slice(0, 80).forEach(c => {
      const nome = String(c && c.nome || "").replace(/\s+/g, " ").trim().slice(0, 60);
      const qtd = Math.floor(Number(c && c.qtd));
      if (!nome || !(qtd >= 1)) return;
      const r = { qtd: Math.min(qtd, 60), nome, colecao: seguro(c.colecao).slice(0, 10), numero: seguro(c.numero).slice(0, 10),
        categoria: CATEGORIAS.includes(c.categoria) ? c.categoria : "Treinador" };
      if (ID_CARTA.test(c.id || "")) r.id = c.id;
      if (CARTA_IMG_VALIDA.test(c.img || "")) r.img = c.img;
      if (r.categoria === "Pokémon" && Array.isArray(c.tipos)) r.tipos = c.tipos.filter(t => TIPOS_EN.includes(t));
      if (r.categoria === "Energia" && c.basica === true && NOME_ENERGIA_BASICA.test(nome)) r.basica = true;
      if (r.categoria === "Pokémon" && ESTAGIOS.includes(c.estagio)) r.estagio = c.estagio;
      if (r.categoria === "Pokémon" && c.evolui_de) r.evolui_de = String(c.evolui_de).replace(/\s+/g, " ").trim().slice(0, 60);
      if (r.categoria === "Treinador" && Object.values(SUBTIPOS).includes(c.subtipo)) r.subtipo = c.subtipo;
      cartas.push(r);
    });
    const ordem = c => CATEGORIAS.indexOf(c.categoria);
    return cartas.map((c, i) => [c, i]).sort((a, b) => ordem(a[0]) - ordem(b[0]) || a[1] - b[1]).map(x => x[0]);
  }

  /* Listas montadas do mesmo jogador em outros eventos, da mais recente para a mais antiga.
     Servem de ponto de partida: o organizador copia e ajusta só o que mudou no torneio. */
  function listasAnteriores(decklists, eventos, jogadorId, eventoAtualId) {
    const evento = id => (eventos || []).find(e => e.id === id);
    return (decklists || [])
      .filter(d => d.jogador_id === jogadorId && d.evento_id !== eventoAtualId && evento(d.evento_id))
      .map(d => ({ evento_id: d.evento_id, nome: evento(d.evento_id).nome || d.evento_id, data: evento(d.evento_id).data || "",
        cartas: sanitizarCartas(d.cartas) }))
      .filter(x => x.cartas.length)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  }

  const api = { API, POR_PAGINA, SERIES_GLC, CARTA_IMG_VALIDA, CATEGORIAS, TIPO_PT_EN, palavrasBusca, urlsBusca, colecoesDasSeries,
    juntarResultados, resumirDetalhe, dadosDeOrdem, faltaOrdem, motivoIlegal, banida, urlNomeExato, escolherPorNumero, imagemBaixa, cartaDoDetalhe, energiaBasica, lerTextoLive, urlColecaoPorSigla, urlColecao,
    urlCarta, urlSerie, acharNaColecao, idsDasLinhas, resolverImportacao, precisaConverter, somar, total, impedimento,
    conferirLista, sanitizarCartas, listasAnteriores, mesmaCarta, setDoId };
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.RegrasCartas = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

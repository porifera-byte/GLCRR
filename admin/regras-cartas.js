/* Painel GLC RR — regras do montador de decklist, sem DOM (testável no Node).
   Dados das cartas: API pública do pokemontcg.io (v2), sem chave (a chave ficaria exposta no repositório público).
   A decklist grava os dados de cada carta (nome, coleção, número, imagem), então o site não depende da API. */
(function (raiz) {
  "use strict";

  const API = "https://api.pokemontcg.io/v2/cards";
  const CAMPOS = "id,name,supertype,subtypes,types,set,number,images,legalities,rules";
  const POR_PAGINA = 24;

  /* Imagem da carta: só o endereço de imagens do pokemontcg.io. Igual ao do site (assets/js/data.js);
     o teste admin/testes/site-dados.test.js confere. */
  const CARTA_IMG_VALIDA = /^https:\/\/images\.pokemontcg\.io\/[a-z][a-z0-9.-]*\/[A-Za-z0-9-]+\.png$/;

  const CATEGORIAS = ["Pokémon", "Treinador", "Energia"];
  const DA_API = { "Pokémon": "Pokémon", "Trainer": "Treinador", "Energy": "Energia" };
  const TIPOS_EN = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Colorless", "Fairy"];
  /* Tipo do deck (config.json, em português) → tipo da carta na API */
  const TIPO_PT_EN = { "Planta": "Grass", "Fogo": "Fire", "Água": "Water", "Elétrico": "Lightning", "Psíquico": "Psychic",
    "Lutador": "Fighting", "Escuridão": "Darkness", "Metal": "Metal", "Dragão": "Dragon", "Incolor": "Colorless" };

  /* GLC: sem Rule Box (EX, GX, V, ex, Radiant, Prism Star, BREAK etc.) e sem ACE SPEC. Regra oficial em gymleaderchallenge.com */
  const SUBTIPOS_RULE_BOX = ["EX", "GX", "TAG TEAM", "V", "VMAX", "VSTAR", "V-UNION", "ex", "Radiant", "BREAK", "MEGA", "Prism Star"];
  const EXCLUSOES_CONSULTA = '-subtypes:EX -subtypes:GX -subtypes:VMAX -subtypes:VSTAR -subtypes:"V-UNION" -subtypes:"TAG TEAM" ' +
    '-subtypes:Radiant -subtypes:BREAK -subtypes:"ACE SPEC"';
  /* Pelo nome (para listas importadas ou antigas, sem os subtipos da API) */
  const NOME_RULE_BOX = /(?:[\s-](?:EX|GX|V|VMAX|VSTAR|V-UNION|ex|BREAK)$)|◇|\{\*\}|^Radiant\s/;

  const chave = texto => String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
  const seguro = v => String(v || "").replace(/[^A-Za-z0-9-]/g, "");

  /* ---------- Busca ---------- */

  /* Termo digitado → consulta Lucene da API. Cada palavra vira name:palavra* (prefixo).
     categoria: "" | "Pokémon" | "Treinador" | "Energia". Sempre só cartas legais no Expanded e sem Rule Box/ACE SPEC. */
  function montarConsulta(termo, categoria) {
    const todas = String(termo || "").normalize("NFC").slice(0, 60).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    /* Palavra de 1 letra (o "s" de "Professor's") só entra se for a única */
    const palavras = todas.some(p => p.length > 1) ? todas.filter(p => p.length > 1).slice(0, 5) : todas.slice(0, 1);
    if (!palavras.length) return "";
    const nome = palavras.map(p => `name:${p.toLowerCase()}*`).join(" ");
    const cat = categoria === "Treinador" ? " supertype:trainer"
      : categoria === "Energia" ? " supertype:energy"
      : categoria === "Pokémon" ? " -supertype:trainer -supertype:energy" : "";
    return `${nome} legalities.expanded:legal ${EXCLUSOES_CONSULTA}${cat}`;
  }

  function urlBusca(termo, categoria, pagina) {
    const q = montarConsulta(termo, categoria);
    if (!q) return "";
    const p = Math.max(1, Math.floor(Number(pagina) || 1));
    return `${API}?q=${encodeURIComponent(q)}&orderBy=${encodeURIComponent("-set.releaseDate")}&pageSize=${POR_PAGINA}&page=${p}&select=${CAMPOS}`;
  }

  /* ---------- Carta da API ---------- */

  function codigoColecao(c) {
    const s = c.set || {};
    return seguro(s.ptcgoCode || String(s.id || "").toUpperCase()).slice(0, 10);
  }

  /* Por que a carta não vale no GLC ("" = vale). banlist: data/banlist.json */
  function motivoIlegal(c, banlist) {
    const sub = c.subtypes || [];
    if (sub.includes("ACE SPEC") || (c.rules || []).some(r => /ACE SPEC/i.test(r))) return "ACE SPEC";
    if (sub.some(s => SUBTIPOS_RULE_BOX.includes(s)) || NOME_RULE_BOX.test(c.name || "") ||
      (c.rules || []).some(r => /\b(?:Rule|Regra)\s*:/i.test(r) && !/Ancient Trait/i.test(r))) return "Rule Box";
    if (!c.legalities || c.legalities.expanded !== "Legal") return "fora do Expanded";
    if (naBanlist(c.name, banlist)) return "banlist do GLC";
    return "";
  }

  function naBanlist(nome, banlist) {
    const k = chave(nome);
    return ((banlist && banlist.cartas) || []).some(b => chave(b.nome) === k);
  }

  /* Carta da API → registro gravado em decklists.json (campo cartas) */
  function cartaDaApi(c) {
    const categoria = DA_API[c.supertype] || "Treinador";
    const registro = { qtd: 1, nome: String(c.name || "").slice(0, 60), colecao: codigoColecao(c),
      numero: seguro(c.number).slice(0, 10), categoria };
    if (/^[a-z0-9.]+-[A-Za-z0-9-]+$/.test(c.id || "")) registro.id = c.id;
    const img = c.images && c.images.small;
    if (CARTA_IMG_VALIDA.test(img || "")) registro.img = img;
    if (categoria === "Pokémon") registro.tipos = (c.types || []).filter(t => TIPOS_EN.includes(t));
    if (categoria === "Energia" && (c.subtypes || []).includes("Basic")) registro.basica = true;
    return registro;
  }

  /* ---------- Texto exportado do TCG Live ---------- */

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

  /* Consultas para achar as linhas importadas na API (coleção + número), em lotes de até 15 linhas */
  function consultasImportacao(linhas) {
    const termos = [...new Set(linhas.filter(l => l.colecao && l.numero)
      .map(l => `(set.ptcgoCode:"${seguro(l.colecao)}" number:"${seguro(l.numero)}")`))];
    const lotes = [];
    for (let i = 0; i < termos.length; i += 15) lotes.push(termos.slice(i, i + 15).join(" OR "));
    return lotes.map(q => `${API}?q=${encodeURIComponent(q)}&pageSize=250&select=${CAMPOS}`);
  }

  /* Junta as linhas lidas com as cartas achadas na API. Linha não achada entra só com o texto (sem imagem).
     Devolve { cartas, avisos } */
  function resolverImportacao(linhas, cartasApi, banlist) {
    const porCodigo = new Map();
    (cartasApi || []).forEach(c => porCodigo.set(`${codigoColecao(c)}|${String(c.number || "").toUpperCase()}`, c));
    const avisos = [];
    const cartas = [];
    linhas.forEach(l => {
      const c = porCodigo.get(`${seguro(l.colecao).toUpperCase()}|${seguro(l.numero).toUpperCase()}`) ||
        porCodigo.get(`${seguro(l.colecao).toUpperCase()}|${seguro(l.numero).replace(/^0+(?=\d)/, "").toUpperCase()}`);
      let carta;
      if (c) {
        carta = { ...cartaDaApi(c), qtd: l.qtd };
        const motivo = motivoIlegal(c, banlist);
        /* Rule Box pelo nome e banlist já aparecem nas conferências da lista (conferirLista): sem aviso repetido */
        const repetido = motivo === "banlist do GLC" || (motivo === "Rule Box" && NOME_RULE_BOX.test(carta.nome));
        if (motivo && !carta.basica && !repetido) avisos.push(`${carta.nome} (${carta.colecao} ${carta.numero}): ${motivo}.`);
      } else {
        carta = { qtd: l.qtd, nome: l.nome, colecao: seguro(l.colecao), numero: seguro(l.numero), categoria: l.categoria || "Treinador" };
        if (l.basica) carta.basica = true;
        else avisos.push(`${l.nome}${l.colecao ? ` (${l.colecao} ${l.numero})` : ""}: não encontrada na base de cartas; entrou só com o nome. Confira ou troque pela busca.`);
      }
      somar(cartas, carta);
    });
    return { cartas, avisos };
  }

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
      if (!c.basica && naBanlist(c.nome, banlist)) avisos.push(`${c.nome}: está na banlist do GLC.`);
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
      if (/^[a-z0-9.]+-[A-Za-z0-9-]+$/.test(c.id || "")) r.id = c.id;
      if (CARTA_IMG_VALIDA.test(c.img || "")) r.img = c.img;
      if (r.categoria === "Pokémon" && Array.isArray(c.tipos)) r.tipos = c.tipos.filter(t => TIPOS_EN.includes(t));
      if (r.categoria === "Energia" && c.basica === true) r.basica = true;
      cartas.push(r);
    });
    const ordem = c => CATEGORIAS.indexOf(c.categoria);
    return cartas.map((c, i) => [c, i]).sort((a, b) => ordem(a[0]) - ordem(b[0]) || a[1] - b[1]).map(x => x[0]);
  }

  const api = { API, POR_PAGINA, CARTA_IMG_VALIDA, CATEGORIAS, TIPO_PT_EN, montarConsulta, urlBusca, motivoIlegal, cartaDaApi,
    energiaBasica, lerTextoLive, consultasImportacao, resolverImportacao, somar, total, conferirLista, sanitizarCartas, mesmaCarta };
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.RegrasCartas = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

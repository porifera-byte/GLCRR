/* Liga GLC Roraima — carregamento dos dados e utilitários compartilhados.
   Todo dado que muda vem de data/*.json. O HTML não tem dado fixo. */

const ARQUIVOS_DADOS = ["config", "eventos", "resultados", "jogadores", "decklists", "banlist", "patrocinadores"];

const DADOS = {
  config: {},
  eventos: [],
  resultados: [],
  jogadores: [],
  decklists: [],
  banlist: { atualizado_em: "", fonte: "", cartas: [] },
  patrocinadores: []
};

async function carregarDados() {
  const conteudos = await Promise.all(ARQUIVOS_DADOS.map(async nome => {
    const resp = await fetch(`data/${nome}.json`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Não foi possível carregar data/${nome}.json (HTTP ${resp.status}).`);
    try {
      return await resp.json();
    } catch (e) {
      throw new Error(`Erro de sintaxe em data/${nome}.json: ${e.message}`);
    }
  }));
  ARQUIVOS_DADOS.forEach((nome, i) => { DADOS[nome] = conteudos[i]; });
  return DADOS;
}

/* ---------- Utilitários ---------- */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Data de hoje em Boa Vista, no formato AAAA-MM-DD */
function hojeBV() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Boa_Vista" });
}

/* AAAA-MM-DD → dd/mm/aaaa. Fora do formato vira vazio: o valor entra direto no HTML */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
function dataBR(iso) {
  return DATA_ISO.test(iso || "") ? iso.split("-").reverse().join("/") : "";
}

/* Aceita só links reais de Google Forms */
function formValido(url) {
  return /^https:\/\/(docs\.google\.com\/forms|forms\.gle)\//.test(url || "");
}

/* Link externo vindo dos JSON: só http(s). Barra javascript:, data: e afins num href */
function urlSegura(url) {
  const u = String(url || "").trim();
  return /^https?:\/\//i.test(u) ? u : "";
}

/* Caminhos de imagem aceitos no site, validados na hora de exibir.
   São os mesmos do painel (admin/regras-jogadores.js e admin/regras-eventos.js);
   o teste admin/testes/site-dados.test.js confere que continuam iguais. */
const ICONE_VALIDO = /^assets\/img\/jogadores\/[a-z0-9-]+\.(png|webp|jpg)$/;
const DECKLIST_VALIDA = /^assets\/img\/decklists\/[a-z0-9-]+\.(png|jpg|jpeg|webp)(\?v=\d{14})?$/;
/* Logos dos patrocinadores: enviadas por PR (não passam pelo painel) */
const LOGO_PATROCINADOR_VALIDA = /^assets\/img\/patrocinadores\/[a-z0-9-]+\.(png|webp|jpg|svg)$/;

/* Status calculado: o campo "status" do JSON, se preenchido, tem prioridade */
function statusDe(ev) {
  if (ev.status) return ev.status;
  if (ev.data < hojeBV()) return "Encerrado";
  return formValido(ev.inscricao_url) ? "Inscrições abertas" : "Agendado";
}

/* ---------- Consultas ---------- */

const jogadorPorId = id => DADOS.jogadores.find(j => j.id === id);
const apelidoDe = id => (jogadorPorId(id) || {}).apelido || id;
const eventoPorId = id => DADOS.eventos.find(e => e.id === id);
const resultadoDo = eventoId => DADOS.resultados.find(r => r.evento_id === eventoId);
const decklistDe = (eventoId, jogadorId) =>
  DADOS.decklists.find(d => d.evento_id === eventoId && d.jogador_id === jogadorId && d.posicao >= 1 && d.posicao <= 3);
const vde = c => `${Number(c.vitorias) || 0}-${Number(c.derrotas) || 0}-${Number(c.empates) || 0}`;

/* Tipo do deck: vem da linha do resultado (todos os jogadores); decklists antigas podem trazer o próprio */
const tipoDoDeck = (colocacao, decklist) => (colocacao && colocacao.tipo_pokemon) || (decklist && decklist.tipo_pokemon) || "";

/* Ícone do tipo do deck (assets/img/tipos/<slug>.png, arte própria da liga) com tooltip.
   base: prefixo do caminho ("../" no painel). comTexto: mostra o nome ao lado do ícone.
   Tipo sem ícone aparece só como texto. */
const TIPOS_COM_ICONE = ["planta", "fogo", "agua", "eletrico", "psiquico", "lutador", "escuridao", "metal", "dragao", "incolor"];
const slugTipo = tipo => String(tipo || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function htmlTipo(tipo, opcoes) {
  const { base = "", comTexto = false } = opcoes || {};
  if (!tipo) return "";
  const s = slugTipo(tipo);
  const texto = `<span class="tipo-nome">${esc(tipo)}</span>`;
  if (!TIPOS_COM_ICONE.includes(s)) return texto;
  return `<span class="tipo-ic" tabindex="0" role="img" aria-label="Tipo ${esc(tipo)}" data-tip="${esc(tipo)}">` +
    `<img src="${base}assets/img/tipos/${s}.png" alt="" width="22" height="22" loading="lazy" decoding="async"></span>${comTexto ? texto : ""}`;
}

/* Decklist do Top 3 sempre disponível: sem cadastro, ou sem imagem e sem lista em texto,
   devolve a imagem de reserva até a organização enviar a foto pelo painel */
const IMAGEM_RESERVA_DECKLIST = "assets/img/decklists/sem-imagem.svg";
function decklistTop3(eventoId, jogadorId, posicao) {
  if (!(posicao >= 1 && posicao <= 3)) return null;
  const d = decklistDe(eventoId, jogadorId);
  if (d && (DECKLIST_VALIDA.test(d.imagem || "") || d.lista_texto)) return d;
  return { evento_id: eventoId, jogador_id: jogadorId, posicao, tipo_pokemon: d ? d.tipo_pokemon || "" : "",
    lista_texto: "", imagem: IMAGEM_RESERVA_DECKLIST, reserva: true };
}

/* Histórico de um jogador, do evento mais recente para o mais antigo.
   Montado a partir de resultados.json e decklists.json (fonte única dos dados). */
function historicoDe(jogadorId) {
  const itens = [];
  DADOS.resultados.forEach(r => {
    const c = (r.colocacoes || []).find(x => x.jogador_id === jogadorId);
    const ev = eventoPorId(r.evento_id);
    if (c && ev) itens.push({ evento: ev, colocacao: c, decklist: decklistTop3(ev.id, jogadorId, c.posicao) });
  });
  return itens.sort((a, b) => b.evento.data.localeCompare(a.evento.data));
}

/* Totais de um jogador (opcionalmente só de uma temporada) */
function estatisticasDe(jogadorId, temporada) {
  const hist = historicoDe(jogadorId).filter(h => !temporada || h.evento.data.startsWith(String(temporada)));
  return hist.reduce((s, h) => {
    s.eventos++;
    if (h.colocacao.posicao <= 3) s.top3++;
    s.melhor = Math.min(s.melhor, h.colocacao.posicao);
    s.v += Number(h.colocacao.vitorias) || 0;
    s.d += Number(h.colocacao.derrotas) || 0;
    s.e += Number(h.colocacao.empates) || 0;
    return s;
  }, { eventos: 0, top3: 0, melhor: Infinity, v: 0, d: 0, e: 0 });
}

/* Todas as decklists do Top 3 (aba Decks), do evento mais recente para o mais antigo e, no mesmo evento, pela posição.
   Inclui quem ainda não tem decklist enviada (decklistTop3 devolve a reserva). Evento sem cadastro em eventos.json fica de fora. */
function decksTop3() {
  const itens = [];
  DADOS.resultados.forEach(r => {
    const ev = eventoPorId(r.evento_id);
    if (!ev) return;
    (r.colocacoes || []).filter(c => c.posicao >= 1 && c.posicao <= 3).forEach(c =>
      itens.push({ evento: ev, colocacao: c, decklist: decklistTop3(ev.id, c.jogador_id, c.posicao) }));
  });
  return itens.sort((a, b) => b.evento.data.localeCompare(a.evento.data) || a.colocacao.posicao - b.colocacao.posicao);
}

/* Períodos do filtro da aba Decks: "" (tudo), "3m", "6m", "12m" (últimos meses até hoje) ou um ano (AAAA).
   Devolve { inicio, fim } em AAAA-MM-DD. Mês mais curto (31/05 menos 3 meses) cai no último dia do mês. */
function periodoDatas(codigo, hoje) {
  const h = DATA_ISO.test(hoje || "") ? hoje : hojeBV();
  if (/^\d{4}$/.test(codigo || "")) return { inicio: `${codigo}-01-01`, fim: `${codigo}-12-31` };
  const m = /^(3|6|12)m$/.exec(codigo || "");
  if (!m) return { inicio: "", fim: "9999-12-31" };
  const [a, mes, d] = h.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, mes - 1 - Number(m[1]), 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return { inicio: alvo.toISOString().slice(0, 10), fim: h };
}

/* Estatísticas por tipo do deck nos eventos com resultado entre inicio e fim (inclusive).
   Uso = participações com o tipo; % de vitórias = V ÷ (V + D + E), como no Challonge (o bye já entra como vitória).
   Linha sem tipo informado fica no fim, com tipo "". Só números: a página não interpreta os dados. */
function estatisticasDecks(inicio, fim) {
  const tipos = new Map();
  const jogadores = new Set();
  let eventos = 0, participacoes = 0;
  DADOS.resultados.forEach(r => {
    const ev = eventoPorId(r.evento_id);
    const cols = r.colocacoes || [];
    if (!ev || !DATA_ISO.test(ev.data || "") || ev.data < inicio || ev.data > fim || !cols.length) return;
    eventos++;
    cols.forEach(c => {
      participacoes++;
      jogadores.add(c.jogador_id);
      const tipo = c.tipo_pokemon || "";
      if (!tipos.has(tipo)) tipos.set(tipo, { tipo, uso: 0, jogadores: new Set(), v: 0, d: 0, e: 0, top3: 0, titulos: 0 });
      const t = tipos.get(tipo);
      t.uso++;
      t.jogadores.add(c.jogador_id);
      t.v += Number(c.vitorias) || 0;
      t.d += Number(c.derrotas) || 0;
      t.e += Number(c.empates) || 0;
      if (c.posicao >= 1 && c.posicao <= 3) t.top3++;
      if (c.posicao === 1) t.titulos++;
    });
  });
  const lista = [...tipos.values()].map(t => {
    const partidas = t.v + t.d + t.e;
    return { ...t, jogadores: t.jogadores.size, uso_pct: t.uso / participacoes, vit_pct: partidas ? t.v / partidas : null };
  }).sort((a, b) => (!a.tipo) - (!b.tipo) || b.uso - a.uso || (b.vit_pct ?? -1) - (a.vit_pct ?? -1) || a.tipo.localeCompare(b.tipo, "pt-BR"));
  return { eventos, jogadores: jogadores.size, participacoes, tipos: lista };
}

function eventosSeparados() {
  const hoje = hojeBV();
  return {
    futuros: DADOS.eventos.filter(e => e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)),
    passados: DADOS.eventos.filter(e => e.data < hoje).sort((a, b) => b.data.localeCompare(a.data))
  };
}

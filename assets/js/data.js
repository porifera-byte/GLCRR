/* Liga GLC Roraima — carregamento dos dados e utilitários compartilhados.
   Todo dado que muda vem de data/*.json. O HTML não tem dado fixo. */

const ARQUIVOS_DADOS = ["config", "eventos", "resultados", "jogadores", "decklists", "banlist"];

const DADOS = {
  config: {},
  eventos: [],
  resultados: [],
  jogadores: [],
  decklists: [],
  banlist: { atualizado_em: "", fonte: "", cartas: [] }
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

/* AAAA-MM-DD → dd/mm/aaaa */
function dataBR(iso) {
  return iso ? iso.split("-").reverse().join("/") : "";
}

/* Aceita só links reais de Google Forms */
function formValido(url) {
  return /^https:\/\/(docs\.google\.com\/forms|forms\.gle)\//.test(url || "");
}

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
const vde = c => `${c.vitorias ?? 0}-${c.derrotas ?? 0}-${c.empates ?? 0}`;

/* Histórico de um jogador, do evento mais recente para o mais antigo.
   Montado a partir de resultados.json e decklists.json (fonte única dos dados). */
function historicoDe(jogadorId) {
  const itens = [];
  DADOS.resultados.forEach(r => {
    const c = (r.colocacoes || []).find(x => x.jogador_id === jogadorId);
    const ev = eventoPorId(r.evento_id);
    if (c && ev) itens.push({ evento: ev, colocacao: c, decklist: decklistDe(ev.id, jogadorId) });
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
    s.v += h.colocacao.vitorias ?? 0;
    s.d += h.colocacao.derrotas ?? 0;
    s.e += h.colocacao.empates ?? 0;
    return s;
  }, { eventos: 0, top3: 0, melhor: Infinity, v: 0, d: 0, e: 0 });
}

function eventosSeparados() {
  const hoje = hojeBV();
  return {
    futuros: DADOS.eventos.filter(e => e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)),
    passados: DADOS.eventos.filter(e => e.data < hoje).sort((a, b) => b.data.localeCompare(a.data))
  };
}

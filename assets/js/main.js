/* Liga GLC Roraima — navegação, páginas, e pop-up de resultados.
   Site de uma página (SPA) com rotas por âncora:
   #inicio, #calendario, #ranking, #decks, #regras, #jogadores e #jogadores/<id> (perfil).
   Ao trocar de rota, a página desliza na direção da ordem do menu. */

const MENU = [
  ["inicio", "Início"], ["calendario", "Calendário"], ["ranking", "Ranking"],
  ["decks", "Decks"], ["regras", "Regras"], ["jogadores", "Jogadores"]
];

const LOGO = "assets/icons/GLCRR-logo.png";

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONES = {
  calendario: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  ranking: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
  decks: svg('<rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/><path d="M11 8h5M11 12h5"/>'),
  regras: svg('<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 9h6M8 13h6"/>'),
  jogadores: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 4.5 5"/>')
};
const IG_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>`;
const YT_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>`;

/* ---------- Componentes ---------- */

const vazio = (titulo, texto) => `<div class="empty"><b>${titulo}</b><span>${texto}</span></div>`;
const interna = html => `<div class="wrap page">${html}</div>`;
const logoHTML = (classe, alt) =>
  `<span class="logo ${classe}"><span class="badge" aria-hidden="true"></span><img src="${LOGO}" alt="${alt}" data-falha="remover"></span>`;
const linkPerfil = id => `#jogadores/${encodeURIComponent(id)}`;
const melhorTxt = n => Number.isFinite(n) ? `${n}º` : "—";
const inicial = nome => esc((nome || "?").trim().charAt(0).toUpperCase());
/* Avatar: ícone do jogador (assets/img/jogadores/, caminho validado por ICONE_VALIDO) ou a inicial do apelido */
const avatar = j => `<span class="avatar" aria-hidden="true">${ICONE_VALIDO.test(j.icone || "")
  ? `<img src="${esc(j.icone)}" alt="" loading="lazy" decoding="async">` : inicial(j.apelido)}</span>`;

function dataBox(iso) {
  const [a = "", m = "", d = ""] = DATA_ISO.test(iso || "") ? iso.split("-") : [];
  return `<div class="date" aria-hidden="true"><b>${d || "—"}</b><span>${MESES[+m - 1] || ""} ${a.slice(2)}</span></div>`;
}

/* Imagem que falha ao carregar, sem handler inline (a CSP bloqueia onerror=):
   data-falha="remover" tira a imagem; data-falha="reserva" troca a decklist pela imagem de reserva;
   data-falha="nome" troca a logo do patrocinador pelo nome em texto.
   O evento "error" não sobe pela árvore, por isso o ouvinte fica na fase de captura. */
const imgReserva = alt => `<img class="deck-img deck-reserva" src="${IMAGEM_RESERVA_DECKLIST}" alt="${alt}">`;
function tratarFalhaImagem(img) {
  if (img.dataset.falha === "remover") img.remove();
  else if (img.dataset.falha === "nome") img.outerHTML = `<span class="patro-nome">${esc(img.alt)}</span>`;
  else if (img.dataset.falha === "carta") (img.closest("a") || img).outerHTML = `<span class="carta-txt">${esc(img.dataset.nome || img.alt)}</span>`;
  else if (img.dataset.falha === "reserva") (img.closest("a") || img).outerHTML = imgReserva("Decklist em breve: a imagem ainda não está disponível.");
}
document.addEventListener("error", e => {
  if (e.target instanceof HTMLImageElement && e.target.dataset.falha) tratarFalhaImagem(e.target);
}, true);

function cardEvento(ev) {
  const st = statusDe(ev);
  const passado = st === "Encerrado";
  const cls = passado ? "enc" : st === "Inscrições abertas" ? "abertas" : "";
  const mapa = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ev.local || "");
  const temResultado = (resultadoDo(ev.id)?.colocacoes || []).length > 0;
  return `<article class="ev">
    ${dataBox(ev.data)}
    <div class="ev-body">
      <h3>${esc(ev.nome)}</h3>
      <div class="pills">
        <span class="pill ${cls}">${esc(st)}</span>
        ${ev.tipo ? `<span class="pill">${esc(ev.tipo)}</span>` : ""}
        ${!passado && !formValido(ev.inscricao_url) ? `<span class="pill">Inscrições em breve</span>` : ""}
      </div>
      <div class="meta">
        <span><strong>Data:</strong> ${dataBR(ev.data)}</span>
        <span><strong>Horário:</strong> ${esc(ev.horario) || "—"}</span>
        <span><strong>Local:</strong> ${esc(ev.local) || "—"}</span>
        ${ev.vagas ? `<span><strong>Vagas:</strong> ${esc(ev.vagas)}</span>` : ""}
      </div>
      ${ev.descricao ? `<p class="lead">${esc(ev.descricao)}</p>` : ""}
      <div class="actions">
        ${!passado && formValido(ev.inscricao_url) ? `<a class="btn btn-ouro" href="${esc(ev.inscricao_url)}" target="_blank" rel="noopener">Inscreva-se</a>` : ""}
        ${passado && temResultado ? `<button type="button" class="btn btn-ceu" data-resultados="${esc(ev.id)}">Resultados</button>` : ""}
        ${passado && !temResultado ? `<span class="pill">Resultados em breve</span>` : ""}
        ${ev.local ? `<a class="btn btn-line" href="${mapa}" target="_blank" rel="noopener">Ver no mapa</a>` : ""}
      </div>
    </div>
  </article>`;
}

/* Patrocinadores do Início (data/patrocinadores.json): logo clicável ou, sem logo válida, o nome em texto.
   Patrocinador sem link http(s) não aparece. */
function htmlPatrocinadores() {
  const lista = (Array.isArray(DADOS.patrocinadores) ? DADOS.patrocinadores : [])
    .map(p => ({ nome: String(p.nome || "").trim(), url: urlSegura(p.url), logo: LOGO_PATROCINADOR_VALIDA.test(p.logo || "") ? p.logo : "" }))
    .filter(p => p.nome && p.url);
  if (!lista.length) return "";
  return `<section class="patrocinadores" aria-labelledby="patro-titulo">
    <h2 id="patro-titulo" class="patro-titulo">Patrocinadores</h2>
    <ul class="patro-lista">${lista.map(p => `<li><a class="patro" href="${esc(p.url)}" target="_blank" rel="noopener sponsored"
      aria-label="${esc(p.nome)} (abre em nova aba)">${p.logo
        ? `<img src="${esc(p.logo)}" alt="${esc(p.nome)}" loading="lazy" data-falha="nome">`
        : `<span class="patro-nome">${esc(p.nome)}</span>`}</a></li>`).join("")}</ul>
  </section>`;
}

/* ---------- Páginas ---------- */

const PAGES = {
  inicio() {
    const instagram = urlSegura(DADOS.config.instagram_url) || "https://www.instagram.com/glc.roraima/";
    const youtube = urlSegura(DADOS.config.youtube_url);
    return `<div class="home">
      <div class="home-top">
        <div class="home-side">
          <div class="home-titulo">
            <span class="eyebrow">Liga roraimense de Pokémon TCG</span>
            <h1>Torne-se um <em>Líder de Ginásio!</em></h1>
            ${logoHTML("logo-home", "Logo da Liga GLC Roraima")}
            <p class="lead">Venha jogar, conhecer a comunidade e acompanhar os próximos eventos.</p>
          </div>
        </div>
      </div>
      <nav class="float-menu" aria-label="Menu principal">
        ${MENU.slice(1).map(([id, nome]) =>
          `<a href="#${id}"><span class="ic">${ICONES[id]}</span>${nome}</a>`).join("")}
      </nav>
      <div class="home-redes">
        <a class="btn btn-ouro" href="${esc(instagram)}" target="_blank" rel="noopener">${IG_SVG} Siga no Instagram</a>
        ${youtube ? `<a class="btn btn-verm" href="${esc(youtube)}" target="_blank" rel="noopener">${YT_SVG} Canal no YouTube</a>` : ""}
      </div>
      ${htmlPatrocinadores()}
    </div>`;
  },

  calendario() {
    const { futuros, passados } = eventosSeparados();
    return interna(`<div><span class="eyebrow">Agenda</span><h1>Calendário</h1></div>
      <div class="group-title">Próximos eventos</div>
      ${futuros.length ? `<div class="list">${futuros.map(cardEvento).join("")}</div>`
        : vazio("Nenhum evento agendado.", "Novos eventos aparecem aqui assim que forem anunciados.")}
      <div class="group-title past">Eventos realizados</div>
      ${passados.length ? `<div class="list">${passados.map(cardEvento).join("")}</div>`
        : vazio("Nenhum evento realizado.", "")}`);
  },

  /* Sem regra de pontuação definida: mostra participações e colocações, sem pontos */
  ranking() {
    const temporada = String(DADOS.config.temporada || hojeBV().slice(0, 4));
    const linhas = DADOS.jogadores
      .map(j => ({ j, s: estatisticasDe(j.id, temporada) }))
      .filter(x => x.s.eventos > 0)
      .sort((a, b) => a.s.melhor - b.s.melhor || b.s.top3 - a.s.top3 || b.s.eventos - a.s.eventos)
      .map(({ j, s }) => `<tr><td><a href="${linkPerfil(j.id)}">${esc(j.apelido)}</a></td><td>${s.eventos}</td><td>${s.top3}</td><td>${melhorTxt(s.melhor)}</td><td>${s.v}-${s.d}-${s.e}</td></tr>`)
      .join("");
    return interna(`<div><span class="eyebrow">Temporada ${esc(temporada)}</span><h1>Ranking</h1></div>
      <p class="lead">A temporada vai de janeiro a dezembro. Enquanto a regra de pontuação não é definida, esta página mostra participações e colocações por evento.</p>
      ${linhas ? "" : vazio("Nenhum resultado registrado ainda.", "Os resultados de cada evento entram aqui depois de conferidos pela organização.")}
      <div class="table-box" role="region" aria-label="Tabela de participações" tabindex="0">
        <table><thead><tr><th>Jogador</th><th>Eventos</th><th>Top 3</th><th>Melhor colocação</th><th>V-D-E</th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="5" class="muted">Sem dados nesta temporada</td></tr>`}</tbody></table>
      </div>`);
  },

  /* Aba Decks: estatísticas por tipo do deck e melhores colocações (Top 3 de todos os eventos).
     Filtros: período (tudo, 3, 6 ou 12 meses, ano), que vale para a página toda, e tipo, que vale para a lista.
     Trocar o filtro não muda a rota, para não disparar o slide (aplicarFiltroDecks). */
  decks() {
    const itens = decksTop3();
    if (!itens.length) {
      return interna(`<div><span class="eyebrow">Tipos e listas</span><h1>Decks</h1></div>
        ${vazio("Nenhum resultado publicado ainda.", "As estatísticas e as listas do Top 3 aparecem aqui depois que os resultados de cada evento forem publicados.")}`);
    }
    const chip = (grupo, valor, rotulo, ativo) => `<button type="button" class="chip-filtro" data-filtro="${grupo}" data-valor="${esc(valor)}" aria-pressed="${ativo}">${rotulo}</button>`;
    const anos = [...new Set(DADOS.resultados.map(r => (eventoPorId(r.evento_id) || {}).data)
      .filter(d => DATA_ISO.test(d || "")).map(d => d.slice(0, 4)))].sort().reverse();
    const periodos = [["", "Tudo"], ["3m", "3 meses"], ["6m", "6 meses"], ["12m", "12 meses"], ...anos.map(a => [a, a])];
    const tipos = [...new Set(itens.map(x => tipoDoDeck(x.colocacao, x.decklist)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const filtroTipo = tipos.length > 1 ? `<div class="filtros" role="group" aria-label="Filtrar as colocações por tipo do deck">
        ${chip("tipo", "", "Todos", true)}${tipos.map(t => chip("tipo", slugTipo(t), `${TIPOS_COM_ICONE.includes(slugTipo(t))
          ? `<img src="assets/img/tipos/${slugTipo(t)}.png" alt="" width="18" height="18">` : ""}${esc(t)}`, false)).join("")}</div>` : "";
    const cartoes = itens.map(({ evento: ev, colocacao: c, decklist: d }) => {
      const tipo = tipoDoDeck(c, d);
      const total = (resultadoDo(ev.id)?.colocacoes || []).length;
      return `<li class="deck-card" data-tipo="${esc(slugTipo(tipo))}" data-data="${esc(ev.data)}">
        <span class="pos p${Number(c.posicao)}">${esc(c.posicao)}º</span>
        <span class="quem"><span class="quem-nome"><b>${esc(apelidoDe(c.jogador_id))}</b>${htmlTipo(tipo)}</span>
          <small>${esc(ev.nome)} · ${dataBR(ev.data)}</small>
          <small>${esc(c.posicao)}º de ${total} · ${vde(c)} (V-D-E)</small></span>
        <span class="acoes"><button type="button" class="btn ${d.reserva ? "btn-line" : "btn-ouro"} btn-sm" data-decklist="${esc(ev.id)}|${esc(c.jogador_id)}">${d.reserva ? "Em breve" : "Decklist"}</button></span>
      </li>`;
    }).join("");
    return interna(`<div><span class="eyebrow">Tipos e listas</span><h1>Decks</h1></div>
      <div class="filtros" role="group" aria-label="Período">${periodos.map(([v, r], i) => chip("periodo", v, esc(r), i === 0)).join("")}</div>
      <section class="decks-sec" aria-labelledby="est-titulo">
        <h2 id="est-titulo">Estatísticas por tipo</h2>
        <div class="decks-est">${htmlEstatDecks("")}</div>
      </section>
      <section class="decks-sec" aria-labelledby="col-titulo">
        <h2 id="col-titulo">Melhores colocações</h2>
        <p class="lead">O Top 3 de cada evento, do mais recente para o mais antigo, com a decklist.</p>
        ${filtroTipo}
        <ol class="podio decks">${cartoes}</ol>
        <div class="empty decks-vazio" hidden><b>Nenhuma colocação com esse filtro.</b><span>Escolha outro tipo ou período.</span></div>
      </section>`);
  },

  regras() {
    const bl = DADOS.banlist || { cartas: [] };
    const fonte = urlSegura(bl.fonte);
    const banlist = (bl.cartas || []).length
      ? `<div class="table-box" role="region" aria-label="Banlist" tabindex="0"><table>
          <thead><tr><th>Carta</th><th>Coleção</th><th>Número</th></tr></thead>
          <tbody>${bl.cartas.map(c => `<tr><td>${esc(c.nome)}</td><td>${esc(c.colecao)}</td><td>${esc(c.numero)}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="lead">Atualizada em ${dataBR(bl.atualizado_em)}.${fonte ? ` Fonte: <a href="${esc(fonte)}" target="_blank" rel="noopener">${esc(fonte)}</a>` : ""}</p>`
      : vazio("Banlist ainda não importada.", "Consulte a lista oficial em gymleaderchallenge.com enquanto ela não é publicada aqui.");
    return interna(`<div><span class="eyebrow">Formato</span><h1>Regras do GLC</h1></div>
      <p class="lead">A liga segue as regras oficiais do Gym Leader Challenge. Regras locais, quando existirem, aparecem abaixo e prevalecem em caso de conflito.</p>
      <div class="rules">
        <div class="rule"><span class="k">60</span><h3>Cartas no deck</h3><p>Uma cópia de cada carta, exceto Energias Básicas.</p></div>
        <div class="rule"><span class="k">1</span><h3>Tipo de Pokémon</h3><p>Todos os Pokémon do deck compartilham o mesmo tipo.</p></div>
        <div class="rule"><span class="k">0</span><h3>Pokémon com Regra</h3><p>Sem Pokémon ex, V, VSTAR, VMAX, GX e similares, e sem cartas ACE SPEC.</p></div>
      </div>
      <a class="btn btn-line" href="https://gymleaderchallenge.com" target="_blank" rel="noopener">Regras completas em gymleaderchallenge.com</a>
      <h2>Regras locais</h2>
      ${vazio("Nenhuma regra local publicada.", "Quando a organização definir regras próprias da liga, elas aparecem aqui.")}
      <h2>Banlist</h2>
      ${banlist}`);
  },

  /* #jogadores = lista; #jogadores/<id> = perfil */
  jogadores(id) {
    return id ? perfilJogador(id) : listaJogadores();
  }
};

function listaJogadores() {
  const lista = [...DADOS.jogadores].sort((a, b) => a.apelido.localeCompare(b.apelido, "pt-BR"));
  return interna(`<div><span class="eyebrow">Comunidade</span><h1>Jogadores</h1></div>
    <p class="lead">Toque em um jogador para ver o histórico de eventos, colocações e decklists.</p>
    ${lista.length ? `<div class="players">${lista.map(j => {
      const s = estatisticasDe(j.id);
      return `<a class="player" href="${linkPerfil(j.id)}">
        ${avatar(j)}
        <b>${esc(j.apelido)}</b>
        <span class="mini"><span><b>${s.eventos}</b> eventos</span><span><b>${s.top3}</b> Top 3</span><span>Melhor <b>${melhorTxt(s.melhor)}</b></span></span>
      </a>`;
    }).join("")}</div>`
      : vazio("Nenhum jogador cadastrado ainda.", "Os perfis são criados a partir dos resultados dos eventos.")}`);
}

function perfilJogador(id) {
  const j = jogadorPorId(id);
  if (!j) {
    return interna(`<a class="link-voltar" href="#jogadores">‹ Todos os jogadores</a>
      ${vazio("Jogador não encontrado.", "Confira o endereço ou volte para a lista de jogadores.")}`);
  }
  const s = estatisticasDe(j.id);
  const hist = historicoDe(j.id);
  const linhas = hist.map(({ evento, colocacao: c, decklist }) => `<article class="ev">
      ${dataBox(evento.data)}
      <div class="ev-body">
        <h3>${esc(evento.nome)}</h3>
        <div class="pills">
          <span class="pill ${c.posicao <= 3 ? "abertas" : ""}">${esc(c.posicao)}º lugar</span>
          ${evento.tipo ? `<span class="pill">${esc(evento.tipo)}</span>` : ""}
        </div>
        <div class="meta"><span><strong>Data:</strong> ${dataBR(evento.data)}</span><span><strong>V-D-E:</strong> ${vde(c)}</span>
          ${tipoDoDeck(c, decklist) ? `<span class="tipo-linha"><strong>Tipo do deck:</strong> ${htmlTipo(tipoDoDeck(c, decklist), { comTexto: true })}</span>` : ""}</div>
        <div class="actions">
          ${decklist ? `<button type="button" class="btn btn-ouro" data-decklist="${esc(evento.id)}|${esc(j.id)}">Ver decklist</button>` : ""}
          <button type="button" class="btn btn-line" data-resultados="${esc(evento.id)}">Classificação do evento</button>
        </div>
      </div>
    </article>`).join("");
  return interna(`<a class="link-voltar" href="#jogadores">‹ Todos os jogadores</a>
    <div class="perfil-head">
      ${avatar(j)}
      <div><span class="eyebrow">Jogador</span><h1>${esc(j.apelido)}</h1>
        <p class="lead">${[j.cidade, j.desde ? `Na liga desde ${esc(j.desde)}` : ""].filter(Boolean).map(esc).join(" · ")}</p></div>
    </div>
    <div class="stats">
      <div class="stat"><b>${s.eventos}</b><span>Eventos</span></div>
      <div class="stat"><b>${s.top3}</b><span>Top 3</span></div>
      <div class="stat"><b>${melhorTxt(s.melhor)}</b><span>Melhor colocação</span></div>
      <div class="stat"><b>${s.v}-${s.d}-${s.e}</b><span>V-D-E total</span></div>
    </div>
    <h2>Histórico</h2>
    ${linhas ? `<div class="list">${linhas}</div>` : vazio("Nenhum evento registrado.", "As participações aparecem aqui depois que os resultados forem publicados.")}`);
}

/* ---------- Pop-up (resultados e decklist) ---------- */

const modal = document.createElement("div");
modal.className = "modal";
modal.hidden = true;
modal.innerHTML = `<div class="modal-bg" data-fechar></div>
  <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
    <button type="button" class="modal-close" aria-label="Fechar" data-fechar>×</button>
    <div class="modal-body" id="modal-body"></div>
  </div>`;
document.body.appendChild(modal);
const modalBody = modal.querySelector("#modal-body");
let focoAnterior = null;

function trocarConteudo(html) {
  if (modal.hidden) { modalBody.innerHTML = html; return; }
  modalBody.classList.add("troca");
  setTimeout(() => {
    modalBody.innerHTML = html;
    modalBody.classList.remove("troca");
    modal.querySelector(".modal-panel").scrollTop = 0;
  }, 160);
}

function abrirModal(html) {
  trocarConteudo(html);
  if (!modal.hidden) return;
  focoAnterior = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-aberto");
  requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add("open")));
  modal.querySelector(".modal-close").focus({ preventScroll: true });
}

function fecharModal(imediato) {
  if (modal.hidden) return;
  modal.classList.remove("open");
  document.body.classList.remove("modal-aberto");
  const fim = () => { modal.hidden = true; modalBody.innerHTML = ""; };
  if (imediato) fim(); else setTimeout(fim, 320);
  if (focoAnterior && focoAnterior.isConnected) focoAnterior.focus({ preventScroll: true });
}

function htmlResultados(eventoId) {
  const ev = eventoPorId(eventoId);
  const r = resultadoDo(eventoId);
  if (!ev || !r) return vazio("Resultados não encontrados.", "");
  const linhas = [...(r.colocacoes || [])].sort((a, b) => a.posicao - b.posicao).map(c => {
    const deck = decklistTop3(ev.id, c.jogador_id, c.posicao);
    const existe = !!jogadorPorId(c.jogador_id);
    return `<li>
      <span class="pos ${c.posicao <= 3 ? "p" + Number(c.posicao) : ""}">${esc(c.posicao)}º</span>
      <span class="quem"><span class="quem-nome"><b>${esc(apelidoDe(c.jogador_id))}</b>${htmlTipo(tipoDoDeck(c, deck))}</span><small>${vde(c)} (V-D-E)${c.obs ? ` · ${esc(c.obs)}` : ""}</small></span>
      <span class="acoes">
        ${existe ? `<a class="btn btn-line btn-sm" href="${linkPerfil(c.jogador_id)}">Perfil</a>` : ""}
        ${deck ? `<button type="button" class="btn btn-ouro btn-sm" data-decklist="${esc(ev.id)}|${esc(c.jogador_id)}|lista">Decklist</button>` : ""}
      </span>
    </li>`;
  }).join("");
  return `<div><span class="eyebrow">Classificação</span><h2 id="modal-titulo">${esc(ev.nome)}</h2>
      <p class="lead">${[dataBR(ev.data), ev.local, ev.tipo].filter(Boolean).map(esc).join(" · ")}</p></div>
    <ol class="podio">${linhas}</ol>`;
}

/* Lista montada no painel: grade de cartas por grupo (imagem do pokemontcg.io com a quantidade),
   lista em texto e botão para copiar no formato do TCG Live. Imagem só com endereço validado (CARTA_IMG_VALIDA). */
function htmlCartas(cartas) {
  const grupos = agruparCartas(cartas);
  const carta = c => {
    const nome = `${c.nome}${c.colecao || c.numero ? ` (${[c.colecao, c.numero].filter(Boolean).join(" ")})` : ""}`;
    const img = CARTA_IMG_VALIDA.test(c.img || "") ? c.img : "";
    const grande = img.replace(/\.png$/, "_hires.png");
    return `<li class="carta" title="${esc(`${c.qtd}× ${nome}`)}">
      ${img ? `<a href="${esc(grande)}" target="_blank" rel="noopener" aria-label="${esc(`${c.qtd}× ${nome}: abrir imagem`)}">
        <img src="${esc(img)}" alt="${esc(`${c.qtd}× ${nome}`)}" data-nome="${esc(c.nome)}" data-falha="carta" loading="lazy" decoding="async" width="245" height="342"></a>`
        : `<span class="carta-txt">${esc(c.nome)}</span>`}
      <span class="carta-qtd" aria-hidden="true">${Number(c.qtd)}</span></li>`;
  };
  return `${grupos.map(g => `<section class="deck-grupo"><h3>${esc(g.categoria)} <span>${g.total}</span></h3>
      <ul class="deck-cartas">${g.cartas.map(carta).join("")}</ul></section>`).join("")}
    <details class="deck-texto"><summary>Lista em texto</summary><pre class="deck-txt">${esc(textoTcgLive(cartas))}</pre></details>
    <button type="button" class="btn btn-line btn-sm" data-copiar>Copiar para o TCG Live</button>`;
}

function htmlDecklist(eventoId, jogadorId, veioDaLista) {
  const ev = eventoPorId(eventoId);
  const colocacao = ((resultadoDo(eventoId) || {}).colocacoes || []).find(c => c.jogador_id === jogadorId);
  const d = colocacao ? decklistTop3(eventoId, jogadorId, colocacao.posicao) : decklistDe(eventoId, jogadorId);
  if (!ev || !d) return vazio("Decklist não encontrada.", "");
  const nome = apelidoDe(jogadorId);
  /* Imagem só com caminho validado (como o ícone); sem imagem válida nem texto, vale a reserva */
  const imagem = !d.reserva && DECKLIST_VALIDA.test(d.imagem || "") ? d.imagem : "";
  /* Preferência: lista montada no painel > foto enviada > reserva */
  const cartas = d.reserva ? [] : cartasDe(d);
  const reserva = !cartas.length && !imagem && !d.lista_texto;
  return `${veioDaLista ? `<button type="button" class="link-voltar" data-resultados="${esc(eventoId)}">‹ Voltar à classificação</button>` : ""}
    <div><span class="eyebrow">Decklist · ${d.posicao}º lugar</span><h2 id="modal-titulo">${esc(nome)}</h2>
      <p class="lead">${[ev.nome, dataBR(ev.data)].map(esc).join(" · ")}</p>
      ${tipoDoDeck(colocacao, d) ? `<p class="tipo-linha">${htmlTipo(tipoDoDeck(colocacao, d), { comTexto: true })}</p>` : ""}</div>
    ${reserva ? imgReserva("Decklist em breve: a imagem desta lista ainda não foi enviada.")
      : cartas.length ? `${htmlCartas(cartas)}${imagem ? `<a class="link-foto" href="${esc(imagem)}" target="_blank" rel="noopener">Ver a foto da lista</a>` : ""}`
      : imagem ? `<a href="${esc(imagem)}" target="_blank" rel="noopener" title="Abrir imagem em tamanho real">
        <img class="deck-img" src="${esc(imagem)}" alt="Decklist usada por ${esc(nome)} em ${esc(ev.nome)}" data-falha="reserva"></a>` : ""}
    ${d.lista_texto && !cartas.length ? `<pre class="deck-txt">${esc(d.lista_texto)}</pre>` : ""}
    <a class="btn btn-line btn-sm" href="${linkPerfil(jogadorId)}">Ver perfil de ${esc(nome)}</a>`;
}

/* Tabela de estatísticas por tipo do deck no período escolhido (só números, sem interpretação) */
const pct = x => x == null ? "—" : `${(x * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const qtd = (n, um, varios) => `<b>${n}</b> ${n === 1 ? um : varios}`;
function htmlEstatDecks(periodo) {
  const { inicio, fim } = periodoDatas(periodo);
  const s = estatisticasDecks(inicio, fim);
  if (!s.eventos) return vazio("Nenhum evento com resultado neste período.", "Escolha um período maior.");
  return `<p class="resumo">${qtd(s.eventos, "evento", "eventos")} · ${qtd(s.jogadores, "jogador", "jogadores")} · ${qtd(s.participacoes, "participação", "participações")}</p>
    <div class="table-box" role="region" aria-label="Estatísticas por tipo do deck" tabindex="0"><table class="tab-est">
      <thead><tr><th>Tipo</th><th>Uso</th><th>% do total</th><th>Jogadores</th><th>V-D-E</th><th>% de vitórias</th><th>Top 3</th><th>1º lugar</th></tr></thead>
      <tbody>${s.tipos.map(t => `<tr>
        <td>${t.tipo ? `<span class="tipo-linha">${htmlTipo(t.tipo, { comTexto: true })}</span>` : `<span class="muted">Não informado</span>`}</td>
        <td>${t.uso}</td><td>${pct(t.uso_pct)}</td><td>${t.jogadores}</td><td>${t.v}-${t.d}-${t.e}</td><td>${pct(t.vit_pct)}</td><td>${t.top3}</td><td>${t.titulos}</td>
      </tr>`).join("")}</tbody></table></div>
    <p class="nota">Uso: quantas vezes o tipo foi usado em evento. % de vitórias: vitórias ÷ partidas (V + D + E); o bye conta como vitória.</p>`;
}

/* Filtros da aba Decks: um chip ativo por grupo. O período refaz a tabela e vale também para a lista; o tipo vale só para a lista */
function aplicarFiltroDecks(chip) {
  const pagina = chip.closest(".page");
  pagina.querySelectorAll(`[data-filtro="${chip.dataset.filtro}"]`).forEach(b => b.setAttribute("aria-pressed", String(b === chip)));
  const ativo = grupo => pagina.querySelector(`[data-filtro="${grupo}"][aria-pressed="true"]`)?.dataset.valor || "";
  const tipo = ativo("tipo"), periodo = ativo("periodo");
  if (chip.dataset.filtro === "periodo") pagina.querySelector(".decks-est").innerHTML = htmlEstatDecks(periodo);
  const { inicio, fim } = periodoDatas(periodo);
  let visiveis = 0;
  pagina.querySelectorAll(".deck-card").forEach(li => {
    const mostra = (!tipo || li.dataset.tipo === tipo) && li.dataset.data >= inicio && li.dataset.data <= fim;
    li.hidden = !mostra;
    if (mostra) visiveis++;
  });
  pagina.querySelector(".decks-vazio").hidden = visiveis > 0;
}

/* Cliques em botões de resultado/decklist, filtros da aba Decks e fechamento do pop-up */
document.addEventListener("click", e => {
  const filtro = e.target.closest("[data-filtro]");
  if (filtro) { aplicarFiltroDecks(filtro); return; }
  const copiar = e.target.closest("[data-copiar]");
  if (copiar) { copiarLista(copiar); return; }
  const alvo = e.target.closest("[data-resultados],[data-decklist],[data-fechar]");
  if (!alvo) return;
  if (alvo.hasAttribute("data-fechar")) { fecharModal(); return; }
  if (alvo.dataset.resultados) { abrirModal(htmlResultados(alvo.dataset.resultados)); return; }
  const [ev, jog, origem] = alvo.dataset.decklist.split("|");
  abrirModal(htmlDecklist(ev, jog, origem === "lista"));
});
document.addEventListener("keydown", e => { if (e.key === "Escape") fecharModal(); });

/* Copia a lista em texto do pop-up. Sem acesso à área de transferência, abre a lista em texto para copiar à mão. */
async function copiarLista(botao) {
  const texto = modalBody.querySelector(".deck-texto");
  const original = "Copiar para o TCG Live";
  try {
    await navigator.clipboard.writeText(texto.querySelector("pre").textContent);
    botao.textContent = "Lista copiada!";
  } catch (e) {
    texto.open = true;
    botao.textContent = "Copie a lista em texto acima";
  }
  setTimeout(() => { if (botao.isConnected) botao.textContent = original; }, 2500);
}

/* Logo do Início com a mesma altura do título: no celular, só o h1 (que pode quebrar em mais linhas);
   no PC (≥760 px), o bloco inteiro, do "Liga roraimense..." até o fim do texto de apresentação (.lead).
   Ajuste pelo CSSOM (--logo-h), permitido pela CSP; sem JS vale a altura de 2 linhas definida no CSS. */
let logoObs = null;
const PC_HOME = window.matchMedia("(min-width:760px)");
function ajustarLogoHome() {
  logoObs?.disconnect();
  const titulo = document.querySelector(".home-titulo");
  const h1 = titulo?.querySelector("h1");
  const sobre = titulo?.querySelector(".eyebrow");
  const texto = titulo?.querySelector(".lead");
  if (!h1 || !sobre || !texto || !("ResizeObserver" in window)) return;
  const medir = () => {
    const [topo, fim] = PC_HOME.matches ? [sobre, texto] : [h1, h1];
    titulo.style.setProperty("--logo-h", `${Math.round(fim.getBoundingClientRect().bottom - topo.getBoundingClientRect().top)}px`);
  };
  logoObs = new ResizeObserver(medir);
  [h1, sobre, texto].forEach(el => logoObs.observe(el));
}
PC_HOME.addEventListener("change", () => ajustarLogoHome());

/* ---------- Menu do cabeçalho com pílula deslizante ---------- */

const stage = document.getElementById("stage");
const topnav = document.getElementById("topnav");
let ind = null;

function montarMenu() {
  topnav.innerHTML = `<span class="ind" aria-hidden="true"></span>` +
    MENU.map(([id, nome]) => `<a href="#${id}">${nome}</a>`).join("");
  ind = topnav.querySelector(".ind");
  topnav.addEventListener("mouseover", e => { const a = e.target.closest("a"); if (a) moverInd(a); });
  topnav.addEventListener("mouseleave", () => moverInd(linkAtivo()));
  topnav.addEventListener("focusin", e => { const a = e.target.closest("a"); if (a) moverInd(a); });
  topnav.addEventListener("focusout", () => moverInd(linkAtivo()));
  window.addEventListener("resize", () => moverInd(linkAtivo()));
  if (document.fonts) document.fonts.ready.then(() => moverInd(linkAtivo()));
}
const linkAtivo = () => topnav.querySelector('a[aria-current="page"]');
function moverInd(link) {
  topnav.querySelectorAll("a").forEach(a => a.classList.toggle("is-ind", a === link));
  if (!link) { ind.style.width = "0px"; return; }
  ind.style.width = link.offsetWidth + "px";
  ind.style.transform = `translateX(${link.offsetLeft}px)`;
}

/* ---------- Roteador com slide entre rotas ---------- */

function lerRota() {
  const [sec, sub] = (location.hash || "#inicio").slice(1).split("/");
  if (!PAGES[sec]) return { sec: "inicio", sub: "" };
  return { sec, sub: sub ? decodeURIComponent(sub) : "" };
}

/* Posição da rota na ordem do menu; sub-rotas (perfil) ficam "à direita" da seção */
const posicaoRota = r => MENU.findIndex(m => m[0] === r.sec) * 10 + (r.sub ? 1 : 0);

let atual = null;
function render() {
  const rota = lerRota();
  const chave = rota.sec + "/" + rota.sub;
  if (atual && chave === atual.sec + "/" + atual.sub) return;
  const dir = atual === null ? 0 : Math.sign(posicaoRota(rota) - posicaoRota(atual));
  fecharModal(true);

  document.body.classList.toggle("is-home", rota.sec === "inicio");
  topnav.querySelectorAll("a").forEach(a =>
    a.getAttribute("href") === "#" + rota.sec ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  moverInd(linkAtivo());
  if (rota.sec !== "inicio") linkAtivo()?.scrollIntoView({ inline: "center", block: "nearest" });
  const nomeSec = MENU.find(m => m[0] === rota.sec)[1];
  const titulo = rota.sec === "jogadores" && rota.sub ? apelidoDe(rota.sub) : nomeSec;
  document.title = rota.sec === "inicio" ? "Liga GLC Roraima" : `${titulo} | Liga GLC Roraima`;

  const novo = document.createElement("div");
  novo.className = "view";
  novo.innerHTML = PAGES[rota.sec](rota.sub);
  const velho = stage.querySelector(".view:not(.leaving)");

  if (velho && dir) {
    velho.classList.add("leaving");
    novo.style.transition = "none";
    novo.style.transform = `translateX(${dir * 100}%)`;
    stage.appendChild(novo);
    novo.offsetWidth; // força o layout antes de animar
    novo.style.transition = "";
    novo.style.transform = "translateX(0)";
    velho.style.transform = `translateX(${-dir * 100}%)`;
    velho.style.opacity = ".4";
    const limpar = () => velho.remove();
    velho.addEventListener("transitionend", limpar, { once: true });
    setTimeout(limpar, 800);
  } else {
    stage.replaceChildren(novo);
  }
  atual = rota;
  window.scrollTo({ top: 0 });
  ajustarLogoHome();
}

/* ---------- Início ---------- */

/* Imagens do HTML fixo (logo do cabeçalho) que falharam antes de este script rodar */
document.querySelectorAll("img[data-falha]").forEach(img => { if (img.complete && !img.naturalWidth) tratarFalhaImagem(img); });
montarMenu();
carregarDados()
  .then(() => {
    window.addEventListener("hashchange", render);
    render();
  })
  .catch(erro => {
    console.error(erro);
    const viaArquivo = location.protocol === "file:";
    stage.innerHTML = `<div class="wrap page">${vazio("Não foi possível carregar os dados do site.",
      viaArquivo
        ? "O site foi aberto direto do computador (file://), e assim o navegador bloqueia a leitura dos JSON. Teste com um servidor local, como a extensão Live Server do VS Code, ou no GitHub Pages."
        : esc(erro.message))}</div>`;
  });

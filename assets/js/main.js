/* Liga GLC Roraima — navegação, páginas, pop-up de resultados e carrossel.
   Site de uma página (SPA) com rotas por âncora:
   #inicio, #calendario, #ranking, #regras, #jogadores e #jogadores/<id> (perfil).
   Ao trocar de rota, a página desliza na direção da ordem do menu. */

const MENU = [
  ["inicio", "Início"], ["calendario", "Calendário"], ["ranking", "Ranking"],
  ["regras", "Regras"], ["jogadores", "Jogadores"]
];

const LOGO = "assets/icons/GLCRR-logo.png";

const PH_BG = [
  "linear-gradient(135deg,#3E8ED0,#1E8F4E)", "linear-gradient(135deg,#1E8F4E,#F2C230)",
  "linear-gradient(135deg,#F2C230,#3E8ED0)", "linear-gradient(160deg,#2A6FA8,#3E8ED0)",
  "linear-gradient(135deg,#166B3A,#3E8ED0)", "linear-gradient(135deg,#D62828,#F2C230)"
];

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONES = {
  calendario: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  ranking: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
  regras: svg('<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 9h6M8 13h6"/>'),
  jogadores: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 4.5 5"/>')
};
const IG_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>`;

/* ---------- Componentes ---------- */

const vazio = (titulo, texto) => `<div class="empty"><b>${titulo}</b><span>${texto}</span></div>`;
const interna = html => `<div class="wrap page">${html}</div>`;
const logoHTML = (classe, alt) =>
  `<span class="logo ${classe}"><span class="badge" aria-hidden="true"></span><img src="${LOGO}" alt="${alt}" onerror="this.remove()"></span>`;
const linkPerfil = id => `#jogadores/${encodeURIComponent(id)}`;
const melhorTxt = n => Number.isFinite(n) ? `${n}º` : "—";
const inicial = nome => esc((nome || "?").trim().charAt(0).toUpperCase());

function dataBox(iso) {
  const [a, m, d] = iso.split("-");
  return `<div class="date" aria-hidden="true"><b>${d}</b><span>${MESES[+m - 1]} ${a.slice(2)}</span></div>`;
}

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
        <span class="pill ${cls}">${st}</span>
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

/* ---------- Páginas ---------- */

const PAGES = {
  inicio() {
    const instagram = DADOS.config.instagram_url || "https://www.instagram.com/glc.roraima/";
    return `<div class="home">
      <div class="home-top">
        <div class="home-side">
          ${logoHTML("logo-home", "Logo da Liga GLC Roraima")}
          <span class="eyebrow">Liga roraimense de Pokémon TCG</span>
          <h1>Torne-se um <em>Líder de Ginásio!</em></h1>
          <p class="lead">Um tipo de Pokémon, uma cópia de cada carta, sessenta cartas no deck. Venha jogar, conhecer a comunidade e acompanhar os próximos eventos.</p>
          <a class="btn btn-ouro" href="${esc(instagram)}" target="_blank" rel="noopener">${IG_SVG} Siga no Instagram</a>
        </div>
        <section class="carousel" aria-roledescription="carrossel" aria-label="Fotos da liga" id="carousel">
          <div class="track"></div>
          <button class="car-btn prev" aria-label="Foto anterior">‹</button>
          <button class="car-btn next" aria-label="Próxima foto">›</button>
          <div class="dots"></div>
        </section>
      </div>
      <nav class="float-menu" aria-label="Menu principal">
        ${MENU.slice(1).map(([id, nome], i) =>
          `<a href="#${id}" style="--d:${(i * 0.08).toFixed(2)}s"><span class="ic">${ICONES[id]}</span>${nome}</a>`).join("")}
      </nav>
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
        <tbody>${linhas || `<tr><td colspan="5" style="color:var(--muted)">Sem dados nesta temporada</td></tr>`}</tbody></table>
      </div>`);
  },

  regras() {
    const bl = DADOS.banlist || { cartas: [] };
    const banlist = (bl.cartas || []).length
      ? `<div class="table-box" role="region" aria-label="Banlist" tabindex="0"><table>
          <thead><tr><th>Carta</th><th>Coleção</th><th>Número</th></tr></thead>
          <tbody>${bl.cartas.map(c => `<tr><td>${esc(c.nome)}</td><td>${esc(c.colecao)}</td><td>${esc(c.numero)}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="lead">Atualizada em ${dataBR(bl.atualizado_em)}. Fonte: <a href="${esc(bl.fonte)}" target="_blank" rel="noopener">${esc(bl.fonte)}</a></p>`
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
        <span class="avatar" aria-hidden="true">${inicial(j.apelido)}</span>
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
          <span class="pill ${c.posicao <= 3 ? "abertas" : ""}">${c.posicao}º lugar</span>
          ${evento.tipo ? `<span class="pill">${esc(evento.tipo)}</span>` : ""}
        </div>
        <div class="meta"><span><strong>Data:</strong> ${dataBR(evento.data)}</span><span><strong>V-D-E:</strong> ${vde(c)}</span>
          ${decklist?.tipo_pokemon ? `<span><strong>Tipo do deck:</strong> ${esc(decklist.tipo_pokemon)}</span>` : ""}</div>
        <div class="actions">
          ${decklist ? `<button type="button" class="btn btn-ouro" data-decklist="${esc(evento.id)}|${esc(j.id)}">Ver decklist</button>` : ""}
          <button type="button" class="btn btn-line" data-resultados="${esc(evento.id)}">Classificação do evento</button>
        </div>
      </div>
    </article>`).join("");
  return interna(`<a class="link-voltar" href="#jogadores">‹ Todos os jogadores</a>
    <div class="perfil-head">
      <span class="avatar" aria-hidden="true">${inicial(j.apelido)}</span>
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
    const deck = c.posicao <= 3 ? decklistDe(ev.id, c.jogador_id) : null;
    const existe = !!jogadorPorId(c.jogador_id);
    return `<li>
      <span class="pos ${c.posicao <= 3 ? "p" + c.posicao : ""}">${c.posicao}º</span>
      <span class="quem"><b>${esc(apelidoDe(c.jogador_id))}</b><small>${vde(c)} (V-D-E)${c.obs ? ` · ${esc(c.obs)}` : ""}</small></span>
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

function htmlDecklist(eventoId, jogadorId, veioDaLista) {
  const ev = eventoPorId(eventoId);
  const d = decklistDe(eventoId, jogadorId);
  if (!ev || !d) return vazio("Decklist não encontrada.", "");
  const nome = apelidoDe(jogadorId);
  return `${veioDaLista ? `<button type="button" class="link-voltar" data-resultados="${esc(eventoId)}">‹ Voltar à classificação</button>` : ""}
    <div><span class="eyebrow">Decklist · ${d.posicao}º lugar</span><h2 id="modal-titulo">${esc(nome)}</h2>
      <p class="lead">${[ev.nome, dataBR(ev.data), d.tipo_pokemon ? `Tipo ${d.tipo_pokemon}` : ""].filter(Boolean).map(esc).join(" · ")}</p></div>
    ${d.imagem ? `<a href="${esc(d.imagem)}" target="_blank" rel="noopener" title="Abrir imagem em tamanho real">
        <img class="deck-img" src="${esc(d.imagem)}" alt="Decklist usada por ${esc(nome)} em ${esc(ev.nome)}"
          onerror="this.closest('a').outerHTML='<div class=&quot;empty&quot;><b>Imagem da decklist não encontrada.</b></div>'"></a>` : ""}
    ${d.lista_texto ? `<pre class="deck-txt">${esc(d.lista_texto)}</pre>` : ""}
    <a class="btn btn-line btn-sm" href="${linkPerfil(jogadorId)}">Ver perfil de ${esc(nome)}</a>`;
}

/* Cliques em botões de resultado/decklist e fechamento do pop-up */
document.addEventListener("click", e => {
  const alvo = e.target.closest("[data-resultados],[data-decklist],[data-fechar]");
  if (!alvo) return;
  if (alvo.hasAttribute("data-fechar")) { fecharModal(); return; }
  if (alvo.dataset.resultados) { abrirModal(htmlResultados(alvo.dataset.resultados)); return; }
  const [ev, jog, origem] = alvo.dataset.decklist.split("|");
  abrirModal(htmlDecklist(ev, jog, origem === "lista"));
});
document.addEventListener("keydown", e => { if (e.key === "Escape") fecharModal(); });

/* ---------- Fotos do carrossel ----------
   Lista sozinha os .jpg/.jpeg/.png/.webp da pasta de fotos pela API do GitHub.
   Dono e repositório vêm de config.json (github.owner/repo) ou do endereço <usuario>.github.io/<repo>/.
   Reserva: data/fotos.json (lista de nomes de arquivo), para domínio próprio ou falha da API. */

const EXT_FOTO = /\.(jpe?g|png|webp)$/i;
let fotosCache = null;

function repoGitHub() {
  const gh = DADOS.config.github || {};
  if (gh.owner && gh.repo) return { owner: gh.owner, repo: gh.repo };
  const { hostname, pathname } = location;
  if (!hostname.endsWith(".github.io")) return null;
  const owner = hostname.split(".")[0];
  const seg = pathname.split("/").filter(Boolean)[0];
  const repo = seg && !seg.includes(".") ? seg : hostname; // site de usuário fica no repo <usuario>.github.io
  return { owner, repo };
}

async function listarFotos() {
  if (fotosCache) return fotosCache;
  const pasta = DADOS.config.pasta_fotos || "assets/images/fotos";
  const caminho = nome => `${pasta}/${encodeURIComponent(nome)}`;
  const gh = repoGitHub();
  if (gh) {
    const chave = `fotos:${gh.owner}/${gh.repo}`;
    try { const s = sessionStorage.getItem(chave); if (s) return (fotosCache = JSON.parse(s)); } catch (e) { }
    try {
      const resp = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${pasta}`);
      if (resp.ok) {
        const itens = await resp.json();
        const lista = itens.filter(i => i.type === "file" && EXT_FOTO.test(i.name))
          .map(i => i.name).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map(caminho);
        if (lista.length) {
          try { sessionStorage.setItem(chave, JSON.stringify(lista)); } catch (e) { }
          return (fotosCache = lista);
        }
      }
    } catch (e) { console.warn("API do GitHub indisponível; usando data/fotos.json.", e); }
  }
  try {
    const resp = await fetch("data/fotos.json", { cache: "no-store" });
    if (resp.ok) {
      const nomes = await resp.json();
      if (Array.isArray(nomes)) return (fotosCache = nomes.filter(n => EXT_FOTO.test(n)).map(caminho));
    }
  } catch (e) { }
  return (fotosCache = []);
}

function montarSlides(root, fotos) {
  root.querySelector(".track").innerHTML = fotos.map((src, i) => `
    <div class="slide" role="group" aria-roledescription="slide" aria-label="Foto ${i + 1} de ${fotos.length}">
      <div class="ph" style="background:${PH_BG[i % PH_BG.length]}"></div>
      <img src="${esc(src)}" alt="Foto ${i + 1} de evento da liga" ${i ? 'loading="lazy"' : ""} onerror="this.remove()">
    </div>`).join("");
  root.querySelector(".dots").innerHTML = fotos.map((_, i) => `<button aria-label="Ir para a foto ${i + 1}"></button>`).join("");
}

/* Autoplay 5 s, pausa com mouse/foco, setas, pontos e arraste no celular */
let carTimer = null;
async function iniciarCarrossel() {
  clearInterval(carTimer);
  const root = document.getElementById("carousel");
  if (!root) return;
  const fotos = await listarFotos();
  if (!root.isConnected) return;
  if (!fotos.length) { root.hidden = true; return; }
  montarSlides(root, fotos);
  const track = root.querySelector(".track");
  const dots = [...root.querySelectorAll(".dots button")];
  const n = dots.length;
  let i = 0;
  const ir = k => {
    i = (k + n) % n;
    track.style.transform = `translateX(${-i * 100}%)`;
    dots.forEach((d, j) => d.setAttribute("aria-current", j === i ? "true" : "false"));
  };
  const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tocar = () => { clearInterval(carTimer); if (!reduzir && n > 1) carTimer = setInterval(() => ir(i + 1), 5000); };
  root.querySelector(".prev").onclick = () => { ir(i - 1); tocar(); };
  root.querySelector(".next").onclick = () => { ir(i + 1); tocar(); };
  dots.forEach((d, j) => d.onclick = () => { ir(j); tocar(); });
  root.addEventListener("mouseenter", () => clearInterval(carTimer));
  root.addEventListener("mouseleave", tocar);
  root.addEventListener("focusin", () => clearInterval(carTimer));
  let x0 = null;
  root.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) { ir(dx < 0 ? i + 1 : i - 1); tocar(); }
  });
  ir(0);
  tocar();
}

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
  iniciarCarrossel();
}

/* ---------- Início ---------- */

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

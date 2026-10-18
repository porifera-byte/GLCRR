/* Painel GLC RR — login, sessão e telas.
   A chave do GitHub decifrada fica só no sessionStorage desta aba e some ao fechar.
   Usa esc() e hojeBV() de assets/js/data.js, Cripto e GitHub. */
(function () {
  "use strict";

  /* Não funciona dentro de moldura (evita clique disfarçado por outro site) */
  if (window.top !== window.self) {
    document.body.textContent = "";
    return;
  }

  const CHAVE_SESSAO = "glcrr-painel";
  const $ = sel => document.querySelector(sel);

  const SECOES = [
    { id: "inicio", nome: "Início" },
    { id: "jogadores", nome: "Jogadores", etapa: 2 },
    { id: "eventos", nome: "Eventos", etapa: 3 },
    { id: "resultados", nome: "Resultados", etapa: 3 },
    { id: "suico", nome: "Torneio suíço", etapa: 5 }
  ];

  const logoImg = document.querySelector(".logo img");
  if (logoImg) logoImg.addEventListener("error", () => logoImg.remove());

  /* ---------- Sessão ---------- */

  function lerSessao() {
    try {
      const s = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || "null");
      return s && s.usuario && s.token ? s : null;
    } catch (e) {
      return null;
    }
  }

  function guardarSessao(s) {
    try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); } catch (e) { /* aba privada: vale só até recarregar */ }
  }

  function sair(mensagem) {
    try { sessionStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* nada a limpar */ }
    GitHub.configurar({ token: "", usuario: "" });
    $("#sessao").hidden = true;
    $("#nav").hidden = true;
    $("#nav").textContent = "";
    $("#tela").replaceChildren(telaLogin);
    telaLogin.querySelector("[name=senha]").value = "";
    $("#msg-login").textContent = mensagem || "";
    $("#msg-login").classList.toggle("erro", !!mensagem);
    history.replaceState(null, "", location.pathname);
    telaLogin.querySelector("[name=usuario]").focus();
  }

  /* ---------- Login ---------- */

  const telaLogin = $("#tela-login");
  const formLogin = $("#form-login");

  async function carregarUsuarios() {
    const resp = await fetch("usuarios.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`Não foi possível carregar usuarios.json (HTTP ${resp.status}).`);
    const lista = await resp.json();
    return Array.isArray(lista) ? lista.filter(Cripto.registroValido) : [];
  }

  formLogin.addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $("#msg-login");
    const botao = formLogin.querySelector("button");
    const usuario = Cripto.normalizarUsuario(formLogin.usuario.value);
    const senha = formLogin.senha.value;
    msg.classList.remove("erro");
    if (!usuario || !senha) {
      msg.textContent = "Preencha usuário e senha.";
      msg.classList.add("erro");
      return;
    }
    botao.disabled = true;
    msg.textContent = "Verificando…";
    try {
      const registro = (await carregarUsuarios()).find(r => r.usuario === usuario);
      const token = registro ? await Cripto.abrirRegistro(registro, senha) : null;
      if (!token) throw new Error("Usuário ou senha incorretos.");
      GitHub.configurar({ token, usuario, aoExpirar: () => sair("A chave do GitHub foi recusada. Entre de novo ou fale com o organizador principal.") });
      msg.textContent = "Conferindo o acesso ao GitHub…";
      const problemas = await GitHub.verificarAcesso();
      if (problemas.length) throw new Error(`A chave não acessa tudo o que o painel precisa: ${problemas.join("; ")}.`);
      guardarSessao({ usuario, token });
      formLogin.senha.value = "";
      msg.textContent = "";
      entrar({ usuario, token });
    } catch (e) {
      GitHub.configurar({ token: "", usuario: "" });
      formLogin.senha.value = "";
      msg.textContent = e.message;
      msg.classList.add("erro");
    } finally {
      botao.disabled = false;
    }
  });

  /* ---------- Painel ---------- */

  function entrar(sessao) {
    GitHub.configurar({ token: sessao.token, usuario: sessao.usuario, aoExpirar: () => sair("A chave do GitHub foi recusada. Entre de novo ou fale com o organizador principal.") });
    $("#quem").textContent = sessao.usuario;
    $("#sessao").hidden = false;
    montarNav();
    $("#nav").hidden = false;
    rotear();
  }

  function montarNav() {
    $("#nav").innerHTML = SECOES.map(s => `<a href="#${s.id}" data-id="${s.id}">${esc(s.nome)}</a>`).join("");
  }

  function secaoAtual() {
    const id = location.hash.replace(/^#/, "").split("/")[0];
    return SECOES.find(s => s.id === id) || SECOES[0];
  }

  function rotear() {
    if (!lerSessao()) return;
    const secao = secaoAtual();
    document.querySelectorAll("#nav a").forEach(a => {
      if (a.dataset.id === secao.id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = `${secao.nome} · Painel GLC RR`;
    const tela = document.createElement("section");
    tela.className = "page adm-page";
    tela.setAttribute("aria-labelledby", "titulo-tela");
    $("#tela").replaceChildren(tela);
    (TELAS[secao.id] || telaEmConstrucao)(tela, secao);
    tela.querySelector("h1").focus({ preventScroll: true });
  }

  function telaEmConstrucao(tela, secao) {
    tela.innerHTML = `
      <h1 id="titulo-tela" tabindex="-1">${esc(secao.nome)}</h1>
      <div class="empty"><b>Em construção</b>Esta tela chega na etapa ${secao.etapa} do plano do painel.</div>`;
  }

  const TELAS = {
    inicio(tela) {
      tela.innerHTML = `
        <div>
          <p class="eyebrow">Painel</p>
          <h1 id="titulo-tela" tabindex="-1">Olá, ${esc(Cripto.normalizarUsuario($("#quem").textContent))}</h1>
        </div>
        <p class="lead">Situação atual dos dados da liga, lida direto do GitHub.</p>
        <div class="stats" id="resumo" aria-busy="true">
          ${["Jogadores", "Cadastros privados", "Eventos", "Próximos eventos", "Eventos com resultado"]
            .map(t => `<div class="stat adm-carregando"><b>–</b><span>${t}</span></div>`).join("")}
        </div>
        <p class="adm-msg" id="msg-resumo" role="status" aria-live="polite"></p>
        <p class="adm-nota">Gravações feitas pelo painel vão direto para o site. Ele atualiza em cerca de 1 minuto.</p>`;
      carregarResumo(tela);
    }
  };

  async function carregarResumo(tela) {
    const caixa = tela.querySelector("#resumo");
    const msg = tela.querySelector("#msg-resumo");
    try {
      const [jog, priv, evs, res] = await Promise.all([
        GitHub.lerJSON("publico", "data/jogadores.json"),
        GitHub.lerJSON("privado", "jogadores-privado.json"),
        GitHub.lerJSON("publico", "data/eventos.json"),
        GitHub.lerJSON("publico", "data/resultados.json")
      ]);
      if (!tela.isConnected) return;
      const hoje = hojeBV();
      const numeros = [
        jog.dados.length,
        priv.dados.length,
        evs.dados.length,
        evs.dados.filter(e => e.data >= hoje).length,
        res.dados.length
      ];
      caixa.querySelectorAll(".stat").forEach((el, i) => {
        el.classList.remove("adm-carregando");
        el.querySelector("b").textContent = numeros[i];
      });
      const semPrivado = jog.dados.filter(j => !j.teste && !priv.dados.some(p => p.id === j.id)).length;
      msg.textContent = semPrivado ? `${semPrivado} jogador(es) sem cadastro privado (nome e nascimento).` : "";
    } catch (e) {
      if (!tela.isConnected) return;
      msg.textContent = e.message;
      msg.classList.add("erro");
    } finally {
      caixa.removeAttribute("aria-busy");
    }
  }

  /* ---------- Início ---------- */

  $("#sair").addEventListener("click", () => sair());
  window.addEventListener("hashchange", rotear);

  const sessao = lerSessao();
  if (sessao) entrar(sessao);
})();

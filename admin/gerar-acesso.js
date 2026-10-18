/* Painel GLC RR — gerador de registro de acesso.
   Cifra a chave do GitHub com a senha, aqui no navegador, e mostra só o registro cifrado.
   Nada é guardado no aparelho nem enviado, além da conferência da chave na API do GitHub. */
(function () {
  "use strict";

  if (window.top !== window.self) {
    document.body.textContent = "";
    return;
  }

  const form = document.getElementById("form-gerar");
  const msg = document.getElementById("msg-gerar");
  const resultado = document.getElementById("resultado");
  const saida = document.getElementById("registro");
  const logoImg = document.querySelector(".logo img");
  if (logoImg) logoImg.addEventListener("error", () => logoImg.remove());

  function aviso(texto, tipo) {
    msg.textContent = texto;
    msg.classList.toggle("erro", tipo === "erro");
    msg.classList.toggle("ok", tipo === "ok");
  }

  async function usuarioJaExiste(usuario) {
    try {
      const resp = await fetch("usuarios.json", { cache: "no-store" });
      const lista = resp.ok ? await resp.json() : [];
      return Array.isArray(lista) && lista.some(r => r && r.usuario === usuario);
    } catch (e) {
      return false;
    }
  }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const botao = form.querySelector("button");
    const usuario = Cripto.normalizarUsuario(form.usuario.value);
    const senha = form.senha.value;
    const chave = form.chave.value.trim();
    resultado.hidden = true;

    if (!Cripto.usuarioValido(usuario)) return aviso("Usuário inválido: use de 3 a 20 letras minúsculas, números ou hífen.", "erro");
    if (senha.length < 12) return aviso("A senha precisa ter 12 caracteres ou mais.", "erro");
    if (senha !== form.senha2.value) return aviso("As senhas não conferem.", "erro");
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(chave)) return aviso("Isso não parece uma chave do GitHub (deve começar com github_pat_).", "erro");

    botao.disabled = true;
    try {
      aviso("Conferindo a chave no GitHub…");
      GitHub.configurar({ token: chave, usuario });
      const problemas = await GitHub.verificarAcesso();
      if (problemas.length) throw new Error(`A chave não acessa os dois repositórios: ${problemas.join("; ")}.`);

      aviso("Cifrando…");
      const registro = await Cripto.gerarRegistro(usuario, senha, chave);
      if (await Cripto.abrirRegistro(registro, senha) !== chave) throw new Error("Falha ao conferir o registro. Tente de novo.");

      saida.value = JSON.stringify(registro, null, 2);
      resultado.hidden = false;
      form.senha.value = "";
      form.senha2.value = "";
      form.chave.value = "";
      const repetido = await usuarioJaExiste(usuario);
      aviso(repetido
        ? `Registro gerado. Já existe um acesso "${usuario}": o novo vai substituí-lo.`
        : "Registro gerado.", "ok");
      resultado.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    } catch (e) {
      aviso(e.message, "erro");
    } finally {
      GitHub.configurar({ token: "", usuario: "" });
      botao.disabled = false;
    }
  });

  document.getElementById("copiar").addEventListener("click", async () => {
    const msgCopiar = document.getElementById("msg-copiar");
    try {
      await navigator.clipboard.writeText(saida.value);
      msgCopiar.textContent = "Copiado. Agora cole no chat do projeto.";
    } catch (e) {
      saida.focus();
      saida.select();
      msgCopiar.textContent = "Selecionei o texto: copie com Ctrl+C (ou toque e segure no celular).";
    }
  });
})();

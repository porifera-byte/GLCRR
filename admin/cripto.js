/* Painel GLC RR — cifra da chave do GitHub com a senha do organizador.
   PBKDF2-SHA256 (600 mil iterações) gera a chave AES-GCM a partir da senha.
   O usuário entra como dado autenticado: um registro não serve para outro usuário.
   Só Web Crypto, sem bibliotecas. Funciona no navegador e no Node 20+ (testes). */
(function (raiz) {
  "use strict";

  const ITERACOES = 600000;
  const utf8 = new TextEncoder();
  const deUtf8 = new TextDecoder();
  const subtle = () => raiz.crypto.subtle;

  function paraB64(bytes) {
    let s = "";
    new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); });
    return btoa(s);
  }

  function deB64(texto) {
    const s = atob(texto);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  /* Usuário do painel: minúsculo, sem acento, letras, números e hífen (3 a 20) */
  function normalizarUsuario(usuario) {
    return String(usuario || "").trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  const usuarioValido = u => /^[a-z0-9-]{3,20}$/.test(u);

  async function derivarChave(senha, salt, iteracoes) {
    const base = await subtle().importKey("raw", utf8.encode(senha), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: iteracoes },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  /* Cria o registro de admin/usuarios.json. A senha e a chave não saem desta função. */
  async function gerarRegistro(usuario, senha, chaveGithub) {
    const u = normalizarUsuario(usuario);
    if (!usuarioValido(u)) throw new Error("Usuário inválido: use de 3 a 20 letras, números ou hífen.");
    if (String(senha).length < 12) throw new Error("A senha precisa ter 12 caracteres ou mais.");
    if (!String(chaveGithub).trim()) throw new Error("Informe a chave do GitHub.");
    const salt = raiz.crypto.getRandomValues(new Uint8Array(16));
    const iv = raiz.crypto.getRandomValues(new Uint8Array(12));
    const chave = await derivarChave(senha, salt, ITERACOES);
    const cifrado = await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: utf8.encode(u) },
      chave, utf8.encode(String(chaveGithub).trim()));
    return { usuario: u, salt: paraB64(salt), iv: paraB64(iv), iter: ITERACOES, chave_cifrada: paraB64(cifrado) };
  }

  /* Devolve a chave do GitHub ou null se a senha estiver errada. */
  async function abrirRegistro(registro, senha) {
    try {
      const chave = await derivarChave(senha, deB64(registro.salt), registro.iter || ITERACOES);
      const claro = await subtle().decrypt(
        { name: "AES-GCM", iv: deB64(registro.iv), additionalData: utf8.encode(registro.usuario) },
        chave, deB64(registro.chave_cifrada));
      return deUtf8.decode(claro);
    } catch (e) {
      return null;
    }
  }

  /* Confere o formato de um registro antes de usar ou incluir em usuarios.json */
  function registroValido(r) {
    return !!r && usuarioValido(r.usuario) && Number.isInteger(r.iter) && r.iter >= ITERACOES &&
      ["salt", "iv", "chave_cifrada"].every(k => typeof r[k] === "string" && /^[A-Za-z0-9+/]+=*$/.test(r[k]));
  }

  const api = { ITERACOES, normalizarUsuario, usuarioValido, gerarRegistro, abrirRegistro, registroValido, paraB64, deB64 };
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.Cripto = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

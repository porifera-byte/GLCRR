/* Painel GLC RR — regras do cadastro de jogadores, sem DOM (testável no Node).
   id do jogador = slug do apelido; não muda depois de criado. */
(function (raiz) {
  "use strict";

  /* minúsculo, sem acento */
  function semAcento(texto) {
    return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  /* Forma de comparação: só letras e números */
  const chaveComparacao = texto => semAcento(texto).replace(/[^a-z0-9]/g, "");

  /* "Ash RR" → "ash-rr" */
  function slug(apelido) {
    const s = semAcento(apelido).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
    return s || "jogador";
  }

  /* Acrescenta -2, -3... se o id já existir */
  function idUnico(base, existentes) {
    const usados = new Set(existentes);
    if (!usados.has(base)) return base;
    for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  function distancia(a, b) {
    if (a === b) return 0;
    let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const atual = [i];
      for (let j = 1; j <= b.length; j++) {
        atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      anterior = atual;
    }
    return anterior[b.length];
  }

  /* Igual sem acento/símbolos, um contido no outro (3+ letras) ou poucas letras de diferença */
  function apelidosParecidos(a, b) {
    const x = chaveComparacao(a), y = chaveComparacao(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const menor = Math.min(x.length, y.length);
    if (menor >= 3 && (x.includes(y) || y.includes(x))) return true;
    const limite = menor >= 6 ? 2 : menor >= 3 ? 1 : 0;
    return distancia(x, y) <= limite;
  }

  /* Jogadores com apelido ou id parecido com o informado (ignora o próprio id na edição) */
  function parecidosCom(apelido, jogadores, ignorarId) {
    return jogadores.filter(j => j.id !== ignorarId &&
      (apelidosParecidos(apelido, j.apelido) || apelidosParecidos(apelido, j.id)));
  }

  function dataValida(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [a, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /* Idade em anos completos na data "hoje" (AAAA-MM-DD) */
  function idade(nascimento, hoje) {
    if (!dataValida(nascimento) || !dataValida(hoje)) return null;
    const [an, mn, dn] = nascimento.split("-").map(Number);
    const [ah, mh, dh] = hoje.split("-").map(Number);
    return ah - an - (mh < mn || (mh === mn && dh < dn) ? 1 : 0);
  }

  const limpar = v => String(v ?? "").trim().replace(/\s+/g, " ");

  /* Confere o formulário. Devolve { dados, erros } (erros: { campo: mensagem }). */
  function validar(entrada, hoje) {
    const anoAtual = Number(hoje.slice(0, 4));
    const dados = {
      apelido: limpar(entrada.apelido),
      cidade: limpar(entrada.cidade),
      desde: Number(entrada.desde),
      nome: limpar(entrada.nome),
      nascimento: String(entrada.nascimento || "").trim()
    };
    const erros = {};
    if (dados.apelido.length < 2 || dados.apelido.length > 30) erros.apelido = "Use de 2 a 30 caracteres.";
    else if (!chaveComparacao(dados.apelido)) erros.apelido = "O apelido precisa ter pelo menos uma letra ou número.";
    if (dados.cidade.length > 40) erros.cidade = "Use até 40 caracteres.";
    if (!Number.isInteger(dados.desde) || dados.desde < 2020 || dados.desde > anoAtual + 1) erros.desde = `Informe um ano entre 2020 e ${anoAtual + 1}.`;
    if (dados.nome && (dados.nome.length < 3 || dados.nome.length > 80)) erros.nome = "Use de 3 a 80 caracteres.";
    if (dados.nascimento) {
      if (!dataValida(dados.nascimento)) erros.nascimento = "Data inválida.";
      else if (dados.nascimento > hoje) erros.nascimento = "A data não pode estar no futuro.";
      else if (dados.nascimento < "1920-01-01") erros.nascimento = "Confira o ano.";
    }
    return { dados, erros };
  }

  /* Ícone: assets/img/jogadores/<id>-<AAAAMMDDhhmmss>.<ext>
     O carimbo de data muda o nome a cada troca, então o navegador não mostra o ícone antigo do cache. */
  const ICONE_VALIDO = /^assets\/img\/jogadores\/[a-z0-9-]+\.(png|webp|jpg)$/;
  function caminhoIcone(id, extensao, agora) {
    const d = agora || new Date();
    const p = n => String(n).padStart(2, "0");
    const carimbo = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
    return `assets/img/jogadores/${id}-${carimbo}.${extensao}`;
  }

  const api = { ICONE_VALIDO, caminhoIcone, semAcento, chaveComparacao, slug, idUnico, distancia, apelidosParecidos, parecidosCom, dataValida, idade, validar };
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.RegrasJogadores = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

/* Painel GLC RR — leitura e gravação pela API de conteúdo do GitHub.
   Cada gravação é um commit direto na main, com o sha atual do arquivo.
   Se outro organizador gravou antes (sha mudou), relê, reaplica e tenta de novo.
   Depende de cripto.js (base64). */
(function (raiz) {
  "use strict";

  const API = "https://api.github.com";
  const DONO = "porifera-byte";
  const REPOS = { publico: "GLCRR", privado: "GLC-privado" };
  const RAMO = "main";
  const utf8 = new TextEncoder();
  const deUtf8 = new TextDecoder();

  class ErroGitHub extends Error {
    constructor(mensagem, status) { super(mensagem); this.status = status; }
  }

  let token = "";
  let autor = "";
  let aoExpirar = () => {};

  function configurar(opcoes) {
    token = opcoes.token || "";
    autor = opcoes.usuario || "";
    if (opcoes.aoExpirar) aoExpirar = opcoes.aoExpirar;
  }

  function mensagemDeErro(status, corpo) {
    if (status === 401) return "A chave do GitHub foi recusada (expirou ou foi revogada). Fale com o organizador principal.";
    if (status === 403 && /rate limit/i.test(corpo)) return "Limite de uso da API do GitHub atingido. Tente de novo em alguns minutos.";
    if (status === 403) return "A chave não tem permissão para esta ação.";
    if (status === 404) return "Arquivo ou repositório não encontrado (ou a chave não dá acesso a ele).";
    if (status === 409 || status === 422) return "O arquivo foi alterado por outra pessoa ao mesmo tempo.";
    return `Erro do GitHub (HTTP ${status}).`;
  }

  async function pedir(metodo, caminho, corpo) {
    let resp;
    try {
      resp = await fetch(API + caminho, {
        method: metodo,
        cache: "no-store",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(corpo ? { "Content-Type": "application/json" } : {})
        },
        body: corpo ? JSON.stringify(corpo) : undefined
      });
    } catch (e) {
      throw new ErroGitHub("Sem conexão com o GitHub. Confira a internet e tente de novo.", 0);
    }
    if (resp.ok) return resp.status === 204 ? null : resp.json();
    const texto = await resp.text().catch(() => "");
    if (resp.status === 401) aoExpirar();
    throw new ErroGitHub(mensagemDeErro(resp.status, texto), resp.status);
  }

  const caminhoConteudo = (repo, arquivo) =>
    `/repos/${DONO}/${REPOS[repo]}/contents/${arquivo.split("/").map(encodeURIComponent).join("/")}`;

  /* Lê um arquivo de texto. Devolve { texto, sha } ou null se não existir. */
  async function lerArquivo(repo, arquivo) {
    let info;
    try {
      info = await pedir("GET", `${caminhoConteudo(repo, arquivo)}?ref=${RAMO}`);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
    let b64 = info.content;
    if (!b64 && info.size > 0) {
      /* Arquivos acima de 1 MB vêm sem conteúdo: busca pelo blob */
      b64 = (await pedir("GET", `/repos/${DONO}/${REPOS[repo]}/git/blobs/${info.sha}`)).content;
    }
    const texto = deUtf8.decode(Cripto.deB64(String(b64 || "").replace(/\s/g, "")));
    return { texto, sha: info.sha };
  }

  /* Lê um JSON. Devolve { dados, sha } (dados = padrao e sha = null se o arquivo não existir). */
  async function lerJSON(repo, arquivo, padrao = []) {
    const arq = await lerArquivo(repo, arquivo);
    if (!arq) return { dados: padrao, sha: null };
    try {
      return { dados: JSON.parse(arq.texto), sha: arq.sha };
    } catch (e) {
      throw new ErroGitHub(`Erro de sintaxe em ${arquivo}: ${e.message}`, 0);
    }
  }

  /* Grava um JSON completo. Valida antes: um erro nunca grava arquivo pela metade. */
  async function gravarJSON(repo, arquivo, dados, sha, mensagem) {
    let texto;
    try {
      texto = JSON.stringify(dados, null, 2) + "\n";
      JSON.parse(texto);
    } catch (e) {
      throw new ErroGitHub(`Dados inválidos para ${arquivo}; nada foi gravado.`, 0);
    }
    const corpo = {
      message: `[painel:${autor}] ${mensagem}`,
      content: Cripto.paraB64(utf8.encode(texto)),
      branch: RAMO
    };
    if (sha) corpo.sha = sha;
    const r = await pedir("PUT", caminhoConteudo(repo, arquivo), corpo);
    return r.content.sha;
  }

  /* Lê, aplica a alteração e grava. Em conflito, relê e reaplica (até 3 vezes).
     alterar(dados) devolve os dados novos; pode lançar erro para cancelar. */
  async function atualizarJSON(repo, arquivo, alterar, mensagem, padrao = []) {
    for (let tentativa = 1; ; tentativa++) {
      const { dados, sha } = await lerJSON(repo, arquivo, padrao);
      const novos = await alterar(structuredClone(dados));
      try {
        return await gravarJSON(repo, arquivo, novos, sha, mensagem);
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && tentativa < 3) continue;
        if (e.status === 409 || e.status === 422) {
          throw new ErroGitHub("Outro organizador está gravando o mesmo arquivo. Recarregue e tente de novo.", e.status);
        }
        throw e;
      }
    }
  }

  /* Confere se a chave lê o conteúdo dos dois repositórios. Devolve a lista de problemas (vazia = ok).
     A permissão de escrita só aparece na primeira gravação: a API não informa o escopo da chave. */
  const ARQUIVO_TESTE = { publico: "data/config.json", privado: "README.md" };
  async function verificarAcesso() {
    const problemas = [];
    for (const repo of Object.keys(REPOS)) {
      try {
        if (!(await lerArquivo(repo, ARQUIVO_TESTE[repo]))) problemas.push(`${REPOS[repo]}: sem acesso ao conteúdo`);
      } catch (e) {
        if (e.status === 401) throw e;
        problemas.push(`${REPOS[repo]}: ${e.message}`);
      }
    }
    return problemas;
  }

  raiz.GitHub = { DONO, REPOS, ErroGitHub, configurar, lerArquivo, lerJSON, gravarJSON, atualizarJSON, verificarAcesso };
})(typeof globalThis !== "undefined" ? globalThis : this);

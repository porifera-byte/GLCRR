/* Testes do montador de decklist com a TCGdex (busca, regras do GLC, importação do TCG Live, conferências).
   Os dados seguem o formato da API v2 da TCGdex (resumo da listagem e detalhe da carta).
   Rodar com: node --test admin/testes/*.test.js */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const R = require("../regras-cartas.js");

const SERIES = [
  { id: "bw", sets: [{ id: "bw1" }, { id: "bw7" }] },
  { id: "sv", sets: [{ id: "sv01" }, { id: "sv06.5" }, { id: "sve" }] },
  { id: "tcgp", sets: [{ id: "A2" }] }];
const COL = R.colecoesDasSeries(SERIES);
const BAN = { cartas: [{ nome: "Lysandre's Trump Card", colecao: "PHF", numero: "99", todas_versoes: true },
  { nome: "Duskull", colecao: "CEC", numero: "83", todas_versoes: false }] };
const IMG = "https://assets.tcgdex.net/en/sv/sv06.5/019";

/* Detalhe em inglês (GET /v2/en/cards/<id>) */
const det = extra => ({ id: "sv06.5-019", localId: "019", name: "Dusclops", category: "Pokemon", image: IMG, types: ["Psychic"],
  stage: "Stage1", rarity: "Common", set: { id: "sv06.5", name: "Shrouded Fable" }, legal: { standard: true, expanded: true }, ...extra });

test("coleções permitidas: séries de Black & White em diante, sem o TCG Pocket", () => {
  assert.deepStrictEqual(Object.keys(COL), ["bw1", "bw7", "sv01", "sv06.5", "sve"]);
  assert.deepStrictEqual(COL["sv06.5"], { ordem: 4, serie: "sv" });
  assert.deepStrictEqual(R.colecoesDasSeries([null, { id: "xy", sets: [{ id: "../x" }] }]), {});
});

test("palavras da busca em português e em inglês", () => {
  assert.deepStrictEqual(R.palavrasBusca("Ultra Bola"), { pt: ["ultra", "bola"], en: ["ultra", "ball"] });
  assert.deepStrictEqual(R.palavrasBusca("Ordens do Chefe"), { pt: ["ordens", "chefe"], en: ["orders", "boss"] });
  assert.deepStrictEqual(R.palavrasBusca("Boss’s Orders"), { pt: ["boss's", "orders"], en: ["boss's", "orders"] });
  assert.deepStrictEqual(R.palavrasBusca("energia psíquica"), { pt: ["energia", "psíquica"], en: ["energy", "psychic"] });
  assert.deepStrictEqual(R.palavrasBusca("  "), { pt: [], en: [] });
  assert.deepStrictEqual(R.palavrasBusca("de").pt, ["de"]);
});

test("consultas da busca na TCGdex", () => {
  const u = R.urlsBusca("ultra bola", "Treinador");
  const pt = new URL(u.pt), en = new URL(u.en);
  assert.strictEqual(pt.origin + pt.pathname, "https://api.tcgdex.net/v2/pt/cards");
  assert.strictEqual(en.pathname, "/v2/en/cards");
  assert.deepStrictEqual(pt.searchParams.getAll("name"), ["ultra", "bola"]);
  assert.deepStrictEqual(en.searchParams.getAll("name"), ["ultra", "ball"]);
  assert.strictEqual(en.searchParams.get("suffix"), "null:");
  assert.strictEqual(pt.searchParams.get("category"), "Treinador");
  assert.strictEqual(en.searchParams.get("category"), "Trainer");
  assert.strictEqual(new URL(R.urlsBusca("dusclops", "").en).searchParams.has("category"), false);
  assert.strictEqual(R.urlsBusca("", ""), null);
  /* Sintaxe dos filtros da TCGdex não passa pelo termo */
  assert.deepStrictEqual(new URL(R.urlsBusca("eq:Pikachu|x&a=b", "").en).searchParams.getAll("name"), ["eq", "pikachu"]);
});

test("junta português e inglês, filtra pelo GLC e ordena", () => {
  const en = [
    { id: "sv06.5-019", localId: "019", name: "Dusclops", image: IMG },
    { id: "sv01-196", localId: "196", name: "Ultra Ball", image: "https://assets.tcgdex.net/en/sv/sv01/196" },
    { id: "bw7-62", localId: "62", name: "Dusclops", image: "https://assets.tcgdex.net/en/bw/bw7/62" },
    { id: "A2-071", localId: "071", name: "Dusclops", image: "https://assets.tcgdex.net/en/tcgp/A2/071" },
    { id: "ex8-7", localId: "7", name: "Dusclops" },
    { id: "swsh10-63", localId: "63", name: "Dusknoir VSTAR" }];
  const pt = [
    { id: "sv01-196", localId: "196", name: "Ultra Bola", image: "https://assets.tcgdex.net/pt/sv/sv01/196" },
    { id: "sv06.5-019", localId: "019", name: "Dusclops" }];
  const r = R.juntarResultados(pt, en, COL);
  assert.deepStrictEqual(r.map(x => x.id), ["sv06.5-019", "sv01-196", "bw7-62"]);
  assert.deepStrictEqual(r[1], { id: "sv01-196", localId: "196", nome: "Ultra Bola", nome_en: "Ultra Ball",
    img: "https://assets.tcgdex.net/pt/sv/sv01/196/low.webp" });
  /* Sem imagem em português, usa a de inglês */
  assert.strictEqual(r[0].img, `${IMG}/low.webp`);
  /* Só em português (sem o resumo em inglês): imagem montada pela série */
  const so = R.juntarResultados([{ id: "bw7-62", localId: "62", name: "Dusclops" }], [], COL);
  /* Sem imagem informada pela TCGdex, não inventa endereço */
  assert.deepStrictEqual(so, [{ id: "bw7-62", localId: "62", nome: "Dusclops", nome_en: "", img: "" }]);
  assert.deepStrictEqual(R.juntarResultados(null, "x", COL), []);
});

test("regras do GLC no detalhe da carta", () => {
  assert.strictEqual(R.motivoIlegal(det(), COL, BAN), "");
  assert.strictEqual(R.motivoIlegal(det({ id: "ex8-7", set: { id: "ex8" } }), COL, BAN), "anterior a Black & White");
  assert.strictEqual(R.motivoIlegal(det({ name: "Mew ex", suffix: "ex" }), COL, BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(det({ name: "Dusknoir VSTAR", stage: "VSTAR" }), COL, BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(det({ name: "Gengar BREAK", stage: "BREAK" }), COL, BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(det({ name: "Radiant Greninja", rarity: "Radiant Rare" }), COL, BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(det({ name: "Super Boost Energy ◇", category: "Energy", rarity: "Prism Star" }), COL, BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(det({ name: "Computer Search", category: "Trainer", trainerType: "Ace Spec", stage: undefined }), COL, BAN), "ACE SPEC");
  assert.strictEqual(R.motivoIlegal(det({ name: "Prime Catcher", category: "Trainer", trainerType: "Item", rarity: "ACE SPEC Rare" }), COL, BAN), "ACE SPEC");
  assert.strictEqual(R.motivoIlegal(det({ name: "Lysandre’s Trump Card", category: "Trainer", trainerType: "Item" }), COL, BAN, "XYZ"), "banlist do GLC");
  /* Pokémon banido vale só para a impressão listada */
  assert.strictEqual(R.motivoIlegal(det({ id: "sv01-083", localId: "083", name: "Duskull", set: { id: "sv01" } }), COL, BAN, "CEC"), "banlist do GLC");
  assert.strictEqual(R.motivoIlegal(det({ name: "Duskull", localId: "035" }), COL, BAN, "PRE"), "");
  assert.strictEqual(R.motivoIlegal(null, COL, BAN), "carta não encontrada");
});

test("detalhe vira registro da decklist", () => {
  assert.deepStrictEqual(R.cartaDoDetalhe(det(), "SFA", COL), { qtd: 1, id: "sv06.5-019", nome: "Dusclops", colecao: "SFA",
    numero: "19", categoria: "Pokémon", img: `${IMG}/low.webp`, tipos: ["Psychic"] });
  const energia = R.cartaDoDetalhe(det({ id: "sve-005", localId: "005", name: "Basic Psychic Energy", category: "Energy",
    energyType: "Normal", types: undefined, image: undefined, set: { id: "sve" } }), "sve", COL);
  /* Sem imagem informada, fica sem imagem (o site mostra o nome) */
  assert.deepStrictEqual(energia, { qtd: 1, id: "sve-005", nome: "Basic Psychic Energy", colecao: "SVE", numero: "5",
    categoria: "Energia", basica: true });
  /* Sem imagem em inglês, usa a do português */
  assert.strictEqual(R.cartaDoDetalhe(det({ image: undefined, imagem_pt: "https://assets.tcgdex.net/pt/sv/sv06.5/019" }), "SFA").img,
    "https://assets.tcgdex.net/pt/sv/sv06.5/019/low.webp");
  assert.strictEqual(R.cartaDoDetalhe(det({ category: "Trainer", localId: "TG05", image: "javascript:x" }), "SFA", {}).numero, "TG05");
  assert.strictEqual(R.cartaDoDetalhe(det({ image: "javascript:x" }), "SFA", {}).img, undefined);
});

test("resumo do detalhe para o cache", () => {
  const r = R.resumirDetalhe({ ...det(), attacks: [{ name: "x" }], illustrator: "y", pricing: {} });
  assert.deepStrictEqual(Object.keys(r).sort(), ["category", "id", "image", "localId", "name", "rarity", "set", "stage", "types"]);
  assert.strictEqual(R.resumirDetalhe({ ...det(), imagem_pt: "x" }).imagem_pt, "x");
  assert.strictEqual(R.resumirDetalhe({ id: "../x" }), null);
  assert.strictEqual(R.resumirDetalhe(null), null);
});

test("energia básica pelo nome", () => {
  assert.strictEqual(R.energiaBasica("Basic {P} Energy"), "Psychic Energy");
  assert.strictEqual(R.energiaBasica("{D} Energy"), "Darkness Energy");
  assert.strictEqual(R.energiaBasica("Basic Psychic Energy"), "Psychic Energy");
  assert.strictEqual(R.energiaBasica("Double Turbo Energy"), "");
});

const TEXTO = `Pokémon: 3
1 Duskull SFA 18
1 Dusclops SFA 19
1 Dusknoir SFA 20

Trainer: 2
1 Professor's Research SVI 189
1 Boss’s Orders PAL 172

Energy: 1
14 Basic {P} Energy SVE 5
coisa estranha
Total Cards: 19`;

test("lê o texto exportado do TCG Live", () => {
  const { linhas, erros } = R.lerTextoLive(TEXTO);
  assert.strictEqual(linhas.length, 6);
  assert.deepStrictEqual(linhas[0], { qtd: 1, nome: "Duskull", colecao: "SFA", numero: "18", categoria: "Pokémon" });
  assert.deepStrictEqual(linhas[5], { qtd: 14, nome: "Psychic Energy", colecao: "SVE", numero: "5", categoria: "Energia", basica: true });
  assert.deepStrictEqual(erros, ['Linha 12: não entendi "coisa estranha".']);
  const antigo = R.lerTextoLive("* 1 Duskull CES 62\n* 2 Ultra Ball\n## Pokémon - 1");
  assert.deepStrictEqual(antigo.linhas.map(l => [l.qtd, l.nome, l.colecao, l.numero]), [[1, "Duskull", "CES", "62"], [2, "Ultra Ball", "", ""]]);
  assert.deepStrictEqual(antigo.erros, []);
});

test("importação: coleção pela sigla, carta pelo número", () => {
  const u = new URL(R.urlColecaoPorSigla("sfa"));
  assert.strictEqual(u.pathname, "/v2/en/sets");
  assert.strictEqual(u.searchParams.get("abbreviation.official"), "eq:SFA");
  const sfa = { id: "sv06.5", cards: [{ id: "sv06.5-018", localId: "018" }, { id: "sv06.5-019", localId: "019" }] };
  assert.strictEqual(R.acharNaColecao(sfa, "19").id, "sv06.5-019");
  assert.strictEqual(R.acharNaColecao(sfa, "019").id, "sv06.5-019");
  assert.strictEqual(R.acharNaColecao(sfa, "99"), null);
  const { linhas } = R.lerTextoLive(TEXTO);
  const achadas = R.idsDasLinhas(linhas, { SFA: sfa, SVE: { id: "sve", cards: [{ id: "sve-005", localId: "005" }] } });
  assert.deepStrictEqual(achadas.map(a => a.id), ["sv06.5-018", "sv06.5-019", "", "", "", "sve-005"]);
  const detalhes = {
    "sv06.5-018": det({ id: "sv06.5-018", localId: "018", name: "Duskull", image: "https://assets.tcgdex.net/en/sv/sv06.5/018" }),
    "sv06.5-019": det(),
    "sve-005": det({ id: "sve-005", localId: "005", name: "Basic Psychic Energy", category: "Energy", energyType: "Normal", set: { id: "sve" } })
  };
  const { cartas, avisos } = R.resolverImportacao(achadas, detalhes, COL, BAN);
  assert.strictEqual(cartas.length, 6);
  assert.strictEqual(cartas[1].id, "sv06.5-019");
  assert.deepStrictEqual(cartas[2], { qtd: 1, nome: "Dusknoir", colecao: "SFA", numero: "20", categoria: "Pokémon" });
  assert.deepStrictEqual([cartas[5].qtd, cartas[5].nome, cartas[5].basica], [14, "Basic Psychic Energy", true]);
  assert.strictEqual(avisos.length, 3);
  assert.ok(avisos[0].startsWith("Dusknoir (SFA 20): não encontrada"));
  /* Carta achada mas fora do GLC gera aviso (o que as conferências já mostram pelo nome, não) */
  const v = R.resolverImportacao([{ linha: { qtd: 1, nome: "Computer Search", colecao: "BCR", numero: "137" }, id: "bw7-137" }],
    { "bw7-137": det({ id: "bw7-137", localId: "137", name: "Computer Search", category: "Trainer", trainerType: "Ace Spec", set: { id: "bw7" } }) }, COL, BAN);
  assert.deepStrictEqual(v.avisos, ["Computer Search (BCR 137): ACE SPEC."]);
});

test("cartas de listas antigas que precisam de conversão", () => {
  assert.strictEqual(R.precisaConverter({ nome: "Dusclops", colecao: "SFA", numero: "19", img: "https://images.pokemontcg.io/sv6pt5/19.png" }), true);
  assert.strictEqual(R.precisaConverter({ nome: "Dusclops", colecao: "SFA", numero: "19" }), true);
  assert.strictEqual(R.precisaConverter({ nome: "Dusclops", colecao: "SFA", numero: "19", img: `${IMG}/low.webp` }), false);
  assert.strictEqual(R.precisaConverter({ nome: "Ultra Ball", colecao: "", numero: "" }), false);
});

test("singleton e tipo do deck ao incluir", () => {
  const lista = [{ qtd: 1, nome: "Dusclops", categoria: "Pokémon", tipos: ["Psychic"] },
    { qtd: 10, nome: "Psychic Energy", categoria: "Energia", basica: true }];
  assert.ok(R.impedimento(lista, { qtd: 1, nome: "Dusclops", categoria: "Pokémon", tipos: ["Psychic"], id: "bw7-62" }, "Psíquico").startsWith("Dusclops já está na lista"));
  assert.strictEqual(R.impedimento(lista, { qtd: 1, nome: "Psychic Energy", categoria: "Energia", basica: true }, "Psíquico"), "");
  assert.strictEqual(R.impedimento(lista, { qtd: 1, nome: "Pikachu", categoria: "Pokémon", tipos: ["Lightning"] }, "Psíquico"),
    "Pikachu não é do tipo Psíquico, o tipo do deck.");
  assert.strictEqual(R.impedimento(lista, { qtd: 1, nome: "Dragapult", categoria: "Pokémon", tipos: ["Dragon", "Psychic"] }, "Psíquico"), "");
  assert.strictEqual(R.impedimento(lista, { qtd: 1, nome: "Pikachu", categoria: "Pokémon", tipos: ["Lightning"] }, ""), "");
});

test("somar junta a mesma carta", () => {
  const lista = [];
  R.somar(lista, R.cartaDoDetalhe(det(), "SFA", COL));
  R.somar(lista, R.cartaDoDetalhe(det(), "SFA", COL));
  R.somar(lista, { qtd: 3, nome: "Psychic Energy", colecao: "SVE", numero: "5", categoria: "Energia", basica: true });
  assert.strictEqual(lista.length, 2);
  assert.strictEqual(lista[0].qtd, 2);
  assert.strictEqual(R.total(lista), 5);
});

test("conferências do GLC", () => {
  const cartas = [
    { qtd: 2, nome: "Dusclops", categoria: "Pokémon", tipos: ["Psychic"] },
    { qtd: 1, nome: "Mew ex", categoria: "Pokémon", tipos: ["Psychic"] },
    { qtd: 1, nome: "Pikachu", categoria: "Pokémon", tipos: ["Lightning"] },
    { qtd: 1, nome: "Lysandre's Trump Card", categoria: "Treinador" },
    { qtd: 1, nome: "Duskull", colecao: "CEC", numero: "083", categoria: "Pokémon", tipos: ["Psychic"] },
    { qtd: 1, nome: "Duskull", colecao: "PRE", numero: "35", categoria: "Pokémon", tipos: ["Psychic"] },
    { qtd: 30, nome: "Psychic Energy", categoria: "Energia", basica: true }];
  assert.deepStrictEqual(R.conferirLista(cartas, "Psíquico", BAN), [
    "A lista tem 37 cartas (o GLC usa 60).",
    "Dusclops: 2 cópias (o GLC permite 1 de cada, exceto Energia Básica).",
    "Duskull: 2 cópias (o GLC permite 1 de cada, exceto Energia Básica).",
    "Mew ex: parece ter Rule Box.",
    "Lysandre's Trump Card: está na banlist do GLC.",
    "Duskull: está na banlist do GLC.",
    "Pikachu: não é do tipo Psíquico."]);
  assert.ok(R.conferirLista(cartas, "", BAN).includes("Os Pokémon da lista não têm um tipo em comum (o GLC usa um tipo só)."));
  const ok = [{ qtd: 1, nome: "Dragapult", categoria: "Pokémon", tipos: ["Dragon", "Psychic"] }, { qtd: 59, nome: "Psychic Energy", categoria: "Energia", basica: true }];
  assert.deepStrictEqual(R.conferirLista(ok, "Psíquico", BAN), []);
});

test("sanitiza a lista antes de gravar", () => {
  const limpa = R.sanitizarCartas([
    { qtd: 14, nome: " Psychic   Energy ", colecao: "SVE", numero: "5", categoria: "Energia", basica: true, extra: "x" },
    { qtd: "1", nome: "Dusclops", colecao: "SFA<b>", numero: "19", categoria: "Pokémon", id: "sv06.5-019", img: `${IMG}/low.webp`, tipos: ["Psychic", "<script>"] },
    { qtd: 1, nome: "Iono", categoria: "Outra", img: "https://evil.com/x.png", id: "../x" },
    { qtd: 1, nome: "Antiga", categoria: "Treinador", img: "https://images.pokemontcg.io/sv1/1.png", id: "sv1-1" },
    { qtd: 0, nome: "Zero" }, { qtd: 1, nome: "" }, null]);
  assert.deepStrictEqual(limpa, [
    { qtd: 1, nome: "Dusclops", colecao: "SFAb", numero: "19", categoria: "Pokémon", id: "sv06.5-019", img: `${IMG}/low.webp`, tipos: ["Psychic"] },
    { qtd: 1, nome: "Iono", colecao: "", numero: "", categoria: "Treinador" },
    { qtd: 1, nome: "Antiga", colecao: "", numero: "", categoria: "Treinador", id: "sv1-1", img: "https://images.pokemontcg.io/sv1/1.png" },
    { qtd: 14, nome: "Psychic Energy", colecao: "SVE", numero: "5", categoria: "Energia", basica: true }]);
  assert.deepStrictEqual(R.sanitizarCartas("x"), []);
});

test("imagem de carta aceita", () => {
  ["https://assets.tcgdex.net/en/sv/sv06.5/019/low.webp", "https://assets.tcgdex.net/pt/swsh/swsh12.5/GG35/low.webp",
    "https://images.pokemontcg.io/sv6pt5/19.png"].forEach(u => assert.ok(R.CARTA_IMG_VALIDA.test(u), u));
  ["https://assets.tcgdex.net/en/sv/sv06.5/019", "https://assets.tcgdex.net/en/sv/sv06.5/019/high.png",
    "https://assets.tcgdex.net/fr/sv/sv06.5/019/low.webp", "https://assets.tcgdex.net.evil.com/en/sv/sv1/1/low.webp",
    "https://assets.tcgdex.net/en/sv/../019/low.webp", "javascript:alert(1)//low.webp"].forEach(u => assert.ok(!R.CARTA_IMG_VALIDA.test(u), u));
});

test("listas anteriores do mesmo jogador", () => {
  const eventos = [{ id: "e1", nome: "1º Torneio", data: "2026-05-31" }, { id: "e3", nome: "3º Torneio", data: "2026-08-30" },
    { id: "e5", nome: "5º Torneio", data: "2026-10-31" }];
  const lista = [{ qtd: 60, nome: "Psychic Energy", categoria: "Energia", basica: true }];
  const decklists = [
    { evento_id: "e1", jogador_id: "rosso", posicao: 1, cartas: lista },
    { evento_id: "e3", jogador_id: "rosso", posicao: 3, cartas: lista },
    { evento_id: "e5", jogador_id: "rosso", posicao: 2, cartas: lista },
    { evento_id: "e3", jogador_id: "saymon", posicao: 2, cartas: lista }];
  const r = R.listasAnteriores(decklists, eventos, "rosso", "e5");
  assert.deepStrictEqual(r.map(x => x.evento_id), ["e3", "e1"]);
  r[0].cartas[0].qtd = 1;
  assert.strictEqual(decklists[1].cartas[0].qtd, 60);
});

test("carta pelo nome exato e pelo número (sigla que não bate)", () => {
  assert.strictEqual(new URL(R.urlNomeExato("Iono")).searchParams.get("name"), "eq:Iono");
  assert.strictEqual(new URL(R.urlNomeExato("a|b,c")).searchParams.get("name"), "eq:a b c");
  const resumos = [{ id: "sv02-185", localId: "185", name: "Iono" }, { id: "sv04.5-080", localId: "080", name: "Iono" },
    { id: "A2-080", localId: "080", name: "Iono" }, { id: "sv01-080", localId: "080", name: "Iono" }];
  assert.strictEqual(R.escolherPorNumero(resumos, "80", COL).id, "sv01-080");
  assert.strictEqual(R.escolherPorNumero(resumos, "999", COL), null);
  assert.strictEqual(R.escolherPorNumero(null, "80", COL), null);
});

test("banlist: todas as versões ou só a impressão", () => {
  assert.ok(R.banida({ nome: "Lysandre's Trump Card", colecao: "PHF", numero: "118" }, BAN));
  assert.ok(R.banida({ nome: "Duskull", colecao: "cec", numero: "083" }, BAN));
  assert.ok(!R.banida({ nome: "Duskull", colecao: "PRE", numero: "35" }, BAN));
  assert.ok(!R.banida({ nome: "Iono" }, BAN));
  assert.ok(!R.banida({ nome: "Duskull" }, null));
});

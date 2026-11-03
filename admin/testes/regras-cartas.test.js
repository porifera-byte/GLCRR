/* Testes do montador de decklist (busca, legalidade GLC, importação do TCG Live, conferências).
   Rodar com: node --test admin/testes/*.test.js */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const R = require("../regras-cartas.js");

/* Cartas no formato da API pokemontcg.io v2 (dados reduzidos) */
const api = (extra) => ({ id: "sv6pt5-19", name: "Dusclops", supertype: "Pokémon", subtypes: ["Stage 1"], types: ["Psychic"],
  number: "19", set: { id: "sv6pt5", name: "Shrouded Fable", ptcgoCode: "SFA" },
  images: { small: "https://images.pokemontcg.io/sv6pt5/19.png" }, legalities: { unlimited: "Legal", expanded: "Legal" }, ...extra });
const BAN = { cartas: [{ nome: "Lysandre's Trump Card", colecao: "PHF", numero: "99" }] };

test("consulta de busca", () => {
  const q = R.montarConsulta("  Dusk  ", "");
  assert.ok(q.startsWith("name:dusk* legalities.expanded:legal "));
  assert.ok(q.includes('-subtypes:"ACE SPEC"'));
  assert.ok(R.montarConsulta("Professor's Research", "Treinador").startsWith("name:professor* name:research* "));
  assert.ok(R.montarConsulta("pikachu", "Treinador").endsWith(" supertype:trainer"));
  assert.ok(R.montarConsulta("pikachu", "Pokémon").endsWith(" -supertype:trainer -supertype:energy"));
  assert.ok(R.montarConsulta("x", "Energia").endsWith(" supertype:energy"));
  /* Caracteres da sintaxe Lucene não passam */
  assert.strictEqual(R.montarConsulta('a") OR (b:*', ""), R.montarConsulta("a OR b", ""));
  assert.strictEqual(R.montarConsulta("  ", ""), "");
  assert.strictEqual(R.urlBusca("", ""), "");
  const u = new URL(R.urlBusca("dusclops", "", 2));
  assert.strictEqual(u.origin, "https://api.pokemontcg.io");
  assert.strictEqual(u.searchParams.get("page"), "2");
  assert.strictEqual(u.searchParams.get("pageSize"), String(R.POR_PAGINA));
  assert.strictEqual(u.searchParams.get("orderBy"), "-set.releaseDate");
});

test("legalidade no GLC", () => {
  assert.strictEqual(R.motivoIlegal(api(), BAN), "");
  assert.strictEqual(R.motivoIlegal(api({ name: "Dusknoir V", subtypes: ["Basic", "V"] }), BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(api({ name: "Mew ex", subtypes: ["Basic", "ex"] }), BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(api({ name: "Radiant Greninja", subtypes: ["Basic", "Radiant"] }), BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(api({ name: "Giratina ◇", subtypes: ["Basic"] }), BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(api({ name: "Super Boost Energy ◇", supertype: "Energy", subtypes: ["Special"],
    rules: ["Prism Star Rule: You can't have more than 1 ◇ card with the same name in your deck."] }), BAN), "Rule Box");
  assert.strictEqual(R.motivoIlegal(api({ name: "Prime Catcher", supertype: "Trainer", subtypes: ["Item", "ACE SPEC"] }), BAN), "ACE SPEC");
  assert.strictEqual(R.motivoIlegal(api({ name: "Dusclops", legalities: { unlimited: "Legal" } }), BAN), "fora do Expanded");
  assert.strictEqual(R.motivoIlegal(api({ name: "Lysandre’s Trump Card", supertype: "Trainer", subtypes: ["Item"] }), BAN), "banlist do GLC");
  /* Regras de Treinador comuns não são Rule Box */
  assert.strictEqual(R.motivoIlegal(api({ name: "Iono", supertype: "Trainer", subtypes: ["Supporter"],
    rules: ["You may play only 1 Supporter card during your turn."] }), BAN), "");
});

test("carta da API vira registro da decklist", () => {
  assert.deepStrictEqual(R.cartaDaApi(api()), { qtd: 1, nome: "Dusclops", colecao: "SFA", numero: "19", categoria: "Pokémon",
    id: "sv6pt5-19", img: "https://images.pokemontcg.io/sv6pt5/19.png", tipos: ["Psychic"] });
  const energia = R.cartaDaApi(api({ id: "sve-5", name: "Basic Psychic Energy", supertype: "Energy", subtypes: ["Basic"], types: undefined,
    number: "5", set: { id: "sve", ptcgoCode: "SVE" }, images: { small: "javascript:alert(1)" } }));
  assert.deepStrictEqual(energia, { qtd: 1, nome: "Basic Psychic Energy", colecao: "SVE", numero: "5", categoria: "Energia", id: "sve-5", basica: true });
  /* Sem ptcgoCode, usa o id da coleção */
  assert.strictEqual(R.cartaDaApi(api({ set: { id: "bwp" } })).colecao, "BWP");
  assert.strictEqual(R.cartaDaApi(api({ supertype: "Trainer" })).categoria, "Treinador");
});

test("energia básica pelo nome", () => {
  assert.strictEqual(R.energiaBasica("Basic {P} Energy"), "Psychic Energy");
  assert.strictEqual(R.energiaBasica("{D} Energy"), "Darkness Energy");
  assert.strictEqual(R.energiaBasica("Basic Psychic Energy"), "Psychic Energy");
  assert.strictEqual(R.energiaBasica("water energy"), "Water Energy");
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
  assert.deepStrictEqual(linhas[3], { qtd: 1, nome: "Professor's Research", colecao: "SVI", numero: "189", categoria: "Treinador" });
  assert.deepStrictEqual(linhas[5], { qtd: 14, nome: "Psychic Energy", colecao: "SVE", numero: "5", categoria: "Energia", basica: true });
  assert.deepStrictEqual(erros, ['Linha 12: não entendi "coisa estranha".']);
  /* Formato antigo do PTCGO, com asterisco, e linha sem coleção */
  const antigo = R.lerTextoLive("* 1 Duskull CES 62\n* 2 Ultra Ball\n## Pokémon - 1");
  assert.deepStrictEqual(antigo.linhas.map(l => [l.qtd, l.nome, l.colecao, l.numero]), [[1, "Duskull", "CES", "62"], [2, "Ultra Ball", "", ""]]);
  assert.deepStrictEqual(antigo.erros, []);
  assert.deepStrictEqual(R.lerTextoLive(""), { linhas: [], erros: [] });
});

test("consultas de importação em lotes", () => {
  const { linhas } = R.lerTextoLive(TEXTO);
  const urls = R.consultasImportacao(linhas);
  assert.strictEqual(urls.length, 1);
  const q = new URL(urls[0]).searchParams.get("q");
  assert.ok(q.startsWith('(set.ptcgoCode:"SFA" number:"18") OR (set.ptcgoCode:"SFA" number:"19")'));
  const muitas = Array.from({ length: 20 }, (_, i) => ({ qtd: 1, nome: "X", colecao: "SVI", numero: String(i + 1) }));
  assert.strictEqual(R.consultasImportacao(muitas).length, 2);
  assert.deepStrictEqual(R.consultasImportacao([{ qtd: 1, nome: "Ultra Ball", colecao: "", numero: "" }]), []);
});

test("resolve a importação com as cartas da API", () => {
  const { linhas } = R.lerTextoLive(TEXTO);
  const achadas = [api({ id: "sv6pt5-18", name: "Duskull", number: "18", images: { small: "https://images.pokemontcg.io/sv6pt5/18.png" } }),
    api(), api({ id: "sv1-189", name: "Professor's Research", supertype: "Trainer", subtypes: ["Supporter"], number: "189",
      set: { id: "sv1", ptcgoCode: "SVI" }, images: { small: "https://images.pokemontcg.io/sv1/189.png" } })];
  const { cartas, avisos } = R.resolverImportacao(linhas, achadas, BAN);
  assert.strictEqual(cartas.length, 6);
  assert.strictEqual(cartas[0].img, "https://images.pokemontcg.io/sv6pt5/18.png");
  assert.strictEqual(cartas[3].id, "sv1-189");
  /* Dusknoir e Boss's Orders não vieram da API: entram só com o texto; a energia básica não gera aviso */
  assert.deepStrictEqual(cartas[2], { qtd: 1, nome: "Dusknoir", colecao: "SFA", numero: "20", categoria: "Pokémon" });
  assert.deepStrictEqual(cartas[5], { qtd: 14, nome: "Psychic Energy", colecao: "SVE", numero: "5", categoria: "Energia", basica: true });
  assert.strictEqual(avisos.length, 2);
  assert.ok(avisos[0].startsWith("Dusknoir (SFA 20): não encontrada"));
  /* Carta ilegal achada na API gera aviso, exceto o que as conferências já mostram pelo nome */
  const v = R.resolverImportacao([{ qtd: 1, nome: "Prime Catcher", colecao: "TEF", numero: "157" }, { qtd: 1, nome: "Mew ex", colecao: "MEW", numero: "151" }],
    [api({ name: "Prime Catcher", supertype: "Trainer", subtypes: ["Item", "ACE SPEC"], number: "157", set: { id: "sv5", ptcgoCode: "TEF" } }),
      api({ name: "Mew ex", subtypes: ["Basic", "ex"], number: "151", set: { id: "sv3pt5", ptcgoCode: "MEW" } })], BAN);
  assert.deepStrictEqual(v.avisos, ["Prime Catcher (TEF 157): ACE SPEC."]);
  /* Número com zero à esquerda no texto */
  const z = R.resolverImportacao([{ qtd: 1, nome: "Dusclops", colecao: "SFA", numero: "019" }], [api()], BAN);
  assert.strictEqual(z.cartas[0].id, "sv6pt5-19");
});

test("somar junta a mesma carta", () => {
  const lista = [];
  R.somar(lista, R.cartaDaApi(api()));
  R.somar(lista, R.cartaDaApi(api()));
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
    { qtd: 30, nome: "Psychic Energy", categoria: "Energia", basica: true }];
  const a = R.conferirLista(cartas, "Psíquico", BAN);
  assert.deepStrictEqual(a, [
    "A lista tem 35 cartas (o GLC usa 60).",
    "Dusclops: 2 cópias (o GLC permite 1 de cada, exceto Energia Básica).",
    "Mew ex: parece ter Rule Box.",
    "Lysandre's Trump Card: está na banlist do GLC.",
    "Pikachu: não é do tipo Psíquico."]);
  /* Sem tipo do deck: confere se há um tipo em comum */
  assert.ok(R.conferirLista(cartas, "", BAN).includes("Os Pokémon da lista não têm um tipo em comum (o GLC usa um tipo só)."));
  /* Pokémon de dois tipos vale se um deles é o do deck */
  const ok = [{ qtd: 1, nome: "Dragapult", categoria: "Pokémon", tipos: ["Dragon", "Psychic"] }, { qtd: 59, nome: "Psychic Energy", categoria: "Energia", basica: true }];
  assert.deepStrictEqual(R.conferirLista(ok, "Psíquico", BAN), []);
});

test("sanitiza a lista antes de gravar", () => {
  const limpa = R.sanitizarCartas([
    { qtd: 14, nome: " Psychic   Energy ", colecao: "SVE", numero: "5", categoria: "Energia", basica: true, extra: "x" },
    { qtd: "1", nome: "Dusclops", colecao: "SFA<b>", numero: "19", categoria: "Pokémon", id: "sv6pt5-19",
      img: "https://images.pokemontcg.io/sv6pt5/19.png", tipos: ["Psychic", "<script>"] },
    { qtd: 1, nome: "Iono", categoria: "Outra", img: "https://evil.com/x.png", id: "../x" },
    { qtd: 0, nome: "Zero" }, { qtd: 1, nome: "" }, null]);
  assert.deepStrictEqual(limpa, [
    { qtd: 1, nome: "Dusclops", colecao: "SFAb", numero: "19", categoria: "Pokémon", id: "sv6pt5-19",
      img: "https://images.pokemontcg.io/sv6pt5/19.png", tipos: ["Psychic"] },
    { qtd: 1, nome: "Iono", colecao: "", numero: "", categoria: "Treinador" },
    { qtd: 14, nome: "Psychic Energy", colecao: "SVE", numero: "5", categoria: "Energia", basica: true }]);
  assert.deepStrictEqual(R.sanitizarCartas("x"), []);
});

test("imagem de carta aceita", () => {
  assert.ok(R.CARTA_IMG_VALIDA.test("https://images.pokemontcg.io/swsh12pt5/63.png"));
  assert.ok(R.CARTA_IMG_VALIDA.test("https://images.pokemontcg.io/swsh12pt5gg/GG35.png"));
  ["http://images.pokemontcg.io/sv1/1.png", "https://images.pokemontcg.io.evil.com/sv1/1.png", "https://images.pokemontcg.io/sv1/1.png?x",
    "https://images.pokemontcg.io/../1.png", "javascript:alert(1)//.png"].forEach(u => assert.ok(!R.CARTA_IMG_VALIDA.test(u), u));
});

/* Garante que todo script e estilo local das páginas leva a mesma versão (?v=).
   Sem isso, o navegador pode juntar um arquivo novo com outro antigo do cache e a página quebra.
   Ao mudar qualquer .js ou .css, troque a versão nas 3 páginas (mesmo valor). */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "..");
const PAGINAS = ["index.html", "admin/index.html", "admin/gerar-acesso.html"];

test("scripts e estilos locais com a mesma versão", () => {
  const versoes = new Set();
  PAGINAS.forEach(pagina => {
    const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
    const refs = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map(m => m[1])
      .filter(u => !/^https?:/.test(u));
    assert.ok(refs.length, `${pagina}: nenhuma referência local`);
    refs.forEach(u => {
      const m = u.match(/\?v=([\w.-]+)$/);
      assert.ok(m, `${pagina}: ${u} sem ?v=`);
      versoes.add(m[1]);
      assert.ok(fs.existsSync(path.join(RAIZ, path.dirname(pagina), u.split("?")[0])), `${pagina}: ${u} não existe`);
    });
  });
  assert.strictEqual(versoes.size, 1, `versões diferentes: ${[...versoes].join(", ")}`);
});

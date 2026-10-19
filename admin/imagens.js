/* Painel GLC RR — preparo de imagens no navegador, antes de enviar ao GitHub.
   Toda imagem é redesenhada num canvas e regravada: isso reduz o tamanho e apaga dados ocultos (GPS, câmera, data). */
(function (raiz) {
  "use strict";

  const MAX_ENTRADA = 15 * 1024 * 1024;   // arquivo escolhido: até 15 MB

  /* opcoes:
       quadrado: true  → recorta o centro em quadrado de "lado" px (ícones)
       maxLado: n      → mantém a proporção, maior lado com no máximo n px (decklists)
       minimo: n       → menor lado aceito, em px
       formatos: ["webp", "png"] ou ["jpeg"] → tenta na ordem; JPEG ganha fundo branco
     Devolve { bytes, extensao, url, largura, altura } */
  async function preparar(arquivo, opcoes) {
    const o = Object.assign({ quadrado: false, lado: 256, maxLado: 1600, minimo: 64, formatos: ["webp", "png"], qualidade: 0.85 }, opcoes);
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw new Error("Use uma imagem PNG, JPEG ou WEBP.");
    if (arquivo.size > MAX_ENTRADA) throw new Error("Imagem grande demais (máximo 15 MB).");
    const urlOrigem = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.src = urlOrigem;
      await img.decode().catch(() => { throw new Error("Não foi possível abrir esta imagem."); });
      const w = img.naturalWidth, h = img.naturalHeight;
      if (Math.min(w, h) < o.minimo) throw new Error(`Imagem pequena demais (mínimo ${o.minimo} px).`);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      let origem;
      if (o.quadrado) {
        const lado = Math.min(w, h);
        canvas.width = canvas.height = o.lado;
        origem = [(w - lado) / 2, (h - lado) / 2, lado, lado];
      } else {
        const escala = Math.min(1, o.maxLado / Math.max(w, h));
        canvas.width = Math.round(w * escala);
        canvas.height = Math.round(h * escala);
        origem = [0, 0, w, h];
      }
      if (o.formatos[0] === "jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, ...origem, 0, 0, canvas.width, canvas.height);
      const comoBlob = tipo => new Promise(ok => canvas.toBlob(ok, `image/${tipo}`, o.qualidade));
      let blob = null;
      for (const formato of o.formatos) {
        blob = await comoBlob(formato);
        if (blob && blob.type === `image/${formato}`) break;   // Safari antigo não gera WEBP
        blob = null;
      }
      if (!blob) blob = await comoBlob("png");
      if (!blob) throw new Error("Não foi possível converter a imagem.");
      const extensao = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[blob.type] || "png";
      return { bytes: new Uint8Array(await blob.arrayBuffer()), extensao, url: URL.createObjectURL(blob), largura: canvas.width, altura: canvas.height };
    } finally {
      URL.revokeObjectURL(urlOrigem);
    }
  }

  raiz.Imagens = { preparar };
})(typeof globalThis !== "undefined" ? globalThis : this);

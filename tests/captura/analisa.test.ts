// As capturas que o Chrome entregou no teste do botão (captura_*.json, geradas por
// teste_captura.py) passam pelo leitor real do servidor. Rodar com: bun test
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { analyzeCapturedContent } from "../../src/lib/importers.server";
import { detectPlatform } from "../../src/lib/import-types";
import { normalizeVariantGroups } from "../../src/lib/import-queries";

for (const file of ["captura_normal.json", "captura_colada.json"]) {
  describe(file, () => {
    const capture = JSON.parse(readFileSync(join(import.meta.dir, file), "utf8")) as { url: string; html: string };
    // O leitor recusa endereços locais (proteção do servidor); no uso real o endereço é o da loja de origem.
    const url = capture.url.replace("http://localhost:4601", "https://loja.exemplo.com");
    const analysis = analyzeCapturedContent(capture.html, url, detectPlatform(url));
    if (!analysis.product) console.log("motivo:", analysis.blockedReason, analysis.message);
    const product = analysis.product;

    test("a leitura encontra o produto, sem marcar bloqueio", () => {
      expect(product).not.toBeNull();
      expect(analysis.blockedReason ?? null).toBeNull();
    });
    test("nome e preços", () => {
      expect(product?.title).toBe("Garrafa Térmica Inox 500ml");
      expect(product?.currentPrice).toBe(49.9);
      expect(product?.oldPrice).toBe(89.9);
    });
    test("imagens na ordem da página, sem repetir", () => {
      expect(product?.images.slice(0, 3)).toEqual([
        "https://img.exemplo.com/produto/garrafa-1_800x800.jpg",
        "https://img.exemplo.com/produto/garrafa-2_800x800.jpg",
        "https://img.exemplo.com/produto/garrafa-3_800x800.jpg",
      ]);
      expect(new Set(product?.images).size).toBe(product?.images.length);
    });
    test("nota e quantidade de avaliações", () => {
      expect(product?.rating).toBe(4.7);
      expect(product?.reviewCount).toBe(132);
    });
    test("variações vindas do estado em variável viram grupos com valores", () => {
      expect(normalizeVariantGroups(product?.variants ?? [])).toEqual([
        { name: "Cor", values: ["Preto", "Azul </script> teste"] },
        { name: "Capacidade", values: ["500ml", "750ml"] },
      ]);
    });
    test("marca vira característica; descrição sem marcação HTML", () => {
      expect(product?.attributes).toContainEqual({ label: "Marca", value: "Exemplo" });
      expect(product?.description).toBe("Mantém a bebida gelada por 24 horas. Texto com e marcas .");
    });
    test("endereço de origem registrado", () => {
      expect(product?.sourceUrl).toBe(url);
    });
  });
}

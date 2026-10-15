// Funções puras da importação. Rodar com: bun test
import { describe, expect, test } from "bun:test";

import { normalizeVariantGroups } from "../src/lib/import-queries";
import { formatDecimalInput, parseDecimalInput } from "../src/lib/product-types";

describe("parseDecimalInput", () => {
  const cases: Array<[string, number | null]> = [
    // O campo vinha preenchido assim e era gravado como 339 / 749 / 129999.
    ["33.9", 33.9],
    ["74.9", 74.9],
    ["19.9", 19.9],
    ["1299.99", 1299.99],
    // Formato brasileiro.
    ["33,90", 33.9],
    ["1.299,99", 1299.99],
    ["12.345.678,90", 12345678.9],
    ["R$ 19,90", 19.9],
    ["1.299", 1299],
    ["1.000", 1000],
    // Formato internacional com milhar.
    ["1,299.99", 1299.99],
    // Inteiros e nota.
    ["50", 50],
    ["4.8", 4.8],
    ["4,8", 4.8],
    ["167", 167],
    // Vazios e lixo.
    ["", null],
    ["   ", null],
    ["abc", null],
    ["R$", null],
  ];
  for (const [input, expected] of cases) {
    test(`"${input}" -> ${expected}`, () => {
      expect(parseDecimalInput(input)).toBe(expected);
    });
  }

  test("null e undefined viram null", () => {
    expect(parseDecimalInput(null)).toBeNull();
    expect(parseDecimalInput(undefined)).toBeNull();
  });
});

describe("o que o campo mostra é o que é gravado", () => {
  for (const price of [33.9, 74.9, 19.9, 16.9, 1299.99, 50, 0.5, 129999, 1000, 2500.5]) {
    test(`preço ${price}`, () => {
      expect(parseDecimalInput(formatDecimalInput(price, 2))).toBe(price);
    });
  }
  for (const rating of [4.8, 5, 4.75, 3]) {
    test(`nota ${rating}`, () => {
      expect(parseDecimalInput(formatDecimalInput(rating))).toBe(rating);
    });
  }
  test("valor ausente deixa o campo vazio", () => {
    expect(formatDecimalInput(null, 2)).toBe("");
    expect(formatDecimalInput(undefined)).toBe("");
  });
  test("vírgula e duas casas", () => {
    expect(formatDecimalInput(33.9, 2)).toBe("33,90");
    expect(formatDecimalInput(1299.99, 2)).toBe("1299,99");
  });
});

describe("normalizeVariantGroups", () => {
  test("mantém a ordem e tira espaços, vazios e repetidos", () => {
    expect(
      normalizeVariantGroups([
        { name: " Cor ", values: ["Preto", " preto ", "Azul", "", "  "] },
        { name: "Tamanho", values: ["P", "M", "G", "m"] },
      ]),
    ).toEqual([
      { name: "Cor", values: ["Preto", "Azul"] },
      { name: "Tamanho", values: ["P", "M", "G"] },
    ]);
  });

  test("descarta grupo sem nome, repetido ou sem valores", () => {
    expect(
      normalizeVariantGroups([
        { name: "", values: ["A"] },
        { name: "Cor", values: ["Preto"] },
        { name: "cor", values: ["Rosa"] },
        { name: "Modelo", values: [] },
        { name: "Voltagem", values: ["  "] },
      ]),
    ).toEqual([{ name: "Cor", values: ["Preto"] }]);
  });

  test("lista vazia continua vazia", () => {
    expect(normalizeVariantGroups([])).toEqual([]);
  });
});

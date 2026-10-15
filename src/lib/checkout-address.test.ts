import { describe, expect, test } from "bun:test";
import { isCompleteAddress } from "./checkout-address";

const address = { cep: "01310-100", street: "Avenida Paulista", number: "100", district: "Bela Vista", city: "São Paulo", state: "SP" };
describe("physical delivery eligibility", () => {
  test("complete address needs no complement", () => expect(isCompleteAddress(address)).toBe(true));
  for (const key of Object.keys(address) as Array<keyof typeof address>) {
    test(`missing ${key} blocks delivery`, () => expect(isCompleteAddress({ ...address, [key]: "" })).toBe(false));
  }
  test("unknown state is invalid", () => expect(isCompleteAddress({ ...address, state: "ZZ" })).toBe(false));
});
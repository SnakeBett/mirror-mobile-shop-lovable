import { afterEach, describe, expect, test } from "bun:test";
import { zuckpay } from "./zuckpay.server";
import { imperiumpay } from "./imperiumpay.server";
import { gatewayErrorCode, GatewayUnknownResultError, GatewayRequestError, type CreatePixInput } from "./index";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
// All transport is replaced before fixture credentials are used. No network calls.
const fixture: CreatePixInput = {
  order_id: "fixture-order", attempt_id: "fixture-attempt", amount_cents: 1690,
  customer: { name: "Fixture Buyer", email: "fixture@example.invalid", cpf: "fixture", phone: "fixture" },
  description: "Fixture", shipping_cents: 0,
  items: [{ id: "fixture-item", title: "Fixture", unit_price_cents: 1690, quantity: 1, tangible: true }],
  shipping: { street: "Fixture", number: "1", complement: "", cep: "fixture", district: "Fixture", city: "Fixture", state: "SP" },
  tracking: {}, webhook_url: "https://example.invalid/webhook",
};
function mockResponse(body: unknown, status = 200, check?: (url: string, body: Record<string, unknown>) => void) {
  globalThis.fetch = (async (url, init) => {
    check?.(String(url), JSON.parse(String(init?.body ?? "{}")));
    return Response.json(body, { status });
  }) as typeof fetch;
}
// As credenciais chegam por parâmetro (painel ou variável de ambiente, resolvido antes).
const FIXTURE_KEY = "test-fixture-not-a-credential";
const fixtureCreds = (provider: string) =>
  provider === "zuckpay" ? { client_id: FIXTURE_KEY, client_secret: FIXTURE_KEY } : { public_key: FIXTURE_KEY, private_key: FIXTURE_KEY };
describe("Pix adapters with simulated responses only", () => {
  test("ZuckPay sends reais and extracts both Pix fields", async () => {
    mockResponse({ transactionId: "fixture-tx", pix_code: "fixture-pix", qrcode_image: "fixture-image", status: "PENDING", amount: 16.9 }, 200, (url, body) => {
      expect(url).toBe("https://www.zuckpay.com.br/conta/v3/pix/qrcode"); expect(body["valor"]).toBe(16.9);
    });
    const charge = await zuckpay.createPixCharge(fixture, fixtureCreds("zuckpay"));
    expect(charge.pixCopyPaste).toBe("fixture-pix"); expect(charge.amountCents).toBe(1690);
    expect(charge.qrCodeImage).toBe("data:image/png;base64,fixture-image");
    mockResponse({ transactionId: "fixture-tx", pix_code: "", qrcode: "fallback-pix" });
    expect((await zuckpay.createPixCharge(fixture, fixtureCreds("zuckpay"))).pixCopyPaste).toBe("fallback-pix");
  });
  test("ImperiumPay sends cents and extracts nested sale", async () => {
    mockResponse({ sale: { id: "fixture-tx", amount: 1690, status: "PENDENTE", payment: { pix: { key: "fixture-pix", qrCodeBase64: "fixture-image", expiresAt: "2026-10-16T00:00:00Z" } } } }, 200, (url, body) => {
      expect(url).toBe("https://api.imperiumpay.com.br/api/sales"); expect(body["amount"]).toBe(1690); expect(body["paymentMethod"]).toBe("PIX");
      expect(body["shipping"]).toBeDefined(); expect(body["pix"]).toBeUndefined();
    });
    const charge = await imperiumpay.createPixCharge(fixture, fixtureCreds("imperiumpay"));
    expect(charge.providerTransactionId).toBe("fixture-tx"); expect(charge.pixCopyPaste).toBe("fixture-pix"); expect(charge.qrCodeImage).toBe("data:image/png;base64,fixture-image");
  });
  for (const adapter of [zuckpay, imperiumpay]) {
    test(`${adapter.provider}: 401 is rejected, 500 and incomplete 200 are uncertain`, async () => {
      const creds = fixtureCreds(adapter.provider);
      mockResponse({ code: "UNAUTHORIZED", message: "private response omitted" }, 401);
      await expect(adapter.createPixCharge(fixture, creds)).rejects.toBeInstanceOf(GatewayRequestError);
      mockResponse({}, 500);
      await expect(adapter.createPixCharge(fixture, creds)).rejects.toBeInstanceOf(GatewayUnknownResultError);
      mockResponse(adapter.provider === "zuckpay" ? { transactionId: "fixture-tx" } : { sale: { id: "fixture-tx" } });
      try { await adapter.createPixCharge(fixture, creds); throw new Error("expected uncertainty"); }
      catch (error) { expect(error).toBeInstanceOf(GatewayUnknownResultError); if (error instanceof GatewayUnknownResultError) expect(error.transactionId).toBe("fixture-tx"); }
      globalThis.fetch = (async () => { throw new Error("simulated timeout"); }) as typeof fetch;
      await expect(adapter.createPixCharge(fixture, creds)).rejects.toBeInstanceOf(GatewayUnknownResultError);
    });
  }
  test("provider text is never included in safe diagnostics", () => {
    expect(gatewayErrorCode({ code: "private untrusted text" }, 422)).toBe("HTTP_422");
    expect(gatewayErrorCode({ error: { code: "VALIDATION_ERROR" } }, 422)).toBe("VALIDATION_ERROR");
  });
});
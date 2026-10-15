"""Teste de ponta a ponta do botão de captura, com Chrome de verdade e duas origens.

Origem A (localhost:4601)  = "loja de origem" (página de produto de mentira)
Origem B (127.0.0.1:4602)  = "nossa loja" (a aba do importador, sem React e sem login)

O código do botão e o lado receptor são os do projeto (src/lib/browser-capture.ts).
Nada aqui toca a internet.

Rodar (precisa de bun, Chrome e do Playwright para Python):
    python tests/captura/teste_captura.py
Ele regrava captura_normal.json e captura_colada.json, usados por analisa.test.ts.
"""

import json
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
# Empacota o módulo real do projeto para as páginas de teste.
# shutil.which acha o executável também quando o bun está instalado como .cmd no Windows.
BUN = shutil.which("bun")
if not BUN:
    sys.exit("bun não encontrado no PATH.")
subprocess.run(
    [BUN, "build", str(HERE / "harness.ts"), f"--outfile={HERE / 'capture.js'}", "--target=browser"],
    check=True,
    capture_output=True,
)
CAPTURE_JS = (HERE / "capture.js").read_text(encoding="utf-8")
A = "http://localhost:4601"
B = "http://127.0.0.1:4602"

PRODUCT_PAGE = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Garrafa Térmica Inox 500ml | Loja de Origem</title>
<meta property="og:title" content="Garrafa Térmica Inox 500ml">
<meta property="og:image" content="https://img.exemplo.com/produto/garrafa-1_800x800.jpg">
<style>body{font-family:sans-serif} .enorme{content:"ESTILO-QUE-DEVE-SUMIR"}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Garrafa Térmica Inox 500ml","sku":"GT-500","image":["https://img.exemplo.com/produto/garrafa-1_800x800.jpg","https://img.exemplo.com/produto/garrafa-2_800x800.jpg"],"description":"Mantém a bebida gelada por 24 horas. Texto com </b> e <i>marcas</i>.","brand":{"@type":"Brand","name":"Exemplo"},"offers":{"@type":"Offer","price":"49.90","priceCurrency":"BRL","availability":"https://schema.org/InStock"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.7","reviewCount":"132"}}</script>
</head><body>
<h1>Garrafa Térmica Inox 500ml</h1>
<svg width="10" height="10"><circle r="5"><title>SVG-QUE-DEVE-SUMIR</title></circle></svg>
<img src="https://img.exemplo.com/produto/garrafa-3_800x800.jpg" alt="foto 3">
<script>
  // Estado que só existe em variável (não está no HTML): o botão precisa levar junto.
  window.__NEXT_DATA__ = { props: { pageProps: { product: {
    product_id: "998877", title: "Garrafa Térmica Inox 500ml", price: { sale_price: "49,90", original_price: "89,90" },
    sale_props: [ { prop_name: "Cor", sale_prop_values: [ { name: "Preto" }, { name: "Azul <" + "/script> teste" } ] },
                  { prop_name: "Capacidade", sale_prop_values: [ { name: "500ml" }, { name: "750ml" } ] } ]
  } } } };
</script>
</body></html>"""

IMPORTER_PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>importador</title></head><body>
<script>%s</script>
<script>
  window.__token = vt.getCaptureToken();
  window.__opener = !!window.opener;
  vt.listenForCapture(window, window.__token, function (capture) { window.__received = capture; document.title = "recebido"; });
  window.__paste = async function () { return vt.readClipboardCapture(await navigator.clipboard.readText()); };
</script></body></html>"""

BUTTON_PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>botao</title></head><body>
<script>%s</script>
<script>window.__href = vt.buildCaptureBookmarklet(location.origin, vt.getCaptureToken());</script></body></html>"""

# Página hostil: abre o importador e tenta empurrar uma captura sem conhecer o segredo.
EVIL_PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>hostil</title></head><body>
<button id="go">abrir</button>
<script>
document.getElementById("go").onclick = function () {
  var w = window.open("%s/admin/importar/navegador?captura=1", "_blank");
  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "vt-capture-ready") return;
    w.postMessage({ type: "vt-capture", token: "segredo-errado", url: "https://hostil.exemplo/x", html: "<html>falso</html>" }, "*");
    w.postMessage({ type: "vt-capture", url: "https://hostil.exemplo/x", html: "<html>falso</html>" }, "*");
    window.__tried = true;
  });
};
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        port = self.server.server_address[1]
        path = self.path.split("?")[0]
        headers = {}
        if port == 4601:
            if path == "/produto":
                body = PRODUCT_PAGE
            elif path == "/produto-isolado":
                body = PRODUCT_PAGE
                headers["Cross-Origin-Opener-Policy"] = "same-origin"
            elif path == "/hostil":
                body = EVIL_PAGE % B
            else:
                body = None
        else:
            if path == "/admin/importar/navegador":
                body = IMPORTER_PAGE % CAPTURE_JS
            elif path == "/botao":
                body = BUTTON_PAGE % CAPTURE_JS
            else:
                body = None
        if body is None:
            self.send_response(404)
            self.end_headers()
            return
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for key, value in headers.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)


def serve(port):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


results = []


def check(name, condition, detail=""):
    results.append(condition)
    print(("  OK   " if condition else "  FALHOU ") + name + (f"  [{detail}]" if detail and not condition else ""))


def install_button(page, code):
    """Põe o código do botão atrás de um clique real, como na barra de favoritos."""
    page.evaluate(
        """(code) => {
            const b = document.createElement('button');
            b.id = 'favorito'; b.textContent = 'Enviar para a Vitrine';
            b.onclick = () => { (0, eval)(code); };
            document.body.appendChild(b);
        }""",
        code,
    )


def main():
    servers = [serve(4601), serve(4602)]
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context()
        context.grant_permissions(["clipboard-read", "clipboard-write"], origin=B)
        context.grant_permissions(["clipboard-read", "clipboard-write"], origin=A)

        # --- o botão gerado pela nossa loja -----------------------------------
        setup = context.new_page()
        setup.goto(f"{B}/botao")
        href = setup.evaluate("window.__href")
        token = setup.evaluate("vt.getCaptureToken()")
        print("1. Botão gerado")
        check("começa com javascript:", href.startswith("javascript:"))
        code = unquote(href[len("javascript:"):])
        check("leva a origem da nossa loja", json.dumps(B) in code)
        check("leva o segredo deste navegador", json.dumps(token) in code)
        check("não sobrou marcador sem trocar", "__ORIGIN__" not in code and "__TOKEN__" not in code and "__PATH__" not in code and "__MAX__" not in code)
        print(f"     tamanho do botão: {len(href)} caracteres")

        # --- cenário normal: clique na página do produto ----------------------
        print("2. Clique na página do produto (caminho normal)")
        product = context.new_page()
        product.goto(f"{A}/produto")
        install_button(product, code)
        with context.expect_page() as popup_info:
            product.click("#favorito")
        popup = popup_info.value
        popup.wait_for_load_state()
        check("abriu a aba do importador na nossa loja", popup.url.startswith(f"{B}/admin/importar/navegador") and "captura=1" in popup.url, popup.url)
        try:
            popup.wait_for_function("window.__received", timeout=8000)
            received = popup.evaluate("window.__received")
        except Exception as error:  # noqa: BLE001
            received = None
            print("     erro:", str(error)[:200])
        check("a captura chegou sozinha", received is not None)
        html = (received or {}).get("html", "")
        check("endereço do produto veio junto", (received or {}).get("url") == f"{A}/produto", str((received or {}).get("url")))
        check("HTML traz os dados estruturados (JSON-LD)", '"@type":"Product"' in html)
        check("estado guardado em variável foi junto", '"product_id":"998877"' in html)
        check("o </script> dentro do JSON não quebra o bloco", "Azul \\u003c/script> teste" in html)
        check("estilos removidos", "ESTILO-QUE-DEVE-SUMIR" not in html)
        check("SVG removido", "SVG-QUE-DEVE-SUMIR" not in html)
        (HERE / "captura_normal.json").write_text(json.dumps(received or {}), encoding="utf-8")
        check("depois de entregue, o botão volta ao estado normal", product.evaluate("window.__vtCapturePending") is False)
        popup.close()
        product.close()

        # --- página hostil: não conhece o segredo ----------------------------
        print("3. Site qualquer tentando empurrar uma captura")
        evil = context.new_page()
        evil.goto(f"{A}/hostil")
        with context.expect_page() as popup_info:
            evil.click("#go")
        victim = popup_info.value
        victim.wait_for_load_state()
        evil.wait_for_function("window.__tried", timeout=8000)
        victim.wait_for_timeout(1500)
        check("captura com segredo errado é ignorada", victim.evaluate("window.__received === undefined"))
        victim.close()
        evil.close()

        # --- página que isola as abas que abre (COOP) -------------------------
        print("4. Página de origem que isola abas novas (caminho da área de transferência)")
        isolated = context.new_page()
        dialogs = []
        isolated.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        isolated.goto(f"{A}/produto-isolado")
        install_button(isolated, code)
        with context.expect_page() as popup_info:
            isolated.click("#favorito")
        orphan = popup_info.value
        orphan.wait_for_load_state()
        isolated.wait_for_timeout(500)
        check("a aba do importador abriu sem ligação com a origem", orphan.evaluate("window.__opener") is False)
        orphan.wait_for_timeout(1500)
        check("nada chega sozinho nesse caso", orphan.evaluate("window.__received === undefined"))
        check("primeiro clique não mostra aviso", len(dialogs) == 0, str(dialogs))
        isolated.bring_to_front()
        isolated.click("#favorito")
        isolated.wait_for_timeout(500)
        check("segundo clique copia os dados e avisa", len(dialogs) == 1 and "Dados copiados" in dialogs[0], str(dialogs))
        check("segundo clique não abre outra aba", len(context.pages) == 3, str(len(context.pages)))
        orphan.bring_to_front()
        pasted = orphan.evaluate("window.__paste()")
        check("COLAR CAPTURA lê a cópia", pasted is not None and pasted.get("url") == f"{A}/produto-isolado", str(pasted)[:120])
        check("conteúdo colado é o da página", pasted is not None and '"@type":"Product"' in pasted.get("html", ""))
        (HERE / "captura_colada.json").write_text(json.dumps(pasted or {}), encoding="utf-8")
        check("texto comum na área de transferência não vira captura", orphan.evaluate("vt.readClipboardCapture('<html>qualquer coisa</html>')") is None)

        browser.close()
    for server in servers:
        server.shutdown()
    print(f"\n{sum(results)} de {len(results)} verificações passaram")
    sys.exit(0 if all(results) else 1)


main()

/**
 * Captura em um clique.
 *
 * Um botão de favoritos, clicado pelo administrador na página de produto que
 * ele mesmo abriu, entrega o conteúdo dessa página ao importador. O servidor
 * não busca nada na loja de origem e nenhuma verificação é contornada: só
 * viaja o que já está carregado no navegador de quem clicou.
 */

export const CAPTURE_READY = "vt-capture-ready";
export const CAPTURE_DATA = "vt-capture";
export const CAPTURE_PATH = "/admin/importar/navegador?captura=1";
/** Um pouco abaixo do limite da análise no servidor (5 MB). */
export const CAPTURE_MAX_CHARS = 5 * 1024 * 1024 - 4096;

const TOKEN_KEY = "vt_capture_token";
const CLIPBOARD_MARK = "<!--vt-capture:";

export type CapturePayload = { url: string; html: string };

/**
 * Segredo deste navegador, embutido no botão. Sem ele, um site qualquer que
 * abrisse o importador não consegue empurrar uma captura.
 */
export function getCaptureToken(): string {
  try {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    window.localStorage.setItem(TOKEN_KEY, created);
    return created;
  } catch {
    // Sem armazenamento, o botão vale só enquanto esta aba estiver aberta.
    return crypto.randomUUID();
  }
}

function toPayload(url: unknown, html: unknown): CapturePayload | null {
  if (typeof url !== "string" || typeof html !== "string") return null;
  if (!html.trim() || html.length > CAPTURE_MAX_CHARS + 4096) return null;
  return { url: url.slice(0, 2000), html };
}

/** Valida a mensagem enviada pelo botão para a aba do importador. */
export function readCaptureMessage(data: unknown, token: string): CapturePayload | null {
  if (!data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  if (message["type"] !== CAPTURE_DATA || message["token"] !== token) return null;
  return toPayload(message["url"], message["html"]);
}

/** Captura entregue pela área de transferência: primeira linha `<!--vt-capture:URL-->`. */
export function readClipboardCapture(text: string): CapturePayload | null {
  if (!text.startsWith(CLIPBOARD_MARK)) return null;
  const end = text.indexOf("-->");
  if (end < 0) return null;
  return toPayload(text.slice(CLIPBOARD_MARK.length, end).trim(), text.slice(end + 3).trimStart());
}

/**
 * Lado do importador: avisa a página de origem que está pronto e espera a
 * captura. Devolve a função que encerra a espera.
 */
export function listenForCapture(
  win: Window,
  token: string,
  onCapture: (capture: CapturePayload) => void,
): () => void {
  const opener = win.opener as Window | null;
  if (!opener) return () => undefined;

  let done = false;
  const stop = () => {
    done = true;
    win.clearInterval(timer);
    win.removeEventListener("message", onMessage);
  };
  const onMessage = (event: MessageEvent) => {
    if (done || event.source !== opener) return;
    const capture = readCaptureMessage(event.data, token);
    if (!capture) return;
    stop();
    onCapture(capture);
  };
  // A origem da outra página é desconhecida; este aviso não leva nenhum segredo.
  const announce = () => opener.postMessage({ type: CAPTURE_READY }, "*");

  win.addEventListener("message", onMessage);
  const timer = win.setInterval(announce, 300);
  announce();
  win.setTimeout(stop, 60_000);
  return stop;
}

/**
 * Código do botão. Fica em texto para ser exatamente o que roda na página de
 * origem (sem passar pelo empacotador).
 */
const BOOKMARKLET_SOURCE = `(function () {
  var ORIGIN = __ORIGIN__, TOKEN = __TOKEN__, MAX = __MAX__;
  function collect() {
    var state = "";
    var names = ["__MODERN_ROUTER_DATA__", "__UNIVERSAL_DATA_FOR_REHYDRATION__", "__NEXT_DATA__", "__INITIAL_STATE__", "__NUXT__", "SIGI_STATE", "_ROUTER_DATA"];
    for (var i = 0; i < names.length; i++) {
      try {
        var value = window[names[i]];
        if (!value || typeof value !== "object") continue;
        var json = JSON.stringify(value);
        if (json && json.length < 2000000) state += '<script type="application/json">' + json.replace(/</g, "\\\\u003c") + "</" + "script>";
      } catch (e) {}
    }
    var page = document.documentElement.outerHTML.replace(/<style[\\s\\S]*?<\\/style>/gi, "").replace(/<svg[\\s\\S]*?<\\/svg>/gi, "");
    return (state + page).slice(0, MAX);
  }
  function copy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    area.remove();
    return ok;
  }
  var html = collect();
  // A tentativa anterior não foi entregue (há páginas que isolam as abas que abrem):
  // no segundo clique os dados vão pela área de transferência.
  if (window.__vtCapturePending) {
    window.__vtCapturePending = false;
    alert(copy("${CLIPBOARD_MARK}" + location.href + "-->\\n" + html)
      ? "Dados copiados. Volte para a aba da loja e clique em COLAR CAPTURA."
      : "Não foi possível copiar. Use a opção de colar os dados manualmente no importador.");
    return;
  }
  var target = window.open(ORIGIN + __PATH__, "_blank");
  if (!target) {
    alert("O navegador bloqueou a nova aba. Permita pop-ups para este site e clique no botão de novo.");
    return;
  }
  window.__vtCapturePending = true;
  function onMessage(event) {
    if (event.origin !== ORIGIN || event.source !== target) return;
    if (!event.data || event.data.type !== "${CAPTURE_READY}") return;
    window.__vtCapturePending = false;
    window.removeEventListener("message", onMessage);
    target.postMessage({ type: "${CAPTURE_DATA}", token: TOKEN, url: location.href, html: html }, ORIGIN);
  }
  window.addEventListener("message", onMessage);
  setTimeout(function () { window.removeEventListener("message", onMessage); }, 120000);
})();`;

/** Endereço `javascript:` para arrastar à barra de favoritos. */
export function buildCaptureBookmarklet(origin: string, token: string): string {
  // Funções no replace: assim um "$" no valor nunca é lido como padrão de substituição.
  const code = BOOKMARKLET_SOURCE.replace("__ORIGIN__", () => JSON.stringify(origin))
    .replace("__TOKEN__", () => JSON.stringify(token))
    .replace("__MAX__", () => String(CAPTURE_MAX_CHARS))
    .replace("__PATH__", () => JSON.stringify(CAPTURE_PATH));
  return `javascript:${encodeURIComponent(code)}`;
}

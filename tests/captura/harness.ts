// Expõe o módulo real do projeto para as páginas de teste (sem React, sem login).
import {
  buildCaptureBookmarklet,
  getCaptureToken,
  listenForCapture,
  readClipboardCapture,
} from "../../src/lib/browser-capture";

Object.assign(window, {
  vt: { buildCaptureBookmarklet, getCaptureToken, listenForCapture, readClipboardCapture },
});

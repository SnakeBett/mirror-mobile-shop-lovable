/**
 * Parser determinístico de avaliações coladas (ex.: Shopee).
 * Não reescreve o texto do comprador: só remove linhas de interface e URLs.
 */

export type ParsedReview = {
  key: string;
  username: string;
  usernameFound: boolean;
  rating: number | null;
  ratingSuggestion: number | null;
  /** ISO com fuso de São Paulo, ou null. */
  date: string | null;
  dateRaw: string | null;
  variation: string | null;
  comment: string;
  images: string[];
  videos: string[];
};

const DATE_RE = /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/;
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const VIDEO_RE = /\.(mp4|m3u8|mov|webm)(\?|$)|\/video\/|play\.|vod/i;
const IMAGE_RE = /susercontent\.com\/file\/|\.(jpe?g|png|webp|gif|avif)(\?|$)|\/file\/[a-z0-9-_]+/i;

const JUNK_LINE = [
  /^(svg)+$/i,
  /^profile$/i,
  /^image$/i,
  /^imagem$/i,
  /^video$/i,
  /^vídeo$/i,
  /^útil\??(\s*\(?\d*\)?)?$/i,
  /^util\??(\s*\(?\d*\)?)?$/i,
  /^\(?\d{1,6}\)?$/,
  /^(responder|denunciar|curtir|mais|ver mais|ver menos|resposta do vendedor.*)$/i,
  /^\d{1,2}:\d{2}$/,
];

export function cleanVariation(value: string) {
  return value
    .trim()
    .replace(/\s*,\s*(?=\S)/g, ", ")
    .replace(/\s{2,}/g, " ");
}

function stripInlineJunk(line: string) {
  return line.replace(URL_RE, "").replace(/(svg){1,}/gi, "").replace(/\s{2,}/g, " ").trim();
}

function isJunk(line: string) {
  const t = line.trim();
  if (!t) return true;
  if (JUNK_LINE.some((re) => re.test(t))) return true;
  return stripInlineJunk(t) === "";
}

function looksLikeUsername(line: string) {
  const t = stripInlineJunk(line);
  if (!t || t.length > 40) return false;
  if (DATE_RE.test(t)) return false;
  if (/:/.test(t)) return false;
  // Shopee: usernames sem espaços, ou "u*****a" mascarado
  return /^[\p{L}\p{N}._*\-]+$/u.test(t);
}

function explicitRating(text: string): number | null {
  const stars = text.match(/★+/);
  if (stars) {
    const n = stars[0].length;
    if (n >= 1 && n <= 5) return n;
  }
  const m = text.match(/(?:nota|avalia(?:ç|c)ão)\s*[:=]?\s*([1-5])(?:[.,]0)?\s*(?:\/\s*5|estrelas?)?/i)
    ?? text.match(/\b([1-5])\s*(?:\/\s*5|estrelas?)\b/i);
  return m ? Number(m[1]) : null;
}

function toIso(raw: RegExpMatchArray) {
  const [, y, mo, d, h, mi] = raw;
  return `${y}-${mo}-${d}T${h}:${mi}:00-03:00`;
}

export function parseReviews(input: string): ParsedReview[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const dateIdx: number[] = [];
  lines.forEach((line, i) => {
    if (DATE_RE.test(line)) dateIdx.push(i);
  });

  // Início de cada bloco = linha do username (antes da data), quando existir.
  const starts = dateIdx.map((di, k) => {
    const floor = k > 0 ? dateIdx[k - 1] + 1 : 0;
    let userLine = -1;
    let svgCount: number | null = null;
    for (let i = di - 1; i >= floor && i >= di - 6; i -= 1) {
      const t = lines[i].trim();
      const svg = t.match(/^(svg)+$/i);
      if (svg && svgCount === null) svgCount = t.length / 3;
      if (isJunk(t)) continue;
      if (looksLikeUsername(t)) userLine = i;
      break;
    }
    return { di, userLine, svgCount };
  });

  return starts.map(({ di, userLine, svgCount }, k) => {
    const end = k + 1 < starts.length
      ? (starts[k + 1].userLine >= 0 ? starts[k + 1].userLine : starts[k + 1].di)
      : lines.length;
    const headStart = userLine >= 0 ? userLine : di;
    const block = lines.slice(headStart, end);
    const dateLine = lines[di];
    const dm = dateLine.match(DATE_RE)!;

    let variation: string | null = null;
    const variationIn = (s: string) => s.match(/varia(?:ç|c)(?:ão|ao)\s*:\s*(.+)$/i);
    const vm = variationIn(dateLine);
    if (vm) variation = cleanVariation(vm[1]);

    const images: string[] = [];
    const videos: string[] = [];
    for (const line of block) {
      for (const url of line.match(URL_RE) ?? []) {
        const clean = url.replace(/[),.;]+$/, "");
        if (VIDEO_RE.test(clean)) {
          if (!videos.includes(clean)) videos.push(clean);
        } else if (IMAGE_RE.test(clean)) {
          if (!images.includes(clean)) images.push(clean);
        }
      }
    }

    const commentLines: string[] = [];
    for (let i = di + 1; i < end; i += 1) {
      const raw = lines[i];
      if (isJunk(raw)) continue;
      if (!variation) {
        const v = variationIn(raw.trim());
        if (v) {
          variation = cleanVariation(v[1]);
          continue;
        }
      }
      commentLines.push(stripInlineJunk(raw));
    }
    const comment = commentLines.join("\n").trim();
    const username = userLine >= 0 ? stripInlineJunk(lines[userLine]) : "";
    const rating = explicitRating(block.join("\n"));

    return {
      key: `r${k}-${di}`,
      username: username || "Cliente da Shopee",
      usernameFound: !!username,
      rating,
      ratingSuggestion: rating ?? (svgCount && svgCount >= 1 && svgCount <= 5 ? svgCount : null),
      date: toIso(dm),
      dateRaw: dm[0],
      variation,
      comment,
      images,
      videos,
    };
  });
}

export async function reviewHash(productId: string, username: string, date: string | null, comment: string) {
  const norm = [productId, username.trim().toLowerCase(), (date ?? "").slice(0, 16), comment.replace(/\s+/g, " ").trim().toLowerCase()].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

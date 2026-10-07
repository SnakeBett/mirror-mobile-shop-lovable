import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { createReview, saveReviewImages, REVIEW_PHOTO_LIMIT } from "@/lib/admin-queries";
import { parseReviews, reviewHash, type ParsedReview } from "@/lib/review-import";
import { copyReviewImages } from "@/lib/review-import.functions";

type Item = ParsedReview & {
  selected: boolean;
  hash: string;
  duplicate: boolean;
  status: "idle" | "done" | "error";
  warning: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

function toLocalInput(iso: string | null) {
  return iso ? iso.slice(0, 16) : "";
}

export function ReviewImportDialog({
  open,
  onOpenChange,
  productId,
  nextOrder,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  nextOrder: number;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const copyImages = useServerFn(copyReviewImages);

  async function analyze() {
    setBusy(true);
    try {
      // Libera a interface antes do parsing de textos grandes.
      await new Promise((r) => setTimeout(r, 0));
      const parsed = parseReviews(text);
      const withHash = await Promise.all(
        parsed.map(async (p) => ({ ...p, hash: await reviewHash(productId, p.username, p.date, p.comment) })),
      );
      const { data: existing } = await supabase
        .from("reviews")
        .select("import_hash")
        .eq("product_id", productId)
        .in("import_hash", withHash.map((p) => p.hash).slice(0, 500) as never);
      const taken = new Set(((existing ?? []) as Array<{ import_hash: string | null }>).map((r) => r.import_hash));
      const seen = new Set<string>();
      setItems(
        withHash.map((p) => {
          const duplicate = taken.has(p.hash) || seen.has(p.hash);
          seen.add(p.hash);
          return { ...p, duplicate, selected: !duplicate, status: "idle", warning: null };
        }),
      );
      if (parsed.length === 0) toast.error("Nenhuma avaliação encontrada. Confira se o texto contém as datas das avaliações.");
    } finally {
      setBusy(false);
    }
  }

  function patch(key: string, values: Partial<Item>) {
    setItems((prev) => prev?.map((it) => (it.key === key ? { ...it, ...values } : it)) ?? null);
  }

  const summary = useMemo(() => {
    const list = items ?? [];
    return {
      total: list.length,
      withImages: list.filter((i) => i.images.length > 0).length,
      images: list.reduce((n, i) => n + i.images.length, 0),
      review: list.filter((i) => i.rating === null || !i.comment).length,
      duplicates: list.filter((i) => i.duplicate).length,
      selected: list.filter((i) => i.selected && i.status !== "done").length,
    };
  }, [items]);

  async function runImport() {
    if (!items) return;
    const queue = items.filter((i) => i.selected && i.status !== "done");
    const missing = queue.filter((i) => i.rating === null);
    if (missing.length > 0) {
      toast.error(`${missing.length} avaliação(ões) sem nota. Defina a nota ou desmarque antes de importar.`);
      return;
    }
    setBusy(true);
    let order = nextOrder;
    let ok = 0;
    try {
      for (const [idx, item] of queue.entries()) {
        setProgress(`Importando ${idx + 1} de ${queue.length}…`);
        try {
          const urls = item.images.slice(0, REVIEW_PHOTO_LIMIT);
          let paths: string[] = [];
          let failed = 0;
          if (urls.length > 0) {
            try {
              const { results } = await copyImages({ data: { productId, urls } });
              paths = results.filter((r) => r.path).map((r) => r.path!);
              failed = results.length - paths.length;
            } catch {
              failed = urls.length;
            }
          }
          const name = item.username.trim() || "Cliente da Shopee";
          const id = await createReview({
            product_id: productId,
            customer_name: name,
            avatar_initial: name.charAt(0).toUpperCase(),
            rating: item.rating,
            comment: item.comment,
            is_active: true,
            sort_order: order++,
            reviewed_at: item.date,
            variation: item.variation,
            import_hash: item.hash,
            import_source: "shopee_paste",
          });
          if (paths.length > 0) await saveReviewImages(id, paths);
          ok += 1;
          patch(item.key, {
            status: "done",
            selected: false,
            warning: failed > 0 ? `${failed} foto(s) não puderam ser copiadas e foram ignoradas.` : null,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
          patch(item.key, {
            status: "error",
            warning: /duplicate|unique/i.test(msg) ? "Possível duplicata — já existe." : `Falhou: ${msg}`,
          });
        }
      }
      toast.success(`${ok} avaliação(ões) importada(s).`);
      onImported();
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  function reset() {
    setItems(null);
    setText("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Importar avaliações
          </DialogTitle>
        </DialogHeader>

        {!items ? (
          <div className="space-y-3">
            <Label htmlFor="review-paste">COLE AS AVALIAÇÕES AQUI</Label>
            <Textarea
              id="review-paste"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Conteúdo copiado da página (Ctrl+C / Ctrl+V)"
              className="min-h-[320px] font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Os comentários são mantidos exatamente como o comprador escreveu. Nada é salvo antes da sua confirmação.
            </p>
            <Button onClick={analyze} disabled={busy || !text.trim()}>
              {busy ? "Analisando…" : "Analisar avaliações"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-muted px-2 py-1 font-semibold">{summary.total} avaliações encontradas</span>
              <span className="rounded-md bg-muted px-2 py-1">{summary.withImages} com imagens</span>
              <span className="rounded-md bg-muted px-2 py-1">{summary.total - summary.withImages} sem imagens</span>
              <span className="rounded-md bg-muted px-2 py-1">{summary.images} imagens encontradas</span>
              <span className="rounded-md bg-muted px-2 py-1">{summary.review} precisam de revisão</span>
              {summary.duplicates > 0 && (
                <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">{summary.duplicates} possíveis duplicatas</span>
              )}
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <ReviewCard
                  key={item.key}
                  item={item}
                  editing={editing === item.key}
                  onEdit={() => setEditing(editing === item.key ? null : item.key)}
                  onPatch={(v) => patch(item.key, v)}
                  onRemove={() => setItems((prev) => prev?.filter((i) => i.key !== item.key) ?? null)}
                  disabled={busy}
                />
              ))}
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border bg-background pt-3">
              <Button onClick={runImport} disabled={busy || summary.selected === 0}>
                IMPORTAR AVALIAÇÕES SELECIONADAS ({summary.selected})
              </Button>
              <Button variant="outline" onClick={reset} disabled={busy}>Colar outro conteúdo</Button>
              {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewCard({
  item,
  editing,
  onEdit,
  onPatch,
  onRemove,
  disabled,
}: {
  item: Item;
  editing: boolean;
  onEdit: () => void;
  onPatch: (v: Partial<Item>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const done = item.status === "done";
  return (
    <div className={`rounded-md border p-3 text-sm ${item.duplicate ? "border-destructive/50" : "border-border"} ${done ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.selected}
            disabled={disabled || done}
            onChange={(e) => onPatch({ selected: e.target.checked })}
          />
          <span className="text-xs text-muted-foreground">Importar</span>
        </label>
        <span className="font-semibold">{done ? "✓ " : ""}{item.username}</span>
        {!item.usernameFound && <span className="text-xs text-muted-foreground">(sem username público)</span>}
        {item.duplicate && <span className="rounded bg-destructive/10 px-1.5 text-xs text-destructive">Possível duplicata</span>}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={onEdit} disabled={disabled || done}>{editing ? "Fechar" : "Editar"}</Button>
          <Button size="icon" variant="ghost" aria-label="Remover" onClick={onRemove} disabled={disabled}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={item.username} onChange={(e) => onPatch({ username: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Nota</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2"
              value={item.rating ?? ""}
              onChange={(e) => onPatch({ rating: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Nota não identificada</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} estrela{n > 1 ? "s" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input
              type="datetime-local"
              value={toLocalInput(item.date)}
              onChange={(e) => onPatch({ date: e.target.value ? `${e.target.value}:00-03:00` : null })}
            />
          </div>
          <div className="space-y-1">
            <Label>Variação</Label>
            <Input value={item.variation ?? ""} onChange={(e) => onPatch({ variation: e.target.value || null })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Comentário</Label>
            <Textarea value={item.comment} onChange={(e) => onPatch({ comment: e.target.value })} className="min-h-[100px]" />
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          <p><span className="text-muted-foreground">Data:</span> {formatDate(item.date) || "—"}</p>
          {item.variation && <p><span className="text-muted-foreground">Variação:</span> {item.variation}</p>}
          <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Comentário:</span> {item.comment || <em className="text-destructive">vazio — revisar</em>}</p>
          <p>
            <span className="text-muted-foreground">Nota:</span>{" "}
            {item.rating !== null ? `${item.rating} estrela${item.rating > 1 ? "s" : ""}` : (
              <span className="font-medium text-destructive">
                Revisar{item.ratingSuggestion ? ` (possível ${item.ratingSuggestion} — confirme em Editar)` : ""}
              </span>
            )}
          </p>
        </div>
      )}

      {item.images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.images.map((url) => (
            <div key={url} className="relative">
              <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-16 rounded object-cover" />
              {!done && (
                <button
                  type="button"
                  aria-label="Remover foto"
                  className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow"
                  onClick={() => onPatch({ images: item.images.filter((u) => u !== url) })}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {item.videos.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{item.videos.length} vídeo(s) detectado(s) — não são importados.</p>
      )}
      {item.warning && <p className="mt-2 text-xs text-destructive">{item.warning}</p>}
    </div>
  );
}

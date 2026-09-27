import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteChild, insertChild, reorderChild, updateChild } from "@/lib/admin-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  generateCombinations,
  kitDiscount,
  kitSavings,
  sameCombination,
  unitLabel,
  type AttributeDisplay,
  type ProductAttribute,
  type ProductVariant,
  type QuantityOffer,
  type VariantSettings,
} from "@/lib/variants";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return "Não foi possível salvar.";
}

function parseMoney(raw: string): number | null {
  const clean = raw.trim().replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

function moneyText(value: number | null | undefined) {
  return value == null ? "" : String(value).replace(".", ",");
}

/** Campo que grava ao sair (blur) — evita uma escrita por tecla. */
function BlurInput({
  value,
  onCommit,
  ...props
}: { value: string; onCommit: (value: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <Input
      {...props}
      value={local}
      onChange={(event) => setLocal(event.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
    />
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ================= KITS POR QUANTIDADE =================

export function QuantityOffersManager({
  productId,
  basePrice,
  rows,
  enabled,
  onToggle,
  onChange,
}: {
  productId: string;
  basePrice: number;
  rows: QuantityOffer[];
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onChange: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onChange();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  const add = () =>
    run(() => {
      const quantity = (rows.at(-1)?.quantity ?? 0) + 1;
      return insertChild("product_quantity_offers", {
        product_id: productId,
        name: quantity === 1 ? "1 unidade" : `Leve ${quantity}`,
        quantity,
        total_price: Math.round(basePrice * quantity * 100) / 100,
        sort_order: rows.length,
      });
    });

  const patch = (id: string, values: Record<string, unknown>) =>
    run(() => updateChild("product_quantity_offers", id, values));

  return (
    <Panel
      title="Ofertas por quantidade"
      action={
        enabled ? (
          <Button size="sm" variant="outline" onClick={add}>
            <Plus /> Adicionar oferta
          </Button>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3">
        <Switch id="kits-enabled" checked={enabled} onCheckedChange={onToggle} />
        <Label htmlFor="kits-enabled">Ativar ofertas por quantidade</Label>
      </div>
      {enabled && <p className="text-xs text-muted-foreground">Salve o produto para aplicar o liga/desliga. As ofertas abaixo são gravadas na hora.</p>}
      {enabled && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma oferta ainda. Ex.: 1 unidade, Leve 2, Leve 3.</p>
      )}
      {enabled &&
        rows.map((row, index) => {
          const savings = kitSavings(row, basePrice);
          const discount = kitDiscount(row, basePrice);
          return (
            <div
              key={row.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) {
                  void run(() => reorderChild("product_quantity_offers", rows, dragIndex, index));
                }
                setDragIndex(null);
              }}
              className="space-y-3 rounded-md border border-border p-3"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="size-4 cursor-grab text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 truncate text-sm font-medium">{row.name || `${row.quantity} un.`}</span>
                <Switch
                  aria-label="Oferta ativa"
                  checked={row.is_active}
                  onCheckedChange={(value) => patch(row.id, { is_active: value })}
                />
                <Button size="icon" variant="ghost" aria-label="Subir" disabled={index === 0}
                  onClick={() => run(() => reorderChild("product_quantity_offers", rows, index, index - 1))}>
                  <ArrowUp />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Descer" disabled={index === rows.length - 1}
                  onClick={() => run(() => reorderChild("product_quantity_offers", rows, index, index + 1))}>
                  <ArrowDown />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Excluir oferta"
                  onClick={() => run(() => deleteChild("product_quantity_offers", row.id))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Nome da oferta</Label>
                  <BlurInput value={row.name} onCommit={(v) => patch(row.id, { name: v.trim() })} />
                </div>
                <div className="space-y-1">
                  <Label>Quantidade</Label>
                  <BlurInput type="number" min={1} max={20} value={String(row.quantity)}
                    onCommit={(v) => patch(row.id, { quantity: Math.min(20, Math.max(1, Math.round(Number(v)) || 1)) })} />
                </div>
                <div className="space-y-1">
                  <Label>Preço total (R$)</Label>
                  <BlurInput inputMode="decimal" value={moneyText(row.total_price)}
                    onCommit={(v) => patch(row.id, { total_price: parseMoney(v) ?? 0 })} />
                </div>
                <div className="space-y-1">
                  <Label>Preço anterior (opcional)</Label>
                  <BlurInput inputMode="decimal" value={moneyText(row.old_price)}
                    onCommit={(v) => patch(row.id, { old_price: parseMoney(v) })} />
                </div>
                <div className="space-y-1">
                  <Label>Desconto % manual (opcional)</Label>
                  <BlurInput inputMode="decimal" value={moneyText(row.manual_discount)} placeholder={discount ? `Automático: ${discount}%` : "Automático"}
                    onCommit={(v) => {
                      const n = parseMoney(v);
                      patch(row.id, { manual_discount: n == null ? null : Math.min(99, n) });
                    }} />
                </div>
                <div className="space-y-1">
                  <Label>Badge</Label>
                  <BlurInput value={row.badge ?? ""} placeholder="MAIS VENDIDO"
                    onCommit={(v) => patch(row.id, { badge: v.trim() || null })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Texto auxiliar</Label>
                  <BlurInput value={row.helper_text ?? ""} placeholder="Frete grátis no kit"
                    onCommit={(v) => patch(row.id, { helper_text: v.trim() || null })} />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Switch id={`pop-${row.id}`} checked={row.is_popular}
                    onCheckedChange={(value) => patch(row.id, { is_popular: value })} />
                  <Label htmlFor={`pop-${row.id}`}>Mais popular (pré-selecionada)</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sem desconto: {brl.format(basePrice * row.quantity)} · Economia: {brl.format(savings)}
                {discount ? ` · ${discount}% off` : ""} · {brl.format(row.total_price / Math.max(1, row.quantity))} cada
              </p>
            </div>
          );
        })}
    </Panel>
  );
}

// ================= VARIAÇÕES =================

type ImageOption = { path: string; url: string };

function ImagePicker({ value, options, onPick }: { value: string | null; options: ImageOption[]; onPick: (path: string | null) => void }) {
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onPick(v === "none" ? null : v)}>
      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Sem imagem" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sem imagem</SelectItem>
        {options.map((option, index) => (
          <SelectItem key={option.path} value={option.path}>
            <span className="flex items-center gap-2">
              <img src={option.url} alt="" className="size-6 rounded object-cover" /> Imagem {index + 1}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function VariantsManager({
  productId,
  basePrice,
  attributes,
  variants,
  images,
  settings,
  onSettings,
  onChange,
}: {
  productId: string;
  basePrice: number;
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  images: ImageOption[];
  settings: VariantSettings;
  onSettings: (patch: Partial<VariantSettings>) => void;
  onChange: () => void;
}) {
  const [newAttr, setNewAttr] = useState("");
  const [newType, setNewType] = useState<AttributeDisplay>("buttons");
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onChange();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function addAttribute() {
    const name = newAttr.trim();
    if (!name) { toast.error("Informe o nome do atributo (ex.: Cor)."); return; }
    await run(() =>
      insertChild("product_attributes", {
        product_id: productId,
        name,
        display_type: /^cor(es)?$/i.test(name) ? "color" : newType,
        sort_order: attributes.length,
      }),
    );
    setNewAttr("");
  }

  async function addValues(attr: ProductAttribute) {
    const names = (newValues[attr.id] ?? "").split(/[,;\n]/).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    const { error } = await supabase.from("product_attribute_values").insert(
      names.map((name, index) => ({
        attribute_id: attr.id,
        product_id: productId,
        name,
        sort_order: attr.values.length + index,
      })) as never,
    );
    if (error) { toast.error(errorText(error)); return; }
    setNewValues((current) => ({ ...current, [attr.id]: "" }));
    onChange();
  }

  async function generate() {
    const combos = generateCombinations(attributes);
    const missing = combos.filter((combo) => !variants.some((variant) => sameCombination(variant.option_values, combo)));
    if (missing.length === 0) { toast.info("Todas as combinações já existem."); return; }
    const { error } = await supabase.from("product_variants").insert(
      missing.map((combo, index) => ({
        product_id: productId,
        option_values: combo,
        stock: 0,
        sort_order: variants.length + index,
      })) as never,
    );
    if (error) { toast.error(errorText(error)); return; }
    toast.success(`${missing.length} combinação(ões) criada(s).`);
    onChange();
  }

  const patchVariant = (id: string, values: Record<string, unknown>) => run(() => updateChild("product_variants", id, values));
  const validAttrIds = new Set(attributes.map((attr) => attr.id));
  const orphanCount = variants.filter(
    (variant) =>
      Object.keys(variant.option_values).some((key) => !validAttrIds.has(key)) ||
      attributes.some((attr) => !attr.values.some((value) => value.id === variant.option_values[attr.id])),
  ).length;

  return (
    <div className="space-y-4">
      <Panel title="Variações">
        <div className="flex items-center gap-3">
          <Switch id="variants-enabled" checked={settings.variants_enabled}
            onCheckedChange={(value) => onSettings({ variants_enabled: value })} />
          <Label htmlFor="variants-enabled">Este produto possui variações</Label>
        </div>
        {settings.variants_enabled && (
          <>
            <div className="flex items-center gap-3">
              <Switch id="track-stock" checked={settings.track_stock}
                onCheckedChange={(value) => onSettings({ track_stock: value })} />
              <Label htmlFor="track-stock">Controlar estoque (estoque 0 fica indisponível)</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="same-default" checked={settings.same_variant_default}
                onCheckedChange={(value) => onSettings({ same_variant_default: value })} />
              <Label htmlFor="same-default">Kits começam com "Usar a mesma variação em todas" marcado</Label>
            </div>
            <p className="text-xs text-muted-foreground">Clique em Salvar para aplicar estes interruptores. Atributos e combinações são gravados na hora.</p>
          </>
        )}
      </Panel>

      {settings.variants_enabled && (
        <>
          <Panel title="Atributos">
            {attributes.map((attr) => (
              <div key={attr.id} className="space-y-3 rounded-md border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                  <BlurInput value={attr.name} aria-label="Nome do atributo"
                    onCommit={(v) => run(() => updateChild("product_attributes", attr.id, { name: v.trim() || attr.name }))} />
                  <Select value={attr.display_type}
                    onValueChange={(v) => run(() => updateChild("product_attributes", attr.id, { display_type: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="color">Cor (bolinhas)</SelectItem>
                      <SelectItem value="buttons">Botões (P M G)</SelectItem>
                      <SelectItem value="list">Lista</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" aria-label="Excluir atributo"
                    onClick={() => run(() => deleteChild("product_attributes", attr.id))}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="space-y-2">
                  {attr.values.map((value) => (
                    <div key={value.id} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_180px_auto]">
                      <BlurInput value={value.name} aria-label="Nome do valor"
                        onCommit={(v) => run(() => updateChild("product_attribute_values", value.id, { name: v.trim() || value.name }))} />
                      {attr.display_type === "color" ? (
                        <input type="color" aria-label="Cor visual" className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                          value={value.color_hex ?? "#000000"}
                          onChange={(e) => run(() => updateChild("product_attribute_values", value.id, { color_hex: e.target.value }))} />
                      ) : <span />}
                      <ImagePicker value={value.image_url} options={images}
                        onPick={(path) => run(() => updateChild("product_attribute_values", value.id, { image_url: path }))} />
                      <Button size="icon" variant="ghost" aria-label="Excluir valor"
                        onClick={() => run(() => deleteChild("product_attribute_values", value.id))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input placeholder="Novos valores separados por vírgula (ex.: P, M, G, GG)"
                      value={newValues[attr.id] ?? ""}
                      onChange={(e) => setNewValues((c) => ({ ...c, [attr.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && void addValues(attr)} />
                    <Button variant="outline" onClick={() => void addValues(attr)}><Plus /> Valores</Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <Input placeholder="Novo atributo (ex.: Cor, Tamanho, Capacidade)" value={newAttr}
                onChange={(e) => setNewAttr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addAttribute()} />
              <Select value={newType} onValueChange={(v) => setNewType(v as AttributeDisplay)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="color">Cor (bolinhas)</SelectItem>
                  <SelectItem value="buttons">Botões (P M G)</SelectItem>
                  <SelectItem value="list">Lista</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => void addAttribute()}><Plus /> Atributo</Button>
            </div>
          </Panel>

          <Panel
            title={`Combinações / SKUs (${variants.length})`}
            action={
              <Button size="sm" variant="outline" onClick={() => void generate()} disabled={attributes.length === 0}>
                <Wand2 /> Gerar combinações
              </Button>
            }
          >
            {orphanCount > 0 && (
              <p className="text-xs text-destructive">
                {orphanCount} combinação(ões) usam valores removidos e não aparecem na loja. Exclua-as ou gere de novo.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Preço vazio = preço base ({brl.format(basePrice)}). Sem combinações cadastradas, todas as opções ficam disponíveis pelo preço base.
            </p>
            <div className="space-y-2">
              {variants.map((variant) => (
                <div key={variant.id} className="grid items-center gap-2 rounded-md border border-border p-2 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.6fr_1fr_auto_auto]">
                  <span className="truncate text-sm font-medium">{unitLabel(variant.option_values, attributes) || "—"}</span>
                  <BlurInput placeholder="SKU" value={variant.sku ?? ""}
                    onCommit={(v) => patchVariant(variant.id, { sku: v.trim() || null })} />
                  <BlurInput placeholder="Preço" inputMode="decimal" value={moneyText(variant.price)}
                    onCommit={(v) => patchVariant(variant.id, { price: parseMoney(v) })} />
                  <BlurInput placeholder="De" inputMode="decimal" value={moneyText(variant.old_price)}
                    onCommit={(v) => patchVariant(variant.id, { old_price: parseMoney(v) })} />
                  <BlurInput placeholder="Estoque" type="number" min={0} value={String(variant.stock)}
                    onCommit={(v) => patchVariant(variant.id, { stock: Math.max(0, Math.round(Number(v)) || 0) })} />
                  <ImagePicker value={variant.image_url} options={images}
                    onPick={(path) => patchVariant(variant.id, { image_url: path })} />
                  <Switch aria-label="Combinação ativa" checked={variant.is_active}
                    onCheckedChange={(value) => patchVariant(variant.id, { is_active: value })} />
                  <Button size="icon" variant="ghost" aria-label="Excluir combinação"
                    onClick={() => run(() => deleteChild("product_variants", variant.id))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

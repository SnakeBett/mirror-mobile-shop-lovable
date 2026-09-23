import { useState } from "react";
import { ExternalLink, GripVertical, RotateCcw } from "lucide-react";

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
import {
  DEFAULT_PAGE_SETTINGS,
  FIELD_VISIBILITY_LABELS,
  HEADER_TOGGLE_LABELS,
  SECTION_ORDER_LABELS,
  SECTION_VISIBILITY_LABELS,
  SHIPPING_TEMPLATE_DEFAULT,
  TAB_DEFAULT_LABELS,
  TEXT_DEFAULTS,
  TEXT_LABELS,
  type PageSettings,
  type SectionKey,
  type TabKey,
} from "@/lib/page-settings";

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border bg-background"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          value={value}
          placeholder="padrão do tema"
          onChange={(event) => onChange(event.target.value)}
        />
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}

export function PageSettingsPanel({
  page,
  onChange,
  onPreview,
  onSaveAndPreview,
  canPreview,
}: {
  page: PageSettings;
  onChange: (next: PageSettings) => void;
  onPreview: () => void;
  onSaveAndPreview: () => void;
  canPreview: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const patch = <K extends keyof PageSettings>(key: K, value: Partial<PageSettings[K]>) =>
    onChange({ ...page, [key]: { ...(page[key] as object), ...(value as object) } as PageSettings[K] });

  function move(from: number, to: number) {
    if (to < 0 || to >= page.section_order.length) return;
    const next = [...page.section_order];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onChange({ ...page, section_order: next });
  }

  const labelOf = (key: SectionKey) => SECTION_ORDER_LABELS.find(([id]) => id === key)?.[1] ?? key;

  return (
    <div className="space-y-4">
      <Panel title="Pré-visualização" description="Abra a página pública deste produto em uma nova aba.">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!canPreview} onClick={onPreview}>
            <ExternalLink className="size-4" /> Visualizar página
          </Button>
          <Button type="button" size="sm" disabled={!canPreview} onClick={onSaveAndPreview}>
            Salvar e visualizar
          </Button>
        </div>
      </Panel>

      <Panel title="Seções visíveis" description="Seções desativadas não aparecem na página pública.">
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTION_VISIBILITY_LABELS.map(([key, label]) => (
            <Toggle
              key={key}
              id={`sec-${key}`}
              label={label}
              checked={page.section_visibility[key]}
              onChange={(value) => patch("section_visibility", { [key]: value } as never)}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Controles específicos">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELD_VISIBILITY_LABELS.map(([key, label]) => (
            <Toggle
              key={key}
              id={`field-${key}`}
              label={label}
              checked={page.field_visibility[key]}
              onChange={(value) => patch("field_visibility", { [key]: value } as never)}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Ordem da página"
        description="Arraste para reordenar. Cabeçalho, abas e barra de compra permanecem fixos."
      >
        <ul className="space-y-2">
          {page.section_order.map((key, index) => (
            <li
              key={key}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null && dragIndex !== index) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className="flex cursor-grab items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <GripVertical className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {index + 1}. {labelOf(key)}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => move(index, index - 1)}>↑</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => move(index, index + 1)}>↓</Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Abas superiores" description="A aba some automaticamente quando a seção está desativada.">
        <div className="space-y-4">
          {(Object.keys(TAB_DEFAULT_LABELS) as TabKey[]).map((key) => (
            <div key={key} className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
              <Toggle
                id={`tab-${key}`}
                label={TAB_DEFAULT_LABELS[key]}
                checked={page.tab_settings[key]}
                onChange={(value) => patch("tab_settings", { [key]: value } as never)}
              />
              <Input
                placeholder={TAB_DEFAULT_LABELS[key]}
                value={page.tab_settings[`${key}_label` as const]}
                onChange={(event) => patch("tab_settings", { [`${key}_label`]: event.target.value } as never)}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Textos personalizados" description="Campos vazios usam o texto padrão.">
        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_LABELS.map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              placeholder={TEXT_DEFAULTS[key]}
              value={page.text_settings[key]}
              onChange={(value) => patch("text_settings", { [key]: value } as never)}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Cabeçalho">
        <div className="grid gap-3 sm:grid-cols-2">
          {HEADER_TOGGLE_LABELS.map(([key, label]) => (
            <Toggle
              key={key}
              id={`hd-${key}`}
              label={label}
              checked={page.header_settings[key] as boolean}
              onChange={(value) => patch("header_settings", { [key]: value } as never)}
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Placeholder da busca"
            placeholder="Pesquisar produtos"
            value={page.header_settings.search_placeholder}
            onChange={(value) => patch("header_settings", { search_placeholder: value })}
          />
          <div className="space-y-1.5">
            <Label className="text-xs">Comportamento da busca</Label>
            <Select
              value={page.header_settings.search_behavior}
              onValueChange={(value) => patch("header_settings", { search_behavior: value as "visual" | "products" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="visual">Apenas visual</SelectItem>
                <SelectItem value="products">Buscar produtos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Panel>

      <Panel title="Galeria">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de indicador</Label>
            <Select
              value={page.gallery_settings.indicator}
              onValueChange={(value) =>
                patch("gallery_settings", { indicator: value as "counter" | "dots" | "none" })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="counter">1/3</SelectItem>
                <SelectItem value="dots">Bolinhas</SelectItem>
                <SelectItem value="none">Nenhum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Toggle
              id="gal-thumbs"
              label="Mostrar miniaturas"
              checked={page.gallery_settings.show_thumbnails}
              onChange={(value) => patch("gallery_settings", { show_thumbnails: value })}
            />
            <Toggle
              id="gal-swipe"
              label="Permitir swipe"
              checked={page.gallery_settings.allow_swipe}
              onChange={(value) => patch("gallery_settings", { allow_swipe: value })}
            />
            <Toggle
              id="gal-zoom"
              label="Permitir clique para ampliar"
              checked={page.gallery_settings.allow_zoom}
              onChange={(value) => patch("gallery_settings", { allow_zoom: value })}
            />
          </div>
        </div>
      </Panel>

      <Panel title="Promoções">
        <div className="space-y-1.5 sm:max-w-xs">
          <Label className="text-xs">Comportamento dos chips</Label>
          <Select
            value={page.promotion_settings.layout}
            onValueChange={(value) => patch("promotion_settings", { layout: value as "scroll" | "wrap" })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scroll">Linha única com scroll horizontal</SelectItem>
              <SelectItem value="wrap">Quebrar linha</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Panel>

      <Panel title="Seção de ofertas" description="O título só aparece quando houver ao menos uma oferta ativa e válida.">
        <div className="sm:max-w-xs">
          <TextField
            label="Título"
            placeholder="Ofertas"
            value={page.offers_settings.title}
            onChange={(title) => patch("offers_settings", { title })}
          />
        </div>
      </Panel>

      <Panel title="Entrega" description="Use {min_date} e {max_date} no texto.">
        <TextField
          label="Formato do texto da entrega"
          placeholder={SHIPPING_TEMPLATE_DEFAULT}
          value={page.shipping_settings.template}
          onChange={(value) => patch("shipping_settings", { template: value })}
        />
        <div className="flex flex-wrap gap-2">
          {[
            SHIPPING_TEMPLATE_DEFAULT,
            "Receba de {min_date} até {max_date}",
            "Entrega prevista: {min_date} - {max_date}",
          ].map((model) => (
            <Button
              key={model}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch("shipping_settings", { template: model })}
            >
              {model}
            </Button>
          ))}
        </div>
      </Panel>

      <Panel title="Proteção ao cliente">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Título"
            placeholder="Proteção ao cliente"
            value={page.protection_settings.title}
            onChange={(value) => patch("protection_settings", { title: value })}
          />
          <TextField
            label="Descrição (opcional)"
            value={page.protection_settings.description}
            onChange={(value) => patch("protection_settings", { description: value })}
          />
          <TextField
            label="Benefício 1"
            value={page.protection_settings.benefit_1}
            onChange={(value) => patch("protection_settings", { benefit_1: value })}
          />
          <TextField
            label="Benefício 2"
            value={page.protection_settings.benefit_2}
            onChange={(value) => patch("protection_settings", { benefit_2: value })}
          />
          <TextField
            label="Benefício 3"
            value={page.protection_settings.benefit_3}
            onChange={(value) => patch("protection_settings", { benefit_3: value })}
          />
          <TextField
            label="Benefício 4"
            value={page.protection_settings.benefit_4}
            onChange={(value) => patch("protection_settings", { benefit_4: value })}
          />
          <TextField
            label="URL (opcional)"
            placeholder="https://..."
            value={page.protection_settings.url}
            onChange={(value) => patch("protection_settings", { url: value })}
          />
        </div>
      </Panel>

      <Panel title="Avaliações">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Quantidade inicial exibida</Label>
            <Select
              value={String(page.review_settings.initial_count)}
              onValueChange={(value) => patch("review_settings", { initial_count: Number(value) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <SelectItem key={count} value={String(count)}>{count}</SelectItem>
                ))}
                <SelectItem value="0">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Toggle
            id="rev-seemore"
            label='Mostrar botão "Ver mais"'
            checked={page.review_settings.show_see_more}
            onChange={(value) => patch("review_settings", { show_see_more: value })}
          />
        </div>
      </Panel>

      <Panel title="Barra inferior">
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle id="bb-store" label="Mostrar Loja" checked={page.bottom_bar_settings.show_store} onChange={(v) => patch("bottom_bar_settings", { show_store: v })} />
          <Toggle id="bb-chat" label="Mostrar Chat" checked={page.bottom_bar_settings.show_chat} onChange={(v) => patch("bottom_bar_settings", { show_chat: v })} />
          <Toggle id="bb-cart" label="Mostrar Carrinho" checked={page.bottom_bar_settings.show_cart} onChange={(v) => patch("bottom_bar_settings", { show_cart: v })} />
          <Toggle id="bb-buy" label="Mostrar Comprar agora" checked={page.bottom_bar_settings.show_buy} onChange={(v) => patch("bottom_bar_settings", { show_buy: v })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Texto Loja" placeholder="Loja" value={page.bottom_bar_settings.store_label} onChange={(v) => patch("bottom_bar_settings", { store_label: v })} />
          <TextField label="Texto Chat" placeholder="Chat" value={page.bottom_bar_settings.chat_label} onChange={(v) => patch("bottom_bar_settings", { chat_label: v })} />
          <TextField label="Texto Comprar agora" placeholder="usa o texto da aba Checkout" value={page.bottom_bar_settings.buy_label} onChange={(v) => patch("bottom_bar_settings", { buy_label: v })} />
          <TextField label="Subtexto do botão" placeholder="usa o subtexto da aba Checkout" value={page.bottom_bar_settings.buy_subtext} onChange={(v) => patch("bottom_bar_settings", { buy_subtext: v })} />
          <TextField label="URL do botão Loja" placeholder="https://..." value={page.bottom_bar_settings.store_url} onChange={(v) => patch("bottom_bar_settings", { store_url: v })} />
          <TextField label="URL do Carrinho" placeholder="https://..." value={page.bottom_bar_settings.cart_url} onChange={(v) => patch("bottom_bar_settings", { cart_url: v })} />
        </div>
        <Toggle
          id="bb-main"
          label="Usar checkout principal no botão Comprar agora"
          checked={page.bottom_bar_settings.use_main_checkout}
          onChange={(v) => patch("bottom_bar_settings", { use_main_checkout: v })}
        />
        {!page.bottom_bar_settings.use_main_checkout && (
          <TextField
            label="URL do Comprar agora"
            placeholder="https://..."
            value={page.bottom_bar_settings.buy_url}
            onChange={(v) => patch("bottom_bar_settings", { buy_url: v })}
          />
        )}
        <div className="space-y-1.5 sm:max-w-xs">
          <Label className="text-xs">Comportamento do botão Comprar agora</Label>
          <Select
            value={page.bottom_bar_settings.buy_target}
            onValueChange={(value) => patch("bottom_bar_settings", { buy_target: value as "same" | "new" })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="same">Abrir checkout na mesma aba</SelectItem>
              <SelectItem value="new">Abrir checkout em nova aba</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Panel>

      <Panel title="Chat">
        <div className="space-y-1.5 sm:max-w-xs">
          <Label className="text-xs">Tipo de chat</Label>
          <Select
            value={page.bottom_bar_settings.chat_type}
            onValueChange={(value) =>
              patch("bottom_bar_settings", { chat_type: value as "none" | "whatsapp" | "url" })
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="url">URL personalizada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {page.bottom_bar_settings.chat_type === "whatsapp" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Número (com DDI)"
              placeholder="5511999999999"
              value={page.bottom_bar_settings.whatsapp_number}
              onChange={(v) => patch("bottom_bar_settings", { whatsapp_number: v })}
            />
            <TextField
              label="Mensagem inicial ({product.name} disponível)"
              value={page.bottom_bar_settings.whatsapp_message}
              onChange={(v) => patch("bottom_bar_settings", { whatsapp_message: v })}
            />
          </div>
        )}
        {page.bottom_bar_settings.chat_type === "url" && (
          <TextField
            label="URL do Chat"
            placeholder="https://..."
            value={page.bottom_bar_settings.chat_url}
            onChange={(v) => patch("bottom_bar_settings", { chat_url: v })}
          />
        )}
      </Panel>

      <Panel title="Cores" description="Sem valor informado, o produto usa exatamente as cores padrão do projeto.">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Cor principal" value={page.color_settings.primary} onChange={(v) => patch("color_settings", { primary: v })} />
          <ColorField label="Cor secundária (opcional)" value={page.color_settings.secondary} onChange={(v) => patch("color_settings", { secondary: v })} />
          <ColorField label="Cor do botão Comprar agora" value={page.color_settings.buy} onChange={(v) => patch("color_settings", { buy: v })} />
          <ColorField label="Cor do preço" value={page.color_settings.price} onChange={(v) => patch("color_settings", { price: v })} />
        </div>
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
            <span className="text-sm">Remover as cores personalizadas deste produto?</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                onChange({ ...page, color_settings: { ...DEFAULT_PAGE_SETTINGS.color_settings } });
                setConfirmReset(false);
              }}
            >
              Restaurar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="size-4" /> Restaurar estilo padrão
          </Button>
        )}
      </Panel>
    </div>
  );
}

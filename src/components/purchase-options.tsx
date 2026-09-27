import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  isValueSelectable,
  kitSavings,
  type ProductAttribute,
  type ProductVariant,
  type QuantityOffer,
  type UnitSelection,
  type VariantSettings,
} from "@/lib/variants";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type PurchaseSelection = {
  kitId: string | null;
  sameForAll: boolean;
  units: UnitSelection[];
};

type Props = {
  basePrice: number;
  kits: QuantityOffer[];
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  settings: VariantSettings;
  selection: PurchaseSelection;
  onChange: (next: PurchaseSelection) => void;
  error: string | null;
  summary: { lines: string[]; total: number; offerName: string | null; quantity: number } | null;
};

function safeHex(value: string | null) {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null;
}

function AttributePicker({
  attr,
  unit,
  attributes,
  variants,
  settings,
  onPick,
  unitIndex,
}: {
  attr: ProductAttribute;
  unit: UnitSelection;
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  settings: VariantSettings;
  onPick: (valueId: string) => void;
  unitIndex: number;
}) {
  const chosen = attr.values.find((value) => value.id === unit[attr.id]);
  return (
    <div className="variant-attr" role="radiogroup" aria-label={`${attr.name} — unidade ${unitIndex + 1}`}>
      <p className="variant-attr-label">
        {attr.name}: <b>{chosen?.name ?? "Selecione"}</b>
      </p>
      <div className={cn("variant-options", attr.display_type === "list" && "variant-options-list")}>
        {attr.values.map((value) => {
          const selectable = isValueSelectable(attr.id, value.id, unit, attributes, variants, settings);
          const active = unit[attr.id] === value.id;
          const hex = attr.display_type === "color" ? safeHex(value.color_hex) : null;
          return (
            <button
              key={value.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!selectable}
              className={cn("variant-option", active && "variant-option-active", hex && "variant-option-color")}
              onClick={() => onPick(value.id)}
            >
              {attr.display_type === "color" && value.image_url ? (
                <img src={value.image_url} alt="" width={22} height={22} loading="lazy" />
              ) : hex ? (
                <span className="variant-swatch" style={{ background: hex }} aria-hidden="true" />
              ) : null}
              <span>{value.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PurchaseOptions({
  basePrice,
  kits,
  attributes,
  variants,
  settings,
  selection,
  onChange,
  error,
  summary,
}: Props) {
  const kit = kits.find((row) => row.id === selection.kitId) ?? null;
  const quantity = kit?.quantity ?? 1;
  const showVariants = attributes.length > 0;
  const unitCount = showVariants ? (quantity > 1 && !selection.sameForAll ? quantity : 1) : 0;

  const pick = (unitIndex: number, attrId: string, valueId: string) => {
    const units = [...selection.units];
    units[unitIndex] = { ...(units[unitIndex] ?? {}), [attrId]: valueId };
    onChange({ ...selection, units });
  };

  return (
    <section className="product-padding purchase-options" aria-label="Opções de compra">
      {kits.length > 0 && (
        <div className="kit-list" role="radiogroup" aria-label="Quantidade">
          {kits.map((row) => {
            const active = row.id === selection.kitId;
            const savings = kitSavings(row, basePrice);
            return (
              <button
                key={row.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={cn("kit-card", active && "kit-card-active")}
                onClick={() => onChange({ ...selection, kitId: row.id })}
              >
                <span className="kit-radio" aria-hidden="true">{active && <Check />}</span>
                <span className="kit-main">
                  <span className="kit-name">{row.name || `${row.quantity} ${row.quantity > 1 ? "unidades" : "unidade"}`}</span>
                  {row.helper_text && <span className="kit-helper">{row.helper_text}</span>}
                  {row.quantity > 1 && (
                    <span className="kit-each">{currency.format(Number(row.total_price) / row.quantity)} cada</span>
                  )}
                </span>
                <span className="kit-side">
                  {row.badge?.trim() && <span className="kit-badge">{row.badge.trim()}</span>}
                  <strong>{currency.format(Number(row.total_price))}</strong>
                  {savings > 0 && <span className="kit-savings">Economize {currency.format(savings)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {showVariants && (
        <div className="variant-block">
          {quantity > 1 && (
            <label className="variant-same">
              <input
                type="checkbox"
                checked={selection.sameForAll}
                onChange={(event) => onChange({ ...selection, sameForAll: event.target.checked })}
              />
              <span>Usar a mesma variação em todas</span>
            </label>
          )}
          {Array.from({ length: unitCount }, (_, unitIndex) => (
            <div key={unitIndex} className={cn(unitCount > 1 && "variant-unit")}>
              {unitCount > 1 && <p className="variant-unit-title">Unidade {unitIndex + 1}</p>}
              {attributes.map((attr) => (
                <AttributePicker
                  key={attr.id}
                  attr={attr}
                  unit={selection.units[unitIndex] ?? {}}
                  attributes={attributes}
                  variants={variants}
                  settings={settings}
                  unitIndex={unitIndex}
                  onPick={(valueId) => pick(unitIndex, attr.id, valueId)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {summary && summary.lines.length > 0 && (
        <div className="purchase-summary" aria-live="polite">
          <p>
            <b>{summary.offerName ?? "Seu pedido"}</b> · {summary.quantity} {summary.quantity > 1 ? "unidades" : "unidade"}
          </p>
          <ul>
            {summary.lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          <p className="purchase-summary-total">Total: <b>{currency.format(summary.total)}</b></p>
        </div>
      )}

      {error && (
        <p className="purchase-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

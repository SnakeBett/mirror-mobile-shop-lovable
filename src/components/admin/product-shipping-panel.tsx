import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Escolha de frete do checkout próprio para um produto. */
export function ProductShippingPanel({ digital, mode, ids, onMode, onIds }: {
  digital: boolean; mode: string; ids: string[]; onMode: (v: string) => void; onIds: (v: string[]) => void;
}) {
  const q = useQuery({
    queryKey: ["admin", "shipping-methods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shipping_methods").select("*").order("sort_order");
      if (error) throw error;
      return data.map((m) => ({ ...m, price: Number(m.price) }));
    },
  });
  const methods = q.data ?? [];
  return (
    <section className="mb-4 space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Frete no checkout próprio</h3>
      {digital ? (
        <p className="text-sm text-muted-foreground">Produto digital: o checkout não pede endereço nem frete.</p>
      ) : (
        <>
          <select value={mode} onChange={(e) => onMode(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="legacy">Usar o campo "Taxa de envio" (como antes)</option>
            <option value="global">Todos os métodos de frete ativos</option>
            <option value="selected">Somente os métodos escolhidos abaixo</option>
            <option value="free">Frete grátis para este produto</option>
          </select>
          {(mode === "global" || mode === "selected") && (
            <div className="space-y-1.5">
              {methods.length === 0 && <p className="text-sm text-muted-foreground">Nenhum método cadastrado. <Link to="/admin/entrega/fretes" className="underline">Cadastrar métodos</Link></p>}
              {methods.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  {mode === "selected" && (
                    <input type="checkbox" checked={ids.includes(m.id)} onChange={(e) => onIds(e.target.checked ? [...ids, m.id] : ids.filter((x) => x !== m.id))} />
                  )}
                  <span className={m.is_active ? "" : "text-muted-foreground line-through"}>{m.name}</span>
                  <span className="text-muted-foreground">· {m.price <= 0 ? "Grátis" : brl.format(m.price)}{m.is_active ? "" : " (inativo)"}</span>
                </label>
              ))}
              {mode === "selected" && methods.length > 0 && ids.length === 0 && <p className="text-xs text-destructive">Escolha ao menos um método, senão o checkout não terá entrega.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

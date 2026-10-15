import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";

type Props = {
  mode: string;
  gatewayId: string | null;
  onModeChange: (mode: string) => void;
  onGatewayChange: (id: string | null) => void;
};

export function ProductCheckoutModePanel({ mode, gatewayId, onModeChange, onGatewayChange }: Props) {
  const gateways = useQuery({ queryKey: ["admin", "gateways"], queryFn: async () => (await supabase.from("payment_gateways").select("*").order("name")).data ?? [] });
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Tipo de checkout</h2>
      <div className="space-y-1.5">
        <Label htmlFor="checkout-mode">Modalidade</Label>
        <select id="checkout-mode" value={mode} onChange={(e) => onModeChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="external">Checkout externo (links abaixo)</option>
          <option value="own">Checkout próprio via Pix</option>
        </select>
        <p className="text-xs text-muted-foreground">Os links externos continuam salvos mesmo usando o checkout próprio.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="checkout-gateway">Gateway de pagamento</Label>
        <select id="checkout-gateway" value={gatewayId ?? ""} onChange={(e) => onGatewayChange(e.target.value || null)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Usar gateway padrão</option>
          {(gateways.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}{g.integration_status === "pending_docs" ? " (pendente)" : ""}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

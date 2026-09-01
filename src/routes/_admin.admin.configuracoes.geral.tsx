import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAppSettings, updateAppSettings } from "@/lib/analytics-queries";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/tracking";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "UTC",
];
const CURRENCIES = ["BRL", "USD", "EUR"];

export const Route = createFileRoute("/_admin/admin/configuracoes/geral")({
  head: () => ({
    meta: [
      { title: "Configurações gerais | Vitrine Admin" },
      { name: "description", content: "Fuso horário, moeda e pixels de rastreamento da loja." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Configurações gerais | Vitrine Admin" },
      { property: "og:description", content: "Fuso horário, moeda e pixels de rastreamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: getAppSettings });
  const [form, setForm] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => updateAppSettings(form),
    onSuccess: () => {
      toast.success("Configurações salvas");
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const field = (key: keyof AppSettings, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={(form[key] as string | null) ?? ""}
        placeholder={placeholder ?? ""}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value || null }))}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground">Configurações gerais</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Fuso horário e moeda afetam todos os relatórios. Os pixels valem para todos os produtos que
        não tiverem IDs próprios.
      </p>

      <div className="mt-6 space-y-4 rounded-lg border border-border bg-background p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Fuso horário</Label>
            <select
              id="timezone"
              value={form.timezone}
              onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Moeda</Label>
            <select
              id="currency"
              value={form.currency}
              onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="pt-2 text-sm font-semibold text-foreground">Pixels globais</h2>
        {field("meta_pixel_id", "Meta Pixel ID", "1234567890")}
        {field("tiktok_pixel_id", "TikTok Pixel ID", "CXXXXXXXXXXXXXXX")}
        {field("ga_measurement_id", "Google Analytics (GA4)", "G-XXXXXXX")}

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </div>
  );
}

import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, LayoutDashboard, LogOut, Package, Receipt, Store } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { claimAdminIfFirst } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });

    try {
      await claimAdminIfFirst();
    } catch {
      // ignora: já existe admin ou a verificação falhou temporariamente
    }

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: data.user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      await supabase.auth.signOut();
      throw redirect({ to: "/admin/login" });
    }

    return { user: data.user };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function openStore() {
    const { data } = await supabase
      .from("products")
      .select("slug")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    window.open(data?.slug ? `/produto/${data.slug}` : "/", "_blank", "noopener");
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-background p-4 md:flex">
        <span className="px-2 text-sm font-semibold text-foreground">Vitrine Admin</span>
        <nav className="mt-6 flex flex-col gap-1">
          <Link
            to="/admin"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LayoutDashboard className="size-4" /> Dashboard
          </Link>
          <Link
            to="/admin/produtos"
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Package className="size-4" /> Produtos
          </Link>
          <Link
            to="/admin/vendas"
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <BarChart3 className="size-4" /> Vendas
          </Link>
          <Link
            to="/admin/pedidos"
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Receipt className="size-4" /> Pedidos
          </Link>
          <button
            type="button"
            onClick={openStore}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Store className="size-4" /> Ver loja
          </button>
        </nav>
        <Button variant="ghost" className="mt-auto justify-start gap-2 text-sm" onClick={signOut}>
          <LogOut className="size-4" /> Sair
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3 md:hidden">
          <span className="text-sm font-semibold">Vitrine Admin</span>
          <div className="flex gap-1">
            <Link to="/admin" className="rounded-md px-2 py-1 text-sm text-muted-foreground">Início</Link>
            <Link to="/admin/produtos" className="rounded-md px-2 py-1 text-sm text-muted-foreground">Produtos</Link>
            <Link to="/admin/vendas" className="rounded-md px-2 py-1 text-sm text-muted-foreground">Vendas</Link>
            <Link to="/admin/pedidos" className="rounded-md px-2 py-1 text-sm text-muted-foreground">Pedidos</Link>
            <Button variant="ghost" size="sm" onClick={openStore}>Loja</Button>
            <Button variant="ghost" size="sm" onClick={signOut}>Sair</Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

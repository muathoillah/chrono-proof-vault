import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-primary" />
            ForensicVault
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Keluar
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-muted-foreground">
        SHA-256 · Merkle Tree · Ed25519 · Chain of Custody
      </footer>
    </div>
  );
}

export function Hash({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <code
      className={cn("break-all font-mono text-xs text-muted-foreground", className)}
      title={value}
    >
      {value}
    </code>
  );
}

const statusStyles: Record<string, string> = {
  VALID: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  SEALED: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  UNSEALED: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  TAMPERED: "border-red-500/40 bg-red-500/10 text-red-400",
  CHAIN_BROKEN: "border-red-500/40 bg-red-500/10 text-red-400",
  OPEN: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  CLOSED: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[11px]", statusStyles[status] ?? "")}>
      {status}
    </Badge>
  );
}

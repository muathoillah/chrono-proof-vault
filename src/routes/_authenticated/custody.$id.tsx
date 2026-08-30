import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import { getCustodyLog, addCustodyEntry } from "@/lib/evidence.functions";
import { AppShell, Hash, StatusBadge } from "@/components/forensic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Action = "TRANSFERRED" | "ANALYZED" | "VIEWED" | "RETURNED";

export const Route = createFileRoute("/_authenticated/custody/$id")({
  head: () => ({
    meta: [
      { title: "Chain of Custody — ForensicVault" },
      {
        name: "description",
        content: "Timeline chain of custody bukti digital: aktor, aksi, waktu, dan snapshot hash.",
      },
      { property: "og:title", content: "Chain of Custody — ForensicVault" },
      { property: "og:description", content: "Riwayat penanganan bukti digital beserta snapshot hash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustodyPage,
});

function CustodyPage() {
  const { id } = Route.useParams();
  const fetchLog = useServerFn(getCustodyLog);
  const addEntry = useServerFn(addCustodyEntry);
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action>("ANALYZED");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["custody", id],
    queryFn: () => fetchLog({ data: { evidenceId: id } }),
  });

  const add = useMutation({
    mutationFn: () => addEntry({ data: { evidenceId: id, action, notes } }),
    onSuccess: () => {
      toast.success("Entri custody ditambahkan");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["custody", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Memuat log custody…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/cases/$id"
        params={{ id: data.evidence.case_id }}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Kembali ke kasus
      </Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chain of Custody</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.evidence.filename}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={data.evidence.status} />
          <Button asChild size="sm" variant="secondary">
            <Link to="/verify/$id" params={{ id }}>
              Verifikasi
            </Link>
          </Button>
        </div>
      </div>

      <Card className="mt-6 border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tambah entri</CardTitle>
          <CardDescription>Setiap aksi dicatat bersama snapshot chain_hash saat itu.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Aksi</Label>
              <Select value={action} onValueChange={(v) => setAction(v as Action)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRANSFERRED">TRANSFERRED</SelectItem>
                  <SelectItem value="ANALYZED">ANALYZED</SelectItem>
                  <SelectItem value="VIEWED">VIEWED</SelectItem>
                  <SelectItem value="RETURNED">RETURNED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[220px] flex-1 space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Diserahkan ke analis lab"
              />
            </div>
            <Button type="submit" disabled={add.isPending}>
              <PlusCircle className="mr-2 h-4 w-4" /> Catat
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Timeline ({data.log.length})
      </h2>
      <ol className="mt-3 space-y-4 border-l border-border/60 pl-5">
        {data.log.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={entry.action === "TAMPER_SIMULATED" ? "TAMPERED" : "SEALED"} />
              <span className="font-mono text-xs">{entry.action}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString("id-ID")} · {entry.actor_email}
              </span>
            </div>
            {entry.notes && <p className="mt-1 text-sm text-muted-foreground">{entry.notes}</p>}
            <div className="mt-1 text-xs">
              <span className="text-muted-foreground">hash_snapshot: </span>
              <Hash value={entry.hash_snapshot} />
            </div>
          </li>
        ))}
      </ol>
    </AppShell>
  );
}

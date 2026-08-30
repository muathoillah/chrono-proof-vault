import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { FolderPlus, ArrowRight, ShieldAlert, ShieldCheck, Files } from "lucide-react";
import { listCases, createCase } from "@/lib/evidence.functions";
import { AppShell, StatusBadge } from "@/components/forensic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard Bukti Digital — ForensicVault" },
      {
        name: "description",
        content:
          "Dashboard verifikasi integritas bukti digital dengan hash chain SHA-256, Merkle Tree, dan digital signature Ed25519.",
      },
      { property: "og:title", content: "Dashboard Bukti Digital — ForensicVault" },
      {
        property: "og:description",
        content: "Pantau kasus, bukti, dan status integritas repositori bukti digital.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchCases = useServerFn(listCases);
  const submitCase = useServerFn(createCase);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchCases(),
  });

  const create = useMutation({
    mutationFn: (input: { title: string; description: string }) => submitCase({ data: input }),
    onSuccess: () => {
      toast.success("Kasus baru dibuat");
      setTitle("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalEvidence = (cases ?? []).reduce((a, c) => a + c.evidence_count, 0);
  const totalTampered = (cases ?? []).reduce((a, c) => a + c.tampered_count, 0);
  const totalSealed = (cases ?? []).reduce((a, c) => a + c.sealed_count, 0);

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Digital Evidence Repository</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Setiap artefak di-hash dengan SHA-256, dirantai ke bukti sebelumnya (hash chain), lalu
        disegel dalam Merkle batch yang root-nya ditandatangani Ed25519.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Files className="h-4 w-4" />} label="Total bukti" value={totalEvidence} />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}
          label="Tersegel (sealed)"
          value={totalSealed}
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4 text-red-400" />}
          label="Terdeteksi tamper"
          value={totalTampered}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Daftar kasus
          </h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat kasus…</p>
          ) : (cases ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kasus.</p>
          ) : (
            <div className="space-y-3">
              {(cases ?? []).map((c) => (
                <Card key={c.id} className="border-border/60">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{c.title}</CardTitle>
                      <StatusBadge status={c.tampered_count > 0 ? "TAMPERED" : c.status} />
                    </div>
                    <CardDescription>{c.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.evidence_count} bukti · {c.sealed_count} sealed · {c.tampered_count} tamper
                    </span>
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/cases/$id" params={{ id: c.id }}>
                        Buka <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Kasus baru
          </h2>
          <Card className="border-border/60">
            <CardContent className="pt-6">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!title.trim()) return;
                  create.mutate({ title: title.trim(), description: description.trim() });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="title">Judul kasus</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Investigasi Insiden #2026-04"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Deskripsi</Label>
                  <Textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Ringkasan singkat kasus"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  {create.isPending ? "Menyimpan…" : "Buat kasus"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-3 py-5">
        <span className="rounded-md border border-border/60 bg-muted/40 p-2">{icon}</span>
        <div>
          <div className="font-mono text-xl">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

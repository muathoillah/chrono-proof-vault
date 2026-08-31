import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Lock, Download, ShieldCheck, History, Bug } from "lucide-react";
import { getCaseDetail, uploadEvidence, sealBatch, exportProof, simulateTamper } from "@/lib/evidence.functions";
import { AppShell, Hash, StatusBadge } from "@/components/forensic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/cases/$id")({
  head: () => ({
    meta: [
      { title: "Detail Kasus — ForensicVault" },
      {
        name: "description",
        content: "Kelola bukti digital: unggah artefak, segel Merkle batch, dan pantau rantai hash.",
      },
      { property: "og:title", content: "Detail Kasus — ForensicVault" },
      { property: "og:description", content: "Unggah bukti, segel batch Merkle, dan ekspor proof report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaseDetailPage,
});

function CaseDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getCaseDetail);
  const doUpload = useServerFn(uploadEvidence);
  const doSeal = useServerFn(sealBatch);
  const doExport = useServerFn(exportProof);
  const doTamper = useServerFn(simulateTamper);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: () => fetchDetail({ data: { caseId: id } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["case", id] });

  const seal = useMutation({
    mutationFn: () => doSeal({ data: { caseId: id } }),
    onSuccess: (r) => {
      toast.success(`Batch tersegel: ${r.count} bukti, root ${r.rootHash.slice(0, 16)}…`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tamper = useMutation({
    mutationFn: (input: { evidenceId: string; mode: "file" | "record" }) => doTamper({ data: input }),
    onSuccess: () => {
      toast.warning("Simulasi manipulasi dijalankan. Jalankan verifikasi untuk mendeteksi.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      toast.error("Pilih file terlebih dahulu");
      return;
    }
    const fd = new FormData();
    fd.append("caseId", id);
    fd.append("file", file);
    setUploading(true);
    try {
      const r = await doUpload({ data: fd });
      toast.success(`Terunggah. SHA-256: ${r.fileHash.slice(0, 16)}…`);
      if (fileInput.current) fileInput.current.value = "";
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah");
    } finally {
      setUploading(false);
    }
  }

  async function onExport() {
    try {
      const report = await doExport({ data: { caseId: id } });
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proof-report-${id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Proof report diunduh");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengekspor");
    }
  }

  if (isLoading || !data) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Memuat kasus…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{data.case.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{data.case.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => seal.mutate()} disabled={seal.isPending}>
            <Lock className="mr-2 h-4 w-4" /> Seal batch
          </Button>
          <Button size="sm" variant="secondary" onClick={onExport}>
            <Download className="mr-2 h-4 w-4" /> Proof report
          </Button>
        </div>
      </div>

      <Card className="mt-6 border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Unggah bukti</CardTitle>
          <CardDescription>
            File di-hash SHA-256 di server, lalu dirantai ke chain_hash bukti terakhir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={onUpload}>
            <div className="min-w-[240px] flex-1 space-y-2">
              <Label htmlFor="file">Artefak (maks 50MB)</Label>
              <Input id="file" type="file" ref={fileInput} />
            </div>
            <Button type="submit" disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" /> {uploading ? "Mengunggah…" : "Unggah & hash"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Rantai bukti ({data.evidence.length})
      </h2>
      <div className="mt-3 space-y-3">
        {data.evidence.map((ev, i) => (
          <Card key={ev.id} className="border-border/60">
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="font-medium">{ev.filename}</span>
                  <StatusBadge status={ev.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/verify/$id" params={{ id: ev.id }}>
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Verifikasi
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/custody/$id" params={{ id: ev.id }}>
                      <History className="mr-1 h-3.5 w-3.5" /> Custody
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" disabled={tamper.isPending}>
                        <Bug className="mr-1 h-3.5 w-3.5" /> Simulasi
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => tamper.mutate({ evidenceId: ev.id, mode: "file" })}
                      >
                        Ubah konten file
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => tamper.mutate({ evidenceId: ev.id, mode: "record" })}
                      >
                        Ubah record hash
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <dl className="grid gap-1 text-xs sm:grid-cols-[130px_1fr]">
                <dt className="text-muted-foreground">file_hash</dt>
                <dd>
                  <Hash value={ev.file_hash} />
                </dd>
                <dt className="text-muted-foreground">prev_chain_hash</dt>
                <dd>
                  <Hash value={ev.prev_chain_hash} />
                </dd>
                <dt className="text-muted-foreground">chain_hash</dt>
                <dd>
                  <Hash value={ev.chain_hash} className="text-foreground" />
                </dd>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Merkle batches ({data.batches.length})
      </h2>
      <div className="mt-3 space-y-3">
        {data.batches.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada batch tersegel.</p>
        )}
        {data.batches.map((b) => (
          <Card key={b.id} className="border-border/60">
            <CardContent className="space-y-2 py-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {b.evidence_count} bukti · {new Date(b.sealed_at).toLocaleString("id-ID")}
                </span>
                <StatusBadge status="SEALED" />
              </div>
              <div>
                <span className="text-muted-foreground">root_hash: </span>
                <Hash value={b.root_hash} className="text-foreground" />
              </div>
              <div>
                <span className="text-muted-foreground">signature (Ed25519): </span>
                <Hash value={b.signature} />
              </div>
              <div>
                <span className="text-muted-foreground">public_key: </span>
                <Hash value={b.public_key} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

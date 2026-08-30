import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { Check, X, Minus, ShieldCheck } from "lucide-react";
import { verifyEvidence } from "@/lib/evidence.functions";
import { AppShell, Hash, StatusBadge } from "@/components/forensic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/verify/$id")({
  head: () => ({
    meta: [
      { title: "Verifikasi Integritas Bukti — ForensicVault" },
      {
        name: "description",
        content:
          "Integrity verification engine: re-hash artefak, cek hash chain, Merkle proof, dan digital signature.",
      },
      { property: "og:title", content: "Verifikasi Integritas Bukti — ForensicVault" },
      {
        property: "og:description",
        content: "Hasil verifikasi bertahap: hash artefak, rantai hash, Merkle proof, signature Ed25519.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { id } = Route.useParams();
  const run = useServerFn(verifyEvidence);

  const verify = useMutation({
    mutationFn: () => run({ data: { evidenceId: id } }),
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    verify.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const result = verify.data;

  return (
    <AppShell>
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
        ← Dashboard
      </Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Integrity Verification Engine</h1>
        <Button size="sm" onClick={() => verify.mutate()} disabled={verify.isPending}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          {verify.isPending ? "Memverifikasi…" : "Verifikasi ulang"}
        </Button>
      </div>

      {verify.isPending && !result && (
        <p className="mt-6 text-sm text-muted-foreground">Menghitung ulang hash dan proof…</p>
      )}

      {result && (
        <>
          <Card className="mt-6 border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{result.filename}</CardTitle>
                <StatusBadge status={result.status} />
              </div>
              <CardDescription>
                {result.status === "VALID"
                  ? "Semua lapisan verifikasi cocok — bukti utuh."
                  : result.status === "UNSEALED"
                    ? "Hash dan rantai valid, namun bukti belum disegel dalam Merkle batch."
                    : "Perubahan terdeteksi. Bukti tidak dapat dianggap utuh."}
              </CardDescription>
            </CardHeader>
          </Card>

          <ol className="mt-4 space-y-3">
            {result.steps.map((s, i) => (
              <li key={s.step}>
                <Card className="border-border/60">
                  <CardContent className="space-y-2 py-4">
                    <div className="flex items-center gap-2">
                      <StepIcon ok={s.ok} />
                      <span className="text-sm font-medium">
                        Langkah {i + 1}: {s.label}
                      </span>
                    </div>
                    <div className="grid gap-1 text-xs sm:grid-cols-[110px_1fr]">
                      <span className="text-muted-foreground">expected</span>
                      <Hash value={s.expected} />
                      <span className="text-muted-foreground">computed</span>
                      <Hash
                        value={s.actual}
                        className={s.ok === false ? "text-red-400" : "text-foreground"}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>

          <div className="mt-6">
            <Button asChild variant="secondary" size="sm">
              <Link to="/custody/$id" params={{ id }}>
                Lihat chain of custody
              </Link>
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}

function StepIcon({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <span className="rounded-full border border-border bg-muted/40 p-1">
        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    );
  return ok ? (
    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 p-1">
      <Check className="h-3.5 w-3.5 text-emerald-400" />
    </span>
  ) : (
    <span className="rounded-full border border-red-500/40 bg-red-500/10 p-1">
      <X className="h-3.5 w-3.5 text-red-400" />
    </span>
  );
}

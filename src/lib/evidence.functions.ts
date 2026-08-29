import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  handleUploadEvidence,
  handleSealBatch,
  handleVerifyEvidence,
  handleSimulateTamper,
  handleAddCustodyEntry,
  handleExportProof,
  handleCreateCase,
} from "./evidence.server";

export const listCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: cases, error } = await context.supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (cases ?? []).map((c) => c.id);
    const { data: evidence } = ids.length
      ? await context.supabase.from("evidence").select("id, case_id, status").in("case_id", ids)
      : { data: [] };
    return (cases ?? []).map((c) => {
      const ev = (evidence ?? []).filter((e) => e.case_id === c.id);
      return {
        ...c,
        evidence_count: ev.length,
        tampered_count: ev.filter((e) => e.status === "TAMPERED").length,
        sealed_count: ev.filter((e) => e.status === "SEALED").length,
      };
    });
  });

export const getCaseDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ caseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const [{ data: caseRow, error }, { data: evidence }, { data: batches }] = await Promise.all([
      context.supabase.from("cases").select("*").eq("id", data.caseId).single(),
      context.supabase
        .from("evidence")
        .select("*")
        .eq("case_id", data.caseId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("merkle_batches")
        .select("*")
        .eq("case_id", data.caseId)
        .order("sealed_at", { ascending: true }),
    ]);
    if (error || !caseRow) throw new Error("Kasus tidak ditemukan");
    return { case: caseRow, evidence: evidence ?? [], batches: batches ?? [] };
  });

export const getCustodyLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ evidenceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const [{ data: ev, error }, { data: log }] = await Promise.all([
      context.supabase.from("evidence").select("*").eq("id", data.evidenceId).single(),
      context.supabase
        .from("custody_log")
        .select("*")
        .eq("evidence_id", data.evidenceId)
        .order("created_at", { ascending: false }),
    ]);
    if (error || !ev) throw new Error("Bukti tidak ditemukan");
    return { evidence: ev, log: log ?? [] };
  });

export const createCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).optional() }).parse(data),
  )
  .handler(async ({ data, context }) =>
    handleCreateCase(context.supabase, context.userId, data.title, data.description ?? ""),
  );

export const uploadEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected FormData");
    return data;
  })
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string) ?? context.userId;
    return handleUploadEvidence(context.supabase, context.userId, email, data);
  });

export const sealBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ caseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string) ?? context.userId;
    return handleSealBatch(context.supabase, context.userId, email, data.caseId);
  });

export const verifyEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ evidenceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => handleVerifyEvidence(context.supabase, data.evidenceId));

export const simulateTamper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ evidenceId: z.string().uuid(), mode: z.enum(["file", "record"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string) ?? context.userId;
    return handleSimulateTamper(context.supabase, context.userId, email, data.evidenceId, data.mode);
  });

export const addCustodyEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        evidenceId: z.string().uuid(),
        action: z.enum(["TRANSFERRED", "ANALYZED", "VIEWED", "RETURNED"]),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string) ?? context.userId;
    return handleAddCustodyEntry(context.supabase, context.userId, email, data.evidenceId, data.action, data.notes ?? "");
  });

export const exportProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ caseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => handleExportProof(context.supabase, data.caseId));

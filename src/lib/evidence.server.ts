import type { SupabaseClient } from "@supabase/supabase-js";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  sha256Hex,
  computeChainHash,
  buildMerkleTree,
  verifyMerkleProof,
  toHex,
  fromHex,
  type MerkleProofStep,
} from "./crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

export interface EvidenceRow {
  id: string;
  case_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  file_hash: string;
  prev_chain_hash: string | null;
  chain_hash: string;
  batch_id: string | null;
  merkle_proof: MerkleProofStep[] | null;
  status: string;
  uploaded_by_email: string | null;
  created_at: string;
}

export interface VerifyStep {
  step: string;
  label: string;
  expected: string;
  actual: string;
  ok: boolean | null; // null = skipped
}

export interface VerifyResult {
  evidenceId: string;
  filename: string;
  status: "VALID" | "TAMPERED" | "CHAIN_BROKEN" | "UNSEALED";
  steps: VerifyStep[];
}

async function getSigningKeys(): Promise<{ priv: Uint8Array; pubHex: string }> {
  const seed = process.env["EVIDENCE_SIGNING_SEED"];
  if (!seed) throw new Error("EVIDENCE_SIGNING_SEED is not configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const priv = new Uint8Array(digest);
  return { priv, pubHex: toHex(ed25519.getPublicKey(priv)) };
}

export async function handleUploadEvidence(
  supabase: Client,
  userId: string,
  email: string,
  formData: FormData,
) {
  const file = formData.get("file");
  const caseId = String(formData.get("caseId") ?? "");
  if (!(file instanceof File)) throw new Error("File is required");
  if (!caseId) throw new Error("caseId is required");
  if (file.size > 50 * 1024 * 1024) throw new Error("File too large (max 50MB)");
  if (file.name.length > 200) throw new Error("Filename too long");

  const buffer = await file.arrayBuffer();
  const fileHash = await sha256Hex(buffer);
  const createdAt = new Date().toISOString();

  const { data: lastRows, error: lastErr } = await supabase
    .from("evidence")
    .select("chain_hash")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (lastErr) throw new Error(lastErr.message);
  const prevChainHash: string | null = lastRows?.[0]?.chain_hash ?? null;
  const chainHash = await computeChainHash(prevChainHash, fileHash, createdAt, email);

  const storagePath = `${caseId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: upErr } = await supabase.storage
    .from("evidence-files")
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });
  if (upErr) throw new Error(upErr.message);

  const { data: inserted, error: insErr } = await supabase
    .from("evidence")
    .insert({
      case_id: caseId,
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      storage_path: storagePath,
      file_hash: fileHash,
      prev_chain_hash: prevChainHash,
      chain_hash: chainHash,
      uploaded_by: userId,
      uploaded_by_email: email,
      created_at: createdAt,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);

  await supabase.from("custody_log").insert({
    evidence_id: inserted.id,
    case_id: caseId,
    actor: userId,
    actor_email: email,
    action: "COLLECTED",
    notes: "Bukti diunggah dan di-hash (SHA-256), dirantai ke bukti sebelumnya.",
    hash_snapshot: chainHash,
  });

  return { id: inserted.id as string, fileHash, chainHash };
}

export async function handleSealBatch(supabase: Client, userId: string, email: string, caseId: string) {
  const { data: rows, error } = await supabase
    .from("evidence")
    .select("id, chain_hash")
    .eq("case_id", caseId)
    .eq("status", "UNSEALED")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) throw new Error("Tidak ada bukti berstatus UNSEALED pada kasus ini");

  const leaves = rows.map((r: { chain_hash: string }) => r.chain_hash);
  const tree = await buildMerkleTree(leaves);
  const { priv, pubHex } = await getSigningKeys();
  const signature = toHex(ed25519.sign(fromHex(tree.root), priv));

  const { data: batch, error: bErr } = await supabase
    .from("merkle_batches")
    .insert({
      case_id: caseId,
      root_hash: tree.root,
      signature,
      public_key: pubHex,
      evidence_count: rows.length,
      sealed_by: userId,
      sealed_by_email: email,
    })
    .select("id, root_hash, sealed_at")
    .single();
  if (bErr) throw new Error(bErr.message);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as { id: string; chain_hash: string };
    const { error: uErr } = await supabase
      .from("evidence")
      .update({ batch_id: batch.id, merkle_proof: tree.proofs[i], status: "SEALED" })
      .eq("id", row.id);
    if (uErr) throw new Error(uErr.message);
    await supabase.from("custody_log").insert({
      evidence_id: row.id,
      case_id: caseId,
      actor: userId,
      actor_email: email,
      action: "SEALED",
      notes: `Dimasukkan ke Merkle batch ${batch.id.slice(0, 8)}…, root hash ditandatangani Ed25519.`,
      hash_snapshot: row.chain_hash,
    });
  }

  return { batchId: batch.id as string, rootHash: tree.root, layers: tree.layers, count: rows.length };
}

export async function handleVerifyEvidence(supabase: Client, evidenceId: string): Promise<VerifyResult> {
  const { data: ev, error } = await supabase.from("evidence").select("*").eq("id", evidenceId).single();
  if (error || !ev) throw new Error("Bukti tidak ditemukan");
  const evidence = ev as EvidenceRow;
  const steps: VerifyStep[] = [];

  // Step 1: re-hash the stored artifact
  let actualFileHash = "(file tidak ditemukan)";
  let fileOk = false;
  const { data: blob, error: dlErr } = await supabase.storage
    .from("evidence-files")
    .download(evidence.storage_path);
  if (!dlErr && blob) {
    actualFileHash = await sha256Hex(await blob.arrayBuffer());
    fileOk = actualFileHash === evidence.file_hash;
  }
  steps.push({
    step: "FILE_HASH",
    label: "Hash artefak (SHA-256)",
    expected: evidence.file_hash,
    actual: actualFileHash,
    ok: fileOk,
  });

  // Step 2: recompute the hash chain from the first evidence up to this one
  const { data: chainRows } = await supabase
    .from("evidence")
    .select("*")
    .eq("case_id", evidence.case_id)
    .order("created_at", { ascending: true });
  let chainOk = false;
  let computedChain = "(tidak dapat dihitung)";
  if (chainRows) {
    const rows = chainRows as EvidenceRow[];
    let prev: string | null = null;
    for (const row of rows) {
      // A record-level tamper also breaks the stored chain pointers
      const storedFileHash = row.id === evidence.id && !fileOk ? row.file_hash : row.file_hash;
      const recomputed = await computeChainHash(
        prev,
        storedFileHash,
        new Date(row.created_at).toISOString(),
        row.uploaded_by_email ?? "",
      );
      const pointerOk = (row.prev_chain_hash ?? null) === prev;
      if (row.id === evidence.id) {
        computedChain = recomputed;
        chainOk = pointerOk && recomputed === row.chain_hash;
        break;
      }
      prev = row.chain_hash;
    }
  }
  steps.push({
    step: "CHAIN",
    label: "Hash chain (rantai antar-bukti)",
    expected: evidence.chain_hash,
    actual: computedChain,
    ok: chainOk,
  });

  // Steps 3-4: Merkle proof + signature (only when sealed)
  if (evidence.batch_id && evidence.merkle_proof) {
    const { data: batch } = await supabase
      .from("merkle_batches")
      .select("*")
      .eq("id", evidence.batch_id)
      .single();
    if (batch) {
      const { ok: merkleOk, computedRoot } = await verifyMerkleProof(
        evidence.chain_hash,
        evidence.merkle_proof,
        batch.root_hash,
      );
      steps.push({
        step: "MERKLE",
        label: "Merkle proof terhadap root batch",
        expected: batch.root_hash,
        actual: computedRoot,
        ok: merkleOk,
      });
      let sigOk = false;
      try {
        sigOk = ed25519.verify(fromHex(batch.signature), fromHex(batch.root_hash), fromHex(batch.public_key));
      } catch {
        sigOk = false;
      }
      steps.push({
        step: "SIGNATURE",
        label: "Digital signature (Ed25519)",
        expected: batch.signature,
        actual: batch.signature,
        ok: sigOk,
      });
    }
  } else {
    steps.push({ step: "MERKLE", label: "Merkle proof terhadap root batch", expected: "—", actual: "Belum di-seal", ok: null });
    steps.push({ step: "SIGNATURE", label: "Digital signature (Ed25519)", expected: "—", actual: "Belum di-seal", ok: null });
  }

  const status: VerifyResult["status"] = !fileOk ? "TAMPERED" : !chainOk ? "CHAIN_BROKEN" : evidence.batch_id ? "VALID" : "UNSEALED";
  if (status === "TAMPERED" || status === "CHAIN_BROKEN") {
    await supabase.from("evidence").update({ status: "TAMPERED" }).eq("id", evidence.id);
  }
  return { evidenceId: evidence.id, filename: evidence.filename, status, steps };
}

export async function handleSimulateTamper(
  supabase: Client,
  userId: string,
  email: string,
  evidenceId: string,
  mode: "file" | "record",
) {
  const { data: ev, error } = await supabase.from("evidence").select("*").eq("id", evidenceId).single();
  if (error || !ev) throw new Error("Bukti tidak ditemukan");

  if (mode === "file") {
    const { data: blob, error: dlErr } = await supabase.storage
      .from("evidence-files")
      .download(ev.storage_path);
    if (dlErr || !blob) throw new Error("File tidak dapat diunduh untuk simulasi");
    const original = new Uint8Array(await blob.arrayBuffer());
    const tampered = new TextEncoder().encode("\n[injected line — tamper simulation]");
    const merged = new Uint8Array(original.length + tampered.length);
    merged.set(original);
    merged.set(tampered, original.length);
    const { error: upErr } = await supabase.storage
      .from("evidence-files")
      .update(ev.storage_path, merged, { contentType: ev.mime_type });
    if (upErr) throw new Error(upErr.message);
  } else {
    const fakeHash = await sha256Hex(`tampered-record-${crypto.randomUUID()}`);
    const { error: uErr } = await supabase
      .from("evidence")
      .update({ file_hash: fakeHash })
      .eq("id", evidenceId);
    if (uErr) throw new Error(uErr.message);
  }

  await supabase.from("custody_log").insert({
    evidence_id: evidenceId,
    case_id: ev.case_id,
    actor: userId,
    actor_email: email,
    action: "TAMPER_SIMULATED",
    notes:
      mode === "file"
        ? "SIMULASI: konten file artefak diubah di storage."
        : "SIMULASI: nilai hash pada record database dimanipulasi.",
    hash_snapshot: ev.chain_hash,
  });
  return { ok: true, mode };
}

export async function handleAddCustodyEntry(
  supabase: Client,
  userId: string,
  email: string,
  evidenceId: string,
  action: string,
  notes: string,
) {
  const { data: ev, error } = await supabase.from("evidence").select("case_id, chain_hash").eq("id", evidenceId).single();
  if (error || !ev) throw new Error("Bukti tidak ditemukan");
  const { error: iErr } = await supabase.from("custody_log").insert({
    evidence_id: evidenceId,
    case_id: ev.case_id,
    actor: userId,
    actor_email: email,
    action,
    notes: notes || null,
    hash_snapshot: ev.chain_hash,
  });
  if (iErr) throw new Error(iErr.message);
  return { ok: true };
}

export async function handleExportProof(supabase: Client, caseId: string) {
  const [{ data: caseRow }, { data: evidence }, { data: batches }, { data: custody }] = await Promise.all([
    supabase.from("cases").select("*").eq("id", caseId).single(),
    supabase.from("evidence").select("*").eq("case_id", caseId).order("created_at", { ascending: true }),
    supabase.from("merkle_batches").select("*").eq("case_id", caseId).order("sealed_at", { ascending: true }),
    supabase.from("custody_log").select("*").eq("case_id", caseId).order("created_at", { ascending: true }),
  ]);
  if (!caseRow) throw new Error("Kasus tidak ditemukan");
  return {
    generated_at: new Date().toISOString(),
    algorithm: { hash: "SHA-256", signature: "Ed25519", tree: "Merkle (SHA-256 pairwise)" },
    case: caseRow,
    evidence: evidence ?? [],
    merkle_batches: batches ?? [],
    custody_log: custody ?? [],
  };
}

export async function handleCreateCase(
  supabase: Client,
  userId: string,
  title: string,
  description: string,
) {
  const { data, error } = await supabase
    .from("cases")
    .insert({ title, description: description || null, created_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

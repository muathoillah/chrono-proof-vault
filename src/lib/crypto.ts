// Isomorphic cryptographic primitives (browser + worker safe, WebCrypto only).

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// chain_hash = sha256(prev_chain_hash || file_hash || created_at_iso || actor)
export function computeChainHash(
  prevChainHash: string | null,
  fileHash: string,
  createdAtIso: string,
  actor: string,
): Promise<string> {
  return sha256Hex((prevChainHash ?? "") + fileHash + createdAtIso + actor);
}

export interface MerkleProofStep {
  hash: string;
  position: "left" | "right"; // where the sibling sits relative to the running node
}

export interface MerkleTreeResult {
  root: string;
  proofs: MerkleProofStep[][];
  layers: string[][];
}

async function hashPair(a: string, b: string): Promise<string> {
  return sha256Hex(a + b);
}

// Builds a Merkle tree from leaf hashes; odd nodes are duplicated.
// Returns the root, a proof path per leaf, and every layer for visualization.
export async function buildMerkleTree(leaves: string[]): Promise<MerkleTreeResult> {
  if (leaves.length === 0) return { root: "", proofs: [], layers: [] };
  const layers: string[][] = [leaves.slice()];
  const proofs: MerkleProofStep[][] = leaves.map(() => []);
  let current = leaves.slice();
  let indexMap = leaves.map((_, i) => i);
  while (current.length > 1) {
    const next: string[] = [];
    const nextMap: number[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = i + 1 < current.length ? current[i + 1]! : left;
      next.push(await hashPair(left, right));
      nextMap.push(indexMap[i]!);
    }
    for (let i = 0; i < current.length; i++) {
      const sibIdx = i % 2 === 0 ? i + 1 : i - 1;
      const sibling = sibIdx < current.length ? current[sibIdx]! : current[i]!;
      proofs[indexMap[i]!]!.push({
        hash: sibling,
        position: i % 2 === 0 ? "right" : "left",
      });
    }
    layers.push(next);
    current = next;
    indexMap = nextMap;
  }
  return { root: current[0]!, proofs, layers };
}

export async function verifyMerkleProof(
  leaf: string,
  proof: MerkleProofStep[],
  expectedRoot: string,
): Promise<{ ok: boolean; computedRoot: string }> {
  let node = leaf;
  for (const step of proof) {
    node = step.position === "right" ? await hashPair(node, step.hash) : await hashPair(step.hash, node);
  }
  return { ok: node === expectedRoot, computedRoot: node };
}

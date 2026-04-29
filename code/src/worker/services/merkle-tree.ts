/**
 * Merkle Tree implementation for batched micropayment verification.
 * Uses SHA-256 for hashing (Web Crypto API compatible).
 */

// Simple SHA-256 using Web Crypto API
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export interface MicropaymentAction {
  id: number;
  senderChannelId: number;
  recipientChannelId: number | null;
  recipientType: 'creator' | 'platform' | 'commenter';
  actionType: string;
  amountSompi: string;
  videoId: number | null;
  commentId: number | null;
  timestamp: string;
}

export interface MerkleProof {
  leafIndex: number;
  proof: string[]; // Array of sibling hashes
  leafHash: string;
  root: string;
}

/**
 * Hash a single micropayment action to create a leaf node
 */
export async function hashAction(action: MicropaymentAction): Promise<string> {
  const data = JSON.stringify({
    id: action.id,
    sender: action.senderChannelId,
    recipient: action.recipientChannelId,
    recipientType: action.recipientType,
    action: action.actionType,
    amount: action.amountSompi,
    video: action.videoId,
    comment: action.commentId,
    ts: action.timestamp,
  });
  
  const hash = await sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Hash two nodes together to create a parent node
 */
async function hashPair(left: string, right: string): Promise<string> {
  // Sort to ensure consistent ordering regardless of position
  const [first, second] = left < right ? [left, right] : [right, left];
  const combined = hexToBytes(first + second);
  const hash = await sha256(combined);
  return bytesToHex(hash);
}

/**
 * Build a Merkle tree from an array of leaf hashes
 * Returns the root and all intermediate layers
 */
export async function buildMerkleTree(leafHashes: string[]): Promise<{ root: string; layers: string[][] }> {
  if (leafHashes.length === 0) {
    return { root: '', layers: [] };
  }
  
  if (leafHashes.length === 1) {
    return { root: leafHashes[0], layers: [leafHashes] };
  }
  
  const layers: string[][] = [leafHashes];
  let currentLayer = leafHashes;
  
  while (currentLayer.length > 1) {
    const nextLayer: string[] = [];
    
    for (let i = 0; i < currentLayer.length; i += 2) {
      if (i + 1 < currentLayer.length) {
        nextLayer.push(await hashPair(currentLayer[i], currentLayer[i + 1]));
      } else {
        // Odd number of nodes - promote the last one
        nextLayer.push(currentLayer[i]);
      }
    }
    
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }
  
  return { root: currentLayer[0], layers };
}

/**
 * Generate a Merkle proof for a specific leaf
 */
export function generateMerkleProof(
  leafIndex: number,
  layers: string[][]
): string[] {
  const proof: string[] = [];
  let index = leafIndex;
  
  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;
    
    if (siblingIndex < layer.length) {
      proof.push(layer[siblingIndex]);
    }
    
    index = Math.floor(index / 2);
  }
  
  return proof;
}

/**
 * Verify a Merkle proof
 */
export async function verifyMerkleProof(
  leafHash: string,
  leafIndex: number,
  proof: string[],
  root: string
): Promise<boolean> {
  let currentHash = leafHash;
  let index = leafIndex;
  
  for (const siblingHash of proof) {
    currentHash = await hashPair(currentHash, siblingHash);
    index = Math.floor(index / 2);
  }
  
  return currentHash === root;
}

/**
 * Create action hash for deduplication
 * This is used to prevent double-processing the same action
 */
export async function createActionHash(
  senderChannelId: number,
  actionType: string,
  videoId: number | null,
  commentId: number | null,
  timestamp: number
): Promise<string> {
  const data = `${senderChannelId}:${actionType}:${videoId || ''}:${commentId || ''}:${timestamp}`;
  const hash = await sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Build complete Merkle data for a batch of actions
 */
export async function buildBatchMerkleData(actions: MicropaymentAction[]): Promise<{
  root: string;
  proofs: MerkleProof[];
}> {
  const leafHashes = await Promise.all(actions.map(hashAction));
  const { root, layers } = await buildMerkleTree(leafHashes);
  
  const proofs: MerkleProof[] = actions.map((_, index) => ({
    leafIndex: index,
    proof: generateMerkleProof(index, layers),
    leafHash: leafHashes[index],
    root,
  }));
  
  return { root, proofs };
}

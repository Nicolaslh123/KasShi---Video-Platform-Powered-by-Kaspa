// D1Database type from Cloudflare Workers
import { 
  MicropaymentAction, 
  buildBatchMerkleData, 
  createActionHash
} from './merkle-tree';

// Minimum amount for immediate on-chain settlement (0.11 KAS)
// Note: 0.1 KAS is exactly at the KIP-9 storage mass boundary (100002 vs 100000 limit)
// Using 0.11 KAS provides a safe buffer to avoid mass limit errors
export const BATCH_THRESHOLD_SOMPI = 11000000; // 0.11 KAS in sompi
export const BATCH_THRESHOLD_KAS = 0.11;

export interface PendingMicropayment {
  id: number;
  sender_channel_id: number;
  recipient_channel_id: number | null;
  recipient_type: string;
  action_type: string;
  amount_sompi: string;
  video_id: number | null;
  comment_id: number | null;
  action_hash: string;
  created_at: string;
}

export interface BatchSettlementResult {
  batchId: number;
  merkleRoot: string;
  transactionId: string | null;
  itemCount: number;
  totalAmountSompi: string;
}

export interface RecipientSettlement {
  recipientChannelId: number | null;
  recipientWalletAddress: string | null;
  recipientType: 'platform'; // All batched payments go to platform only
  amountSompi: string;
  micropaymentIds: number[];
  batchId: number;
  merkleRoot: string;
}

export interface P2PSettlementResult {
  settlements: RecipientSettlement[];
  totalAmountSompi: string;
  itemCount: number;
}

/**
 * Record a micropayment for batched settlement
 * Supports either channel-based (senderChannelId) or user-based (senderUserId) tracking
 */
export async function recordPendingMicropayment(
  db: any,
  senderChannelId: number | null,
  recipientChannelId: number | null,
  recipientType: 'creator' | 'platform' | 'commenter',
  actionType: string,
  amountSompi: string,
  videoId: number | null = null,
  commentId: number | null = null,
  senderUserId: string | null = null
): Promise<{ success: boolean; micropaymentId?: number; autoSettled?: P2PSettlementResult | null; error?: string }> {
  try {
    // Create action hash for deduplication (use senderChannelId or hash of senderUserId)
    const timestamp = Date.now();
    const senderIdForHash = senderChannelId ?? (senderUserId ? hashUserId(senderUserId) : 0);
    const actionHash = await createActionHash(
      senderIdForHash,
      actionType,
      videoId,
      commentId,
      timestamp
    );
    
    // Insert pending micropayment
    // Use 0 as placeholder for sender_channel_id when null (NOT NULL constraint)
    // Actual tracking uses sender_user_id for users without channels
    const result = await db.prepare(`
      INSERT INTO pending_micropayments (
        sender_channel_id, recipient_channel_id, recipient_type,
        action_type, amount_sompi, video_id, comment_id, action_hash, sender_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      senderChannelId ?? 0,
      recipientChannelId,
      recipientType,
      actionType,
      amountSompi,
      videoId,
      commentId,
      actionHash,
      senderUserId
    ).run();
    
    const micropaymentId = result.meta.last_row_id;
    
    // Update pending balance for recipient
    let autoSettled: P2PSettlementResult | null = null;
    if (recipientChannelId) {
      await updatePendingBalance(db, recipientChannelId, BigInt(amountSompi));
      
      // Check if recipient is now ready for auto-settlement (currently disabled for creators)
      // autoSettled = await autoSettleIfReady(db, recipientChannelId);
    }
    
    // If no recipient settlement triggered, check if SENDER has reached threshold
    // This handles platform fees and other payments that accumulate on sender side
    if (!autoSettled) {
      if (senderChannelId) {
        autoSettled = await autoSettleSenderIfReady(db, senderChannelId);
      } else if (senderUserId) {
        autoSettled = await autoSettleSenderByUserIdIfReady(db, senderUserId);
      }
    }
    
    return { success: true, micropaymentId: micropaymentId as number, autoSettled };
  } catch (error) {
    console.error('Failed to record pending micropayment:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Helper to convert user_id to a numeric hash for action hash generation
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Update pending balance for a channel
 */
async function updatePendingBalance(
  db: any,
  channelId: number,
  amountSompi: bigint
): Promise<void> {
  // Try to update existing balance
  const existing = await db.prepare(
    "SELECT balance_sompi FROM pending_balances WHERE channel_id = ?"
  ).bind(channelId).first();
  
  if (existing) {
    const currentBalance = BigInt(existing.balance_sompi as string);
    const newBalance = currentBalance + amountSompi;
    await db.prepare(
      "UPDATE pending_balances SET balance_sompi = ?, updated_at = CURRENT_TIMESTAMP WHERE channel_id = ?"
    ).bind(newBalance.toString(), channelId).run();
  } else {
    await db.prepare(
      "INSERT INTO pending_balances (channel_id, balance_sompi) VALUES (?, ?)"
    ).bind(channelId, amountSompi.toString()).run();
  }
}

/**
 * Get pending balance for a channel (what they're owed)
 */
export async function getPendingBalance(
  db: any,
  channelId: number
): Promise<string> {
  const result = await db.prepare(
    "SELECT balance_sompi FROM pending_balances WHERE channel_id = ?"
  ).bind(channelId).first();
  
  return result?.balance_sompi as string || '0';
}

/**
 * Get sender's pending debits (total unsettled micropayments they've sent)
 * This is what should be subtracted from their displayed balance
 */
export async function getSenderPendingDebits(
  db: any,
  senderChannelId: number
): Promise<string> {
  const result = await db.prepare(`
    SELECT COALESCE(SUM(CAST(amount_sompi AS INTEGER)), 0) as total_debits
    FROM pending_micropayments 
    WHERE sender_channel_id = ?
  `).bind(senderChannelId).first();
  
  return result?.total_debits?.toString() || '0';
}

/**
 * Get sender's pending debits by user_id (for users without channels)
 */
export async function getSenderPendingDebitsByUserId(
  db: any,
  senderUserId: string
): Promise<string> {
  const result = await db.prepare(`
    SELECT COALESCE(SUM(CAST(amount_sompi AS INTEGER)), 0) as total_debits
    FROM pending_micropayments 
    WHERE sender_user_id = ?
  `).bind(senderUserId).first();
  
  return result?.total_debits?.toString() || '0';
}

/**
 * Get all pending micropayments sent by a channel (for settlement)
 */
export async function getSenderPendingMicropayments(
  db: any,
  senderChannelId: number
): Promise<PendingMicropayment[]> {
  const result = await db.prepare(`
    SELECT * FROM pending_micropayments 
    WHERE sender_channel_id = ?
    ORDER BY created_at ASC
  `).bind(senderChannelId).all();
  
  return (result.results || []) as PendingMicropayment[];
}

/**
 * Get all pending micropayments sent by user_id (for users without channels)
 */
export async function getSenderPendingMicropaymentsByUserId(
  db: any,
  senderUserId: string
): Promise<PendingMicropayment[]> {
  const result = await db.prepare(`
    SELECT * FROM pending_micropayments 
    WHERE sender_user_id = ?
    ORDER BY created_at ASC
  `).bind(senderUserId).all();
  
  return (result.results || []) as PendingMicropayment[];
}

/**
 * Get all pending micropayments for a recipient
 */
export async function getPendingMicropayments(
  db: any,
  recipientChannelId: number
): Promise<PendingMicropayment[]> {
  const result = await db.prepare(`
    SELECT * FROM pending_micropayments 
    WHERE recipient_channel_id = ?
    ORDER BY created_at ASC
  `).bind(recipientChannelId).all();
  
  return (result.results || []) as PendingMicropayment[];
}

/**
 * Check if a recipient is ready for settlement (balance >= threshold)
 */
export async function isReadyForSettlement(
  db: any,
  channelId: number
): Promise<boolean> {
  const balance = await getPendingBalance(db, channelId);
  return BigInt(balance) >= BigInt(BATCH_THRESHOLD_SOMPI);
}

/**
 * Check if a sender is ready for settlement (debits >= threshold)
 */
export async function isSenderReadyForSettlement(
  db: any,
  channelId: number
): Promise<boolean> {
  const debits = await getSenderPendingDebits(db, channelId);
  return BigInt(debits) >= BigInt(BATCH_THRESHOLD_SOMPI);
}

/**
 * Check if user is ready for ANY kind of settlement (earnings OR debits)
 */
export async function isAnySettlementReady(
  db: any,
  channelId: number
): Promise<{ ready: boolean; type: 'earnings' | 'debits' | null; amount: string }> {
  const earnings = await getPendingBalance(db, channelId);
  if (BigInt(earnings) >= BigInt(BATCH_THRESHOLD_SOMPI)) {
    return { ready: true, type: 'earnings', amount: earnings };
  }
  
  const debits = await getSenderPendingDebits(db, channelId);
  if (BigInt(debits) >= BigInt(BATCH_THRESHOLD_SOMPI)) {
    return { ready: true, type: 'debits', amount: debits };
  }
  
  // Return the larger amount to show progress
  const earningsNum = BigInt(earnings);
  const debitsNum = BigInt(debits);
  if (earningsNum > debitsNum) {
    return { ready: false, type: 'earnings', amount: earnings };
  } else if (debitsNum > BigInt(0)) {
    return { ready: false, type: 'debits', amount: debits };
  }
  return { ready: false, type: null, amount: '0' };
}

/**
 * Get all channels ready for settlement
 */
export async function getChannelsReadyForSettlement(
  db: any
): Promise<number[]> {
  const result = await db.prepare(`
    SELECT channel_id FROM pending_balances 
    WHERE CAST(balance_sompi AS INTEGER) >= ?
  `).bind(BATCH_THRESHOLD_SOMPI).all();
  
  return (result.results || []).map((r: any) => r.channel_id as number);
}

export interface PendingCreatorPayout {
  channelId: number;
  handle: string;
  name: string;
  walletAddress: string;
  pendingBalanceSompi: string;
  pendingBalanceKas: number;
  readyForPayout: boolean;
  micropaymentCount: number;
}

/**
 * Get all pending creator payouts (for admin view)
 */
export async function getAllPendingCreatorPayouts(
  db: any
): Promise<PendingCreatorPayout[]> {
  // Get all channels with pending balances
  const result = await db.prepare(`
    SELECT 
      pb.channel_id,
      pb.balance_sompi,
      c.handle,
      c.name,
      c.wallet_address
    FROM pending_balances pb
    JOIN channels c ON pb.channel_id = c.id
    WHERE CAST(pb.balance_sompi AS INTEGER) > 0
    ORDER BY CAST(pb.balance_sompi AS INTEGER) DESC
  `).all();
  
  const payouts: PendingCreatorPayout[] = [];
  
  for (const row of (result.results || [])) {
    const balanceSompi = BigInt(row.balance_sompi as string);
    
    // Count pending micropayments for this recipient
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count FROM pending_micropayments WHERE recipient_channel_id = ?
    `).bind(row.channel_id).first();
    
    payouts.push({
      channelId: row.channel_id as number,
      handle: row.handle as string,
      name: row.name as string,
      walletAddress: row.wallet_address as string,
      pendingBalanceSompi: balanceSompi.toString(),
      pendingBalanceKas: Number(balanceSompi) / 100000000,
      readyForPayout: balanceSompi >= BigInt(BATCH_THRESHOLD_SOMPI),
      micropaymentCount: (countResult?.count as number) || 0
    });
  }
  
  return payouts;
}

/**
 * Create a settlement batch for a channel
 * Returns the Merkle root and batch details
 */
export async function createSettlementBatch(
  db: any,
  channelId: number
): Promise<BatchSettlementResult | null> {
  // Get all pending micropayments for this channel
  const micropayments = await getPendingMicropayments(db, channelId);
  
  if (micropayments.length === 0) {
    return null;
  }
  
  // Convert to MicropaymentAction format
  const actions: MicropaymentAction[] = micropayments.map(mp => ({
    id: mp.id,
    senderChannelId: mp.sender_channel_id,
    recipientChannelId: mp.recipient_channel_id,
    recipientType: mp.recipient_type as 'creator' | 'platform' | 'commenter',
    actionType: mp.action_type,
    amountSompi: mp.amount_sompi,
    videoId: mp.video_id,
    commentId: mp.comment_id,
    timestamp: mp.created_at,
  }));
  
  // Calculate total amount
  const totalAmountSompi = actions.reduce(
    (sum, a) => sum + BigInt(a.amountSompi),
    BigInt(0)
  );
  
  // Build Merkle tree and proofs
  const { root, proofs } = await buildBatchMerkleData(actions);
  
  // Create batch record
  const batchResult = await db.prepare(`
    INSERT INTO settlement_batches (
      merkle_root, total_amount_sompi, item_count, status
    ) VALUES (?, ?, ?, 'pending')
  `).bind(root, totalAmountSompi.toString(), actions.length).run();
  
  const batchId = batchResult.meta.last_row_id as number;
  
  // Create settlement items with proofs
  for (let i = 0; i < actions.length; i++) {
    await db.prepare(`
      INSERT INTO settlement_items (
        batch_id, micropayment_id, leaf_index, merkle_proof
      ) VALUES (?, ?, ?, ?)
    `).bind(
      batchId,
      actions[i].id,
      proofs[i].leafIndex,
      JSON.stringify(proofs[i].proof)
    ).run();
  }
  
  return {
    batchId,
    merkleRoot: root,
    transactionId: null, // Will be set after on-chain settlement
    itemCount: actions.length,
    totalAmountSompi: totalAmountSompi.toString(),
  };
}

/**
 * Complete a settlement - mark micropayments as settled and clear pending balance
 */
export async function completeSettlement(
  db: any,
  batchId: number,
  transactionId: string,
  channelId: number
): Promise<void> {
  // Update batch with transaction ID
  await db.prepare(`
    UPDATE settlement_batches 
    SET transaction_id = ?, status = 'completed', settled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(transactionId, batchId).run();
  
  // Get all micropayment IDs in this batch
  const items = await db.prepare(
    "SELECT micropayment_id FROM settlement_items WHERE batch_id = ?"
  ).bind(batchId).all();
  
  const micropaymentIds = (items.results || []).map((i: any) => i.micropayment_id as number);
  
  // Delete settled micropayments
  if (micropaymentIds.length > 0) {
    // D1 doesn't support IN with dynamic arrays, so we delete one by one
    for (const mpId of micropaymentIds) {
      await db.prepare(
        "DELETE FROM pending_micropayments WHERE id = ?"
      ).bind(mpId).run();
    }
  }
  
  // Reset pending balance
  await db.prepare(
    "UPDATE pending_balances SET balance_sompi = '0', updated_at = CURRENT_TIMESTAMP WHERE channel_id = ?"
  ).bind(channelId).run();
}

/**
 * Get settlement history for a channel
 */
export async function getSettlementHistory(
  db: any,
  channelId: number
): Promise<any[]> {
  // Get batches that include this channel's micropayments
  const result = await db.prepare(`
    SELECT DISTINCT sb.* 
    FROM settlement_batches sb
    JOIN settlement_items si ON sb.id = si.batch_id
    JOIN pending_micropayments pm ON si.micropayment_id = pm.id
    WHERE pm.recipient_channel_id = ? AND sb.status = 'completed'
    ORDER BY sb.settled_at DESC
    LIMIT 50
  `).bind(channelId).all();
  
  return result.results || [];
}

/**
 * Auto-settle a channel's incoming payments if their pending balance meets the threshold
 * NOTE: For creator earnings, we DON'T auto-complete with fake txIds.
 * Creator earnings stay pending until platform pays them out.
 * This only triggers auto-settlement for SENDER debits (via autoSettleSenderIfReady).
 */
export async function autoSettleIfReady(
  _db: any,
  _channelId: number
): Promise<BatchSettlementResult | null> {
  // For creator earnings, we just check readiness but don't auto-settle
  // The platform needs to pay creators, which requires admin action
  // Return null so sender settlement triggers instead (which sends to platform)
  return null;
}

/**
 * Auto-settle a sender's outgoing payments when their debits reach the threshold
 * Groups payments by recipient for TRUE P2P: sends directly to creators/commenters, not platform
 * Only payments without a channel (platform fees) go to platform wallet
 */
export async function autoSettleSenderIfReady(
  db: any,
  senderChannelId: number
): Promise<P2PSettlementResult | null> {
  const debits = await getSenderPendingDebits(db, senderChannelId);
  
  if (BigInt(debits) < BigInt(BATCH_THRESHOLD_SOMPI)) {
    return null; // Not ready yet
  }
  
  // Get all pending micropayments from this sender
  const micropayments = await getSenderPendingMicropayments(db, senderChannelId);
  
  if (micropayments.length === 0) {
    return null;
  }
  
  // Group micropayments by recipient channel ID (null = platform)
  const byRecipient = new Map<number | null, PendingMicropayment[]>();
  for (const mp of micropayments) {
    const key = mp.recipient_channel_id;
    if (!byRecipient.has(key)) {
      byRecipient.set(key, []);
    }
    byRecipient.get(key)!.push(mp);
  }
  
  // Get wallet addresses for all recipients
  const recipientChannelIds = [...byRecipient.keys()].filter((id): id is number => id !== null);
  const recipientWallets = new Map<number, string>();
  
  if (recipientChannelIds.length > 0) {
    for (const channelId of recipientChannelIds) {
      const channel = await db.prepare(
        "SELECT wallet_address FROM channels WHERE id = ?"
      ).bind(channelId).first();
      if (channel?.wallet_address) {
        recipientWallets.set(channelId, channel.wallet_address as string);
      }
    }
  }
  
  // Build settlements for recipients with >= threshold
  const settlements: RecipientSettlement[] = [];
  const settledMicropaymentIds: number[] = [];
  let totalSettledSompi = BigInt(0);
  
  for (const [recipientChannelId, mps] of byRecipient) {
    const recipientTotal = mps.reduce((sum, mp) => sum + BigInt(mp.amount_sompi), BigInt(0));
    
    // Only settle if this recipient's total >= threshold (KIP-9 compliant)
    if (recipientTotal >= BigInt(BATCH_THRESHOLD_SOMPI)) {
      const actions: MicropaymentAction[] = mps.map(mp => ({
        id: mp.id,
        senderChannelId: mp.sender_channel_id,
        recipientChannelId: mp.recipient_channel_id,
        recipientType: mp.recipient_type as 'creator' | 'platform' | 'commenter',
        actionType: mp.action_type,
        amountSompi: mp.amount_sompi,
        videoId: mp.video_id,
        commentId: mp.comment_id,
        timestamp: mp.created_at,
      }));
      
      // Build Merkle tree for this recipient's payments
      const { root, proofs } = await buildBatchMerkleData(actions);
      
      // Create batch record for this recipient
      const batchResult = await db.prepare(`
        INSERT INTO settlement_batches (
          merkle_root, total_amount_sompi, item_count, status
        ) VALUES (?, ?, ?, 'pending')
      `).bind(root, recipientTotal.toString(), actions.length).run();
      
      const batchId = batchResult.meta.last_row_id as number;
      
      // Create settlement items
      for (let i = 0; i < actions.length; i++) {
        await db.prepare(`
          INSERT INTO settlement_items (
            batch_id, micropayment_id, leaf_index, merkle_proof
          ) VALUES (?, ?, ?, ?)
        `).bind(batchId, actions[i].id, proofs[i].leafIndex, JSON.stringify(proofs[i].proof)).run();
      }
      
      settlements.push({
        recipientChannelId,
        recipientWalletAddress: recipientChannelId ? (recipientWallets.get(recipientChannelId) || null) : null,
        recipientType: 'platform', // All batched payments now go to platform
        amountSompi: recipientTotal.toString(),
        micropaymentIds: mps.map(mp => mp.id),
        batchId,
        merkleRoot: root,
      });
      
      settledMicropaymentIds.push(...mps.map(mp => mp.id));
      totalSettledSompi += recipientTotal;
      
      console.log(`Batch settlement: ${Number(recipientTotal) / 100000000} KAS to platform`);
    }
  }
  
  if (settlements.length === 0) {
    return null; // No recipients met threshold
  }
  
  // Delete settled micropayments
  for (const mpId of settledMicropaymentIds) {
    await db.prepare("DELETE FROM pending_micropayments WHERE id = ?").bind(mpId).run();
  }
  
  // Update pending balances for settled recipients
  for (const settlement of settlements) {
    if (settlement.recipientChannelId) {
      // Recalculate remaining balance for this recipient
      const remaining = await db.prepare(`
        SELECT COALESCE(SUM(CAST(amount_sompi AS INTEGER)), 0) as total
        FROM pending_micropayments WHERE recipient_channel_id = ?
      `).bind(settlement.recipientChannelId).first();
      
      await db.prepare(`
        INSERT INTO pending_balances (channel_id, balance_sompi) VALUES (?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET balance_sompi = ?, updated_at = CURRENT_TIMESTAMP
      `).bind(settlement.recipientChannelId, (remaining?.total || '0').toString(), (remaining?.total || '0').toString()).run();
    }
  }
  
  console.log(`P2P auto-settlement: ${settlements.length} recipients, total ${Number(totalSettledSompi) / 100000000} KAS`);
  
  return {
    settlements,
    totalAmountSompi: totalSettledSompi.toString(),
    itemCount: settledMicropaymentIds.length,
  };
}

/**
 * Auto-settle a sender's outgoing payments by user_id (for users without channels)
 * EXCLUDES external wallet users (they settle manually via KasWare)
 */
export async function autoSettleSenderByUserIdIfReady(
  db: any,
  senderUserId: string
): Promise<P2PSettlementResult | null> {
  // Skip auto-settlement for external wallet users - they settle manually via KasWare
  if (senderUserId.startsWith('ext-')) {
    return null;
  }
  
  const debits = await getSenderPendingDebitsByUserId(db, senderUserId);
  
  if (BigInt(debits) < BigInt(BATCH_THRESHOLD_SOMPI)) {
    return null; // Not ready yet
  }
  
  // Get all pending micropayments from this sender
  const micropayments = await getSenderPendingMicropaymentsByUserId(db, senderUserId);
  
  if (micropayments.length === 0) {
    return null;
  }
  
  // Group micropayments by recipient channel ID (null = platform)
  const byRecipient = new Map<number | null, PendingMicropayment[]>();
  for (const mp of micropayments) {
    const key = mp.recipient_channel_id;
    if (!byRecipient.has(key)) {
      byRecipient.set(key, []);
    }
    byRecipient.get(key)!.push(mp);
  }
  
  // Get wallet addresses for all recipients
  const recipientChannelIds = [...byRecipient.keys()].filter((id): id is number => id !== null);
  const recipientWallets = new Map<number, string>();
  
  if (recipientChannelIds.length > 0) {
    for (const channelId of recipientChannelIds) {
      const channel = await db.prepare(
        "SELECT wallet_address FROM channels WHERE id = ?"
      ).bind(channelId).first();
      if (channel?.wallet_address) {
        recipientWallets.set(channelId, channel.wallet_address as string);
      }
    }
  }
  
  // Build settlements for recipients with >= threshold
  const settlements: RecipientSettlement[] = [];
  const settledMicropaymentIds: number[] = [];
  let totalSettledSompi = BigInt(0);
  
  for (const [recipientChannelId, mps] of byRecipient) {
    const recipientTotal = mps.reduce((sum, mp) => sum + BigInt(mp.amount_sompi), BigInt(0));
    
    if (recipientTotal >= BigInt(BATCH_THRESHOLD_SOMPI)) {
      const actions: MicropaymentAction[] = mps.map(mp => ({
        id: mp.id,
        senderChannelId: mp.sender_channel_id,
        recipientChannelId: mp.recipient_channel_id,
        recipientType: mp.recipient_type as 'creator' | 'platform' | 'commenter',
        actionType: mp.action_type,
        amountSompi: mp.amount_sompi,
        videoId: mp.video_id,
        commentId: mp.comment_id,
        timestamp: mp.created_at,
      }));
      
      const { root, proofs } = await buildBatchMerkleData(actions);
      
      const batchResult = await db.prepare(`
        INSERT INTO settlement_batches (
          merkle_root, total_amount_sompi, item_count, status
        ) VALUES (?, ?, ?, 'pending')
      `).bind(root, recipientTotal.toString(), actions.length).run();
      
      const batchId = batchResult.meta.last_row_id as number;
      
      for (let i = 0; i < actions.length; i++) {
        await db.prepare(`
          INSERT INTO settlement_items (
            batch_id, micropayment_id, leaf_index, merkle_proof
          ) VALUES (?, ?, ?, ?)
        `).bind(batchId, actions[i].id, proofs[i].leafIndex, JSON.stringify(proofs[i].proof)).run();
      }
      
      settlements.push({
        recipientChannelId,
        recipientWalletAddress: recipientChannelId ? (recipientWallets.get(recipientChannelId) || null) : null,
        recipientType: 'platform', // All batched payments now go to platform
        amountSompi: recipientTotal.toString(),
        micropaymentIds: mps.map(mp => mp.id),
        batchId,
        merkleRoot: root,
      });
      
      settledMicropaymentIds.push(...mps.map(mp => mp.id));
      totalSettledSompi += recipientTotal;
    }
  }
  
  if (settlements.length === 0) {
    return null;
  }
  
  // Delete settled micropayments
  for (const mpId of settledMicropaymentIds) {
    await db.prepare("DELETE FROM pending_micropayments WHERE id = ?").bind(mpId).run();
  }
  
  // Update pending balances for settled recipients
  for (const settlement of settlements) {
    if (settlement.recipientChannelId) {
      const remaining = await db.prepare(`
        SELECT COALESCE(SUM(CAST(amount_sompi AS INTEGER)), 0) as total
        FROM pending_micropayments WHERE recipient_channel_id = ?
      `).bind(settlement.recipientChannelId).first();
      
      await db.prepare(`
        INSERT INTO pending_balances (channel_id, balance_sompi) VALUES (?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET balance_sompi = ?, updated_at = CURRENT_TIMESTAMP
      `).bind(settlement.recipientChannelId, (remaining?.total || '0').toString(), (remaining?.total || '0').toString()).run();
    }
  }
  
  console.log(`P2P auto-settlement (user ${senderUserId}): ${settlements.length} recipients, total ${Number(totalSettledSompi) / 100000000} KAS`);
  
  return {
    settlements,
    totalAmountSompi: totalSettledSompi.toString(),
    itemCount: settledMicropaymentIds.length,
  };
}

/**
 * Create settlement batch for sender's outgoing payments (force mode - no threshold check)
 */
export async function createSenderSettlementBatch(
  db: any,
  senderChannelId: number
): Promise<BatchSettlementResult | null> {
  // Get all pending micropayments from this sender
  const micropayments = await getSenderPendingMicropayments(db, senderChannelId);
  
  if (micropayments.length === 0) {
    return null;
  }
  
  // Convert to MicropaymentAction format
  const actions: MicropaymentAction[] = micropayments.map(mp => ({
    id: mp.id,
    senderChannelId: mp.sender_channel_id,
    recipientChannelId: mp.recipient_channel_id,
    recipientType: mp.recipient_type as 'creator' | 'platform' | 'commenter',
    actionType: mp.action_type,
    amountSompi: mp.amount_sompi,
    videoId: mp.video_id,
    commentId: mp.comment_id,
    timestamp: mp.created_at,
  }));
  
  // Calculate total amount
  const totalAmountSompi = actions.reduce(
    (sum, a) => sum + BigInt(a.amountSompi),
    BigInt(0)
  );
  
  // Build Merkle tree and proofs
  const { root, proofs } = await buildBatchMerkleData(actions);
  
  // Create batch record
  const batchResult = await db.prepare(`
    INSERT INTO settlement_batches (
      merkle_root, total_amount_sompi, item_count, status
    ) VALUES (?, ?, ?, 'pending')
  `).bind(root, totalAmountSompi.toString(), actions.length).run();
  
  const batchId = batchResult.meta.last_row_id as number;
  
  // Create settlement items with proofs
  for (let i = 0; i < actions.length; i++) {
    await db.prepare(`
      INSERT INTO settlement_items (
        batch_id, micropayment_id, leaf_index, merkle_proof
      ) VALUES (?, ?, ?, ?)
    `).bind(
      batchId,
      actions[i].id,
      proofs[i].leafIndex,
      JSON.stringify(proofs[i].proof)
    ).run();
  }
  
  return {
    batchId,
    merkleRoot: root,
    transactionId: null,
    itemCount: actions.length,
    totalAmountSompi: totalAmountSompi.toString(),
  };
}

/**
 * Get Merkle proof for a specific action
 */
export async function getMerkleProof(
  db: any,
  micropaymentId: number
): Promise<{ batchId: number; merkleRoot: string; proof: string[]; leafIndex: number } | null> {
  const item = await db.prepare(`
    SELECT si.*, sb.merkle_root, sb.transaction_id
    FROM settlement_items si
    JOIN settlement_batches sb ON si.batch_id = sb.id
    WHERE si.micropayment_id = ?
  `).bind(micropaymentId).first();
  
  if (!item) return null;
  
  return {
    batchId: item.batch_id as number,
    merkleRoot: item.merkle_root as string,
    proof: JSON.parse(item.merkle_proof as string),
    leafIndex: item.leaf_index as number,
  };
}

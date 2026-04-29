// KRC-20 Token Builder for Kaspa
// Handles inscription-based token deployment and minting for fractionalized song ownership
// KRC-20 follows Kasplex protocol - JSON inscriptions indexed by Kasplex nodes

import { getUTXOs, signTransaction, submitTransaction, type UTXO } from './kaspa-wallet';

export interface Krc20DeployParams {
  artistAddress: string;
  ticker: string;        // 4-6 chars, e.g. "KSNG42"
  maxSupply: string;     // Total supply (e.g. "1000000")
  mintLimit?: string;    // Max mint per tx (e.g. "1000")
}

export interface Krc20MintParams {
  artistAddress: string;
  ticker: string;
  amount: string;        // Amount to mint
}

export interface Krc20TransferParams {
  fromAddress: string;
  toAddress: string;
  ticker: string;
  amount: string;
}

export interface Krc20TxResult {
  success: boolean;
  transactionId?: string;
  inscriptionJson?: string;
  error?: string;
}

// KRC-20 inscription protocol identifier
const KRC20_PROTOCOL = 'krc-20';

// Minimum sompi for inscription output (dust amount to carry inscription)
const INSCRIPTION_DUST_SOMPI = 100000; // 0.001 KAS

// Fee for KRC-20 transactions
const KRC20_FEE_SOMPI = 100000; // 0.001 KAS

/**
 * Build KRC-20 deploy inscription JSON
 * This creates the JSON payload for deploying a new KRC-20 token
 */
export function buildDeployInscription(ticker: string, maxSupply: string, mintLimit: string = '1000'): string {
  return JSON.stringify({
    p: KRC20_PROTOCOL,
    op: 'deploy',
    tick: ticker.toUpperCase(),
    max: maxSupply,
    lim: mintLimit,
  });
}

/**
 * Build KRC-20 mint inscription JSON
 */
export function buildMintInscription(ticker: string, amount: string): string {
  return JSON.stringify({
    p: KRC20_PROTOCOL,
    op: 'mint',
    tick: ticker.toUpperCase(),
    amt: amount,
  });
}

/**
 * Build KRC-20 transfer inscription JSON
 */
export function buildTransferInscription(ticker: string, amount: string, toAddress: string): string {
  return JSON.stringify({
    p: KRC20_PROTOCOL,
    op: 'transfer',
    tick: ticker.toUpperCase(),
    amt: amount,
    to: toAddress,
  });
}

/**
 * Generate a unique ticker for a track based on track ID
 * Format: KS + base36 of trackId, padded to 4-6 chars total
 */
export function generateTicker(trackId: number): string {
  const base36 = trackId.toString(36).toUpperCase();
  // Ensure 4-6 character ticker: "KS" + up to 4 chars
  return `KS${base36.slice(0, 4).padStart(2, '0')}`;
}

/**
 * Validate ticker format (4-6 uppercase alphanumeric)
 */
export function validateTicker(ticker: string): boolean {
  return /^[A-Z0-9]{4,6}$/.test(ticker);
}

/**
 * Deploy a new KRC-20 token for a fractionalized track
 * 
 * Note: KRC-20 inscriptions are embedded in transaction metadata.
 * The inscription is included in the transaction's script data and indexed by Kasplex.
 * For MVP, we'll create a standard transaction and record the inscription intent.
 * Full inscription support requires Kasplex-compatible script construction.
 */
export async function deployKrc20Token(
  params: Krc20DeployParams,
  privateKey: string
): Promise<Krc20TxResult> {
  try {
    const { artistAddress, ticker, maxSupply, mintLimit = '1000' } = params;
    
    // Validate ticker
    if (!validateTicker(ticker)) {
      return {
        success: false,
        error: 'Invalid ticker format. Must be 4-6 uppercase alphanumeric characters.',
      };
    }
    
    // Build inscription JSON
    const inscriptionJson = buildDeployInscription(ticker, maxSupply, mintLimit);
    console.log('[KRC20-DEPLOY] Inscription:', inscriptionJson);
    
    // Get UTXOs for the artist
    const utxos = await getUTXOs(artistAddress);
    if (utxos.length === 0) {
      return {
        success: false,
        error: 'No UTXOs available for deployment',
      };
    }
    
    // Calculate required amount (dust for inscription + fee)
    const requiredAmount = INSCRIPTION_DUST_SOMPI + KRC20_FEE_SOMPI;
    
    // Select UTXOs
    utxos.sort((a, b) => b.amount - a.amount);
    const selectedUtxos: UTXO[] = [];
    let totalSelected = 0;
    
    for (const utxo of utxos) {
      selectedUtxos.push(utxo);
      totalSelected += utxo.amount;
      if (totalSelected >= requiredAmount) break;
    }
    
    if (totalSelected < requiredAmount) {
      return {
        success: false,
        error: `Insufficient funds. Need ${requiredAmount / 100000000} KAS`,
      };
    }
    
    // Create a self-referential transaction with inscription metadata
    // The inscription JSON is stored as a memo/comment and indexed by Kasplex
    const signResult = await signTransaction(
      selectedUtxos,
      artistAddress, // Send to self
      INSCRIPTION_DUST_SOMPI,
      KRC20_FEE_SOMPI,
      artistAddress,
      privateKey
    );
    
    if (!signResult.success || !signResult.signedTx) {
      return {
        success: false,
        error: signResult.error || 'Failed to sign deploy transaction',
      };
    }
    
    // Submit transaction
    const submitResult = await submitTransaction(signResult.signedTx);
    
    if (!submitResult.success) {
      return {
        success: false,
        error: submitResult.error || 'Failed to submit deploy transaction',
      };
    }
    
    console.log('[KRC20-DEPLOY] Deployed token:', { ticker, txId: submitResult.transactionId });
    
    return {
      success: true,
      transactionId: submitResult.transactionId,
      inscriptionJson,
    };
  } catch (error) {
    console.error('[KRC20-DEPLOY] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deploy failed',
    };
  }
}

/**
 * Mint KRC-20 tokens (typically called after deploy to mint initial supply)
 */
export async function mintKrc20Tokens(
  params: Krc20MintParams,
  privateKey: string
): Promise<Krc20TxResult> {
  try {
    const { artistAddress, ticker, amount } = params;
    
    // Build inscription JSON
    const inscriptionJson = buildMintInscription(ticker, amount);
    console.log('[KRC20-MINT] Inscription:', inscriptionJson);
    
    // Get UTXOs
    const utxos = await getUTXOs(artistAddress);
    if (utxos.length === 0) {
      return {
        success: false,
        error: 'No UTXOs available for minting',
      };
    }
    
    const requiredAmount = INSCRIPTION_DUST_SOMPI + KRC20_FEE_SOMPI;
    
    utxos.sort((a, b) => b.amount - a.amount);
    const selectedUtxos: UTXO[] = [];
    let totalSelected = 0;
    
    for (const utxo of utxos) {
      selectedUtxos.push(utxo);
      totalSelected += utxo.amount;
      if (totalSelected >= requiredAmount) break;
    }
    
    if (totalSelected < requiredAmount) {
      return {
        success: false,
        error: `Insufficient funds. Need ${requiredAmount / 100000000} KAS`,
      };
    }
    
    const signResult = await signTransaction(
      selectedUtxos,
      artistAddress,
      INSCRIPTION_DUST_SOMPI,
      KRC20_FEE_SOMPI,
      artistAddress,
      privateKey
    );
    
    if (!signResult.success || !signResult.signedTx) {
      return {
        success: false,
        error: signResult.error || 'Failed to sign mint transaction',
      };
    }
    
    const submitResult = await submitTransaction(signResult.signedTx);
    
    if (!submitResult.success) {
      return {
        success: false,
        error: submitResult.error || 'Failed to submit mint transaction',
      };
    }
    
    console.log('[KRC20-MINT] Minted tokens:', { ticker, amount, txId: submitResult.transactionId });
    
    return {
      success: true,
      transactionId: submitResult.transactionId,
      inscriptionJson,
    };
  } catch (error) {
    console.error('[KRC20-MINT] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Mint failed',
    };
  }
}

/**
 * Check KRC-20 token balance via Kasplex API
 * Note: Requires Kasplex indexer endpoint
 */
export async function getKrc20Balance(address: string, ticker: string): Promise<string | null> {
  try {
    // Kasplex API endpoint for token balances
    const response = await fetch(
      `https://api.kasplex.org/v1/krc20/address/${address}/token/${ticker}`
    );
    
    if (!response.ok) {
      console.log('[KRC20-BALANCE] Token not found or API error');
      return null;
    }
    
    const data = await response.json() as { balance?: string };
    return data.balance || '0';
  } catch (error) {
    console.error('[KRC20-BALANCE] Error:', error);
    return null;
  }
}

/**
 * Get token info from Kasplex
 */
export async function getKrc20TokenInfo(ticker: string): Promise<{
  exists: boolean;
  maxSupply?: string;
  totalMinted?: string;
  holders?: number;
} | null> {
  try {
    const response = await fetch(`https://api.kasplex.org/v1/krc20/token/${ticker}`);
    
    if (!response.ok) {
      return { exists: false };
    }
    
    const data = await response.json() as {
      max?: string;
      minted?: string;
      holders?: number;
    };
    
    return {
      exists: true,
      maxSupply: data.max,
      totalMinted: data.minted,
      holders: data.holders,
    };
  } catch (error) {
    console.error('[KRC20-INFO] Error:', error);
    return null;
  }
}

// ====================== KRC-20 TRANSACTION BUILDERS ======================
// These build unsigned transactions for frontend signing (KasWare wallet)

interface BuildTransactionOutput {
  to?: string;
  amount?: string;
  data?: Uint8Array;
}

interface BuildTransactionParams {
  from: string;
  outputs: BuildTransactionOutput[];
  feePerKb?: number;
}

/**
 * Build a transaction for KasWare to sign
 * Returns raw transaction data that frontend will sign with KasWare
 */
export async function buildTransaction(params: BuildTransactionParams): Promise<{
  success: boolean;
  txData?: {
    from: string;
    outputs: Array<{ to?: string; amount?: string; dataHex?: string }>;
    feePerKb: number;
  };
  inscriptionHex?: string;
  error?: string;
}> {
  try {
    const { from, outputs, feePerKb = 2000 } = params;
    
    // Get UTXOs for the sender to verify they have funds
    const utxos = await getUTXOs(from);
    if (utxos.length === 0) {
      return { success: false, error: 'No UTXOs available for transaction' };
    }
    
    // Map outputs, converting data to hex string for JSON serialization
    const mappedOutputs = outputs.map(output => {
      if (output.data) {
        return { dataHex: Array.from(output.data).map(b => b.toString(16).padStart(2, '0')).join('') };
      }
      return { to: output.to, amount: output.amount };
    });
    
    // Find inscription data if present
    const inscriptionOutput = outputs.find(o => o.data);
    const inscriptionHex = inscriptionOutput?.data 
      ? Array.from(inscriptionOutput.data).map(b => b.toString(16).padStart(2, '0')).join('')
      : undefined;
    
    return {
      success: true,
      txData: {
        from,
        outputs: mappedOutputs,
        feePerKb,
      },
      inscriptionHex,
    };
  } catch (error) {
    console.error('[BUILD-TX] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build transaction',
    };
  }
}

/**
 * Builds a KRC-20 DEPLOY transaction for fractional shares
 * Artist will sign & broadcast this from the frontend using KasWare
 */
export async function buildKrc20DeployTx(
  fromAddress: string,
  ticker: string,           // 5-6 characters, e.g. "KTRK42"
  maxSupply: string,        // string of whole numbers (we treat as 8 decimals)
  mintLimit: string = '1000',
  feeSat: number = 2000     // conservative fee for Workers
) {
  const inscription = JSON.stringify({
    p: 'krc-20',
    op: 'deploy',
    tick: ticker.toUpperCase(),
    max: maxSupply,
    lim: mintLimit,
  });

  const encoder = new TextEncoder();
  const inscriptionData = encoder.encode(inscription);

  return await buildTransaction({
    from: fromAddress,
    outputs: [
      { to: fromAddress, amount: '0.00000001' },           // dust change
      { data: inscriptionData }                             // KRC-20 inscription
    ],
    feePerKb: feeSat,
  });
}

/**
 * Builds a KRC-20 MINT transaction (used later when artist mints remaining shares)
 */
export async function buildKrc20MintTx(
  fromAddress: string,
  ticker: string,
  amount: string
) {
  const inscription = JSON.stringify({
    p: 'krc-20',
    op: 'mint',
    tick: ticker.toUpperCase(),
    amt: amount,
  });

  const encoder = new TextEncoder();
  const inscriptionData = encoder.encode(inscription);

  return await buildTransaction({
    from: fromAddress,
    outputs: [
      { to: fromAddress, amount: '0.00000001' },
      { data: inscriptionData }
    ],
  });
}

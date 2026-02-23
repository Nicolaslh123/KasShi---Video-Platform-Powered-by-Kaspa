// Kaspa Wallet service using @okxweb3/coin-kaspa for wallet generation
// and pure JS for transaction building/signing (works in Cloudflare Workers)

import { KaspaWallet, transfer } from '@okxweb3/coin-kaspa';
import * as bip39 from 'bip39';

export interface KaspaWalletData {
  address: string;
  publicKey: string;
  privateKey: string; // Raw private key - encrypt before storing!
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  signedTx?: string;
  error?: string;
}

export interface WalletBalance {
  address: string;
  balanceKAS: string;
  balanceSompi: string; // Kaspa's smallest unit (1 KAS = 100,000,000 sompi)
}

export interface UTXO {
  txId: string;
  vOut: number;
  address: string;
  amount: number; // in sompi
  scriptPublicKey: string; // hex script for signing
}

// Network configuration
export type KaspaNetwork = 'mainnet' | 'testnet-10';

interface NetworkConfig {
  apiUrl: string;
  addressPrefix: string;
}

const NETWORK_CONFIGS: Record<KaspaNetwork, NetworkConfig> = {
  'mainnet': {
    apiUrl: 'https://api.kaspa.org',
    addressPrefix: 'kaspa:',
  },
  'testnet-10': {
    apiUrl: 'https://api-tn10.kaspa.org',
    addressPrefix: 'kaspatest:',
  },
};

// Current network - default to mainnet, use testnet for testing
let currentNetwork: KaspaNetwork = 'mainnet';

export function setNetwork(network: KaspaNetwork): void {
  currentNetwork = network;
}

export function getNetwork(): KaspaNetwork {
  return currentNetwork;
}

function getApiUrl(): string {
  return NETWORK_CONFIGS[currentNetwork].apiUrl;
}

// HD derivation path for Kaspa (BIP44)
// m/44'/111111'/0'/0/0 - coin type 111111 is Kaspa
const KASPA_HD_PATH = "m/44'/111111'/0'/0/0";

// Initialize the OKX Kaspa wallet SDK
const kaspaWalletSDK = new KaspaWallet();

// Generate a new Kaspa wallet from a mnemonic phrase
export async function generateWalletFromMnemonic(mnemonic: string): Promise<KaspaWalletData> {
  // Derive private key from mnemonic using Kaspa's HD path
  const privateKey = await kaspaWalletSDK.getDerivedPrivateKey({
    mnemonic,
    hdPath: KASPA_HD_PATH,
  });
  
  // Get address from private key
  const addressResult = await kaspaWalletSDK.getNewAddress({
    privateKey,
  });
  
  return {
    address: addressResult.address,
    publicKey: addressResult.publicKey || '',
    privateKey,
  };
}

// Generate a new random wallet (generates mnemonic internally)
export async function generateWallet(): Promise<{ wallet: KaspaWalletData; mnemonic: string }> {
  // Generate a BIP39 mnemonic (24 words for maximum security)
  const mnemonic = generateMnemonic();
  
  const wallet = await generateWalletFromMnemonic(mnemonic);
  
  return { wallet, mnemonic };
}

// Generate a BIP39 mnemonic phrase using proper entropy
// SECURITY: Uses bip39 library for proper 24-word mnemonic with full 2048-word BIP39 wordlist
export function generateMnemonic(): string {
  // Generate 24-word mnemonic (256 bits of entropy)
  // bip39.generateMnemonic uses crypto.randomBytes internally for secure entropy
  return bip39.generateMnemonic(256);
}

// Validate a Kaspa address
export async function validateAddress(address: string): Promise<boolean> {
  try {
    const result = await kaspaWalletSDK.validAddress({ address });
    return result.isValid;
  } catch {
    return false;
  }
}

// Validate a private key
export async function validatePrivateKey(privateKey: string): Promise<boolean> {
  try {
    const result = await kaspaWalletSDK.validPrivateKey({ privateKey });
    return result.isValid;
  } catch {
    return false;
  }
}

// Get wallet from private key
export async function getWalletFromPrivateKey(privateKey: string): Promise<KaspaWalletData> {
  const addressResult = await kaspaWalletSDK.getNewAddress({ privateKey });
  
  return {
    address: addressResult.address,
    publicKey: addressResult.publicKey || '',
    privateKey,
  };
}

// Simple encryption for private key storage using AES-GCM
export async function encryptPrivateKey(privateKey: string, pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(privateKey);
  
  // Derive key from PIN using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine salt + iv + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Decrypt private key with PIN
export async function decryptPrivateKey(encryptedData: string, pin: string): Promise<string | null> {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(pin),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return decoder.decode(decrypted);
  } catch {
    return null; // Wrong PIN or corrupted data
  }
}

// Hash PIN for storage using PBKDF2 with random salt
// SECURITY: Each hash has unique salt, stored as salt:hash format
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Use PBKDF2 for proper password hashing
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  
  // Return salt:hash format
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

// Verify PIN against stored hash (supports both old and new format)
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  
  // Check if new format (contains colon separator)
  if (storedHash.includes(':')) {
    const [saltHex, hashHex] = storedHash.split(':');
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(pin),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const hashBuffer = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    
    const computedHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computedHash === hashHex;
  }
  
  // Legacy format support (old static salt) - for migration
  const data = encoder.encode(pin + 'kaspay_salt_v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const legacyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return legacyHash === storedHash;
}

// Query wallet balance from Kaspa network
export async function getWalletBalance(address: string): Promise<WalletBalance | null> {
  try {
    const response = await fetch(`${getApiUrl()}/addresses/${address}/balance`);
    
    if (!response.ok) {
      return {
        address,
        balanceKAS: '0.00',
        balanceSompi: '0',
      };
    }
    
    const data = await response.json() as { balance: number };
    const balanceSompi = data.balance || 0;
    const balanceKAS = (balanceSompi / 100000000).toFixed(8);
    
    return {
      address,
      balanceKAS,
      balanceSompi: balanceSompi.toString(),
    };
  } catch (error) {
    console.error('Kaspa balance query error:', error);
    return {
      address,
      balanceKAS: '0.00',
      balanceSompi: '0',
    };
  }
}

// Get UTXOs for an address
export async function getUTXOs(address: string): Promise<UTXO[]> {
  try {
    const response = await fetch(`${getApiUrl()}/addresses/${address}/utxos`);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json() as Array<{
      outpoint: { transactionId: string; index: number };
      utxoEntry: { amount: string; scriptPublicKey: { scriptPublicKey: string } };
    }>;
    
    return data.map(utxo => ({
      txId: utxo.outpoint.transactionId,
      vOut: utxo.outpoint.index,
      address,
      amount: parseInt(utxo.utxoEntry.amount, 10),
      scriptPublicKey: utxo.utxoEntry.scriptPublicKey.scriptPublicKey,
    }));
  } catch (error) {
    console.error('Kaspa UTXO query error:', error);
    return [];
  }
}

// Get transaction history for an address
export async function getTransactionHistory(address: string, limit = 20) {
  try {
    const response = await fetch(
      `${getApiUrl()}/addresses/${address}/full-transactions?limit=${limit}`
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json() as Array<{
      transaction_id: string;
      block_time: number;
      outputs: Array<{ script_public_key_address: string; amount: number }>;
    }>;
    
    return data.map(tx => ({
      transactionId: tx.transaction_id,
      timestamp: new Date(tx.block_time * 1000).toISOString(),
      outputs: tx.outputs,
    }));
  } catch (error) {
    console.error('Kaspa transaction history error:', error);
    return [];
  }
}

// Sign a Kaspa transaction using OKX SDK's transfer function
export async function signTransaction(
  inputs: UTXO[],
  toAddress: string,
  amountSompi: number,
  feeSompi: number,
  changeAddress: string,
  privateKey: string
): Promise<TransactionResult> {
  try {
    // Calculate total input amount
    const totalInput = inputs.reduce((sum, utxo) => sum + utxo.amount, 0);
    const changeAmount = totalInput - amountSompi - feeSompi;
    
    if (changeAmount < 0) {
      return {
        success: false,
        error: 'Insufficient funds',
      };
    }
    
    // Build txData for OKX SDK transfer function
    // OKX SDK expects inputs with address field, outputs with address/amount
    const txData = {
      inputs: inputs.map(utxo => ({
        txId: utxo.txId,
        vOut: utxo.vOut,
        amount: utxo.amount,
        address: utxo.address,
      })),
      outputs: [
        { address: toAddress, amount: amountSompi.toString() },
      ],
      fee: feeSompi.toString(),
      address: changeAddress, // Change address
      dustSize: '546', // Minimum output size
    };
    
    console.log('=== OKX SDK TX BUILD START ===');
    console.log('TxData:', JSON.stringify(txData, null, 2));
    console.log('=== OKX SDK TX BUILD END ===');
    
    // Use OKX SDK transfer function - returns JSON string ready for API
    const signedTx = transfer(txData, privateKey);
    
    console.log('=== OKX SDK SIGNED TX START ===');
    console.log(signedTx);
    console.log('=== OKX SDK SIGNED TX END ===');
    
    return {
      success: true,
      signedTx,
    };
  } catch (error) {
    console.error('Kaspa transaction signing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction signing failed',
    };
  }
}

// Submit a signed transaction to the Kaspa network
// Pure JS builder outputs transaction in correct Kaspa API format
export async function submitTransaction(signedTx: string): Promise<TransactionResult & { needsConsolidation?: boolean }> {
  try {
    // The signedTx from pure JS builder is already in correct API format
    const transactionBody = signedTx;
    
    // FULL transaction logging for debugging mass issues
    console.log('=== FULL TRANSACTION BODY START ===');
    console.log(transactionBody);
    console.log('=== FULL TRANSACTION BODY END ===');
    console.log('Transaction body length:', transactionBody.length);
    
    const response = await fetch(`${getApiUrl()}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: transactionBody,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Kaspa API rejected transaction. Status:', response.status, 'Response:', errorText);
      
      // Try to parse JSON error for better message
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          errorMessage = typeof errorJson.error === 'string' ? errorJson.error : JSON.stringify(errorJson.error);
        }
      } catch {
        // Not JSON, use raw text
      }
      
      // Check if the error is SPECIFICALLY due to transaction storage mass limit (too many UTXOs)
      // Be very specific to avoid false positives - only match "storage mass" not other mass errors
      const errorLower = errorMessage.toLowerCase();
      const isStorageMassError = errorLower.includes('storage mass') && errorLower.includes('larger than max');
      
      // Log for debugging
      console.log('Transaction error analysis:', { isStorageMassError, errorMessage });
      
      return {
        success: false,
        error: errorMessage,
        needsConsolidation: isStorageMassError,
      };
    }
    
    const result = await response.json() as { transactionId: string };
    console.log('Transaction submitted successfully:', result);
    
    return {
      success: true,
      transactionId: result.transactionId,
    };
  } catch (error) {
    console.error('Kaspa transaction submission error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction submission failed',
    };
  }
}

// Maximum UTXOs per transaction to avoid mass limit errors
// Kaspa has a transaction mass limit of ~100000, each input adds ~1000+ mass
const MAX_UTXOS_PER_TX = 50;

// Consolidate UTXOs by sending to self (reduces many small UTXOs into fewer larger ones)
export async function consolidateUTXOs(
  address: string,
  privateKey: string,
  feeSompi: number = 50000 // 0.0005 KAS - network minimum varies
): Promise<TransactionResult & { consolidated?: number }> {
  try {
    const utxos = await getUTXOs(address);
    
    // Need at least 2 UTXOs to consolidate (combine them into 1)
    if (utxos.length <= 1) {
      return {
        success: true,
        consolidated: 0,
        transactionId: 'no-consolidation-needed',
      };
    }
    
    // Sort smallest first so we consolidate the dust UTXOs that cause the most trouble
    utxos.sort((a, b) => a.amount - b.amount);
    
    // Take first batch of UTXOs to consolidate
    const batchUtxos = utxos.slice(0, MAX_UTXOS_PER_TX);
    const batchTotal = batchUtxos.reduce((sum, u) => sum + u.amount, 0);
    const sendAmount = batchTotal - feeSompi;
    
    if (sendAmount <= 0) {
      return {
        success: false,
        error: 'UTXOs too small to consolidate',
      };
    }
    
    // Send to self to consolidate
    const signResult = await signTransaction(
      batchUtxos,
      address,
      sendAmount,
      feeSompi,
      address,
      privateKey
    );
    
    if (!signResult.success || !signResult.signedTx) {
      return signResult;
    }
    
    const submitResult = await submitTransaction(signResult.signedTx);
    return {
      ...submitResult,
      consolidated: batchUtxos.length,
    };
  } catch (error) {
    console.error('UTXO consolidation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Consolidation failed',
    };
  }
}

// Auto-consolidation threshold - consolidate when UTXOs reach this count
const AUTO_CONSOLIDATE_THRESHOLD = 30;

// Check and auto-consolidate if needed (runs in background, doesn't block)
export async function autoConsolidateIfNeeded(
  address: string,
  privateKey: string
): Promise<void> {
  try {
    const utxos = await getUTXOs(address);
    
    if (utxos.length >= AUTO_CONSOLIDATE_THRESHOLD) {
      console.log(`Auto-consolidating wallet ${address.slice(0, 20)}... (${utxos.length} UTXOs)`);
      const result = await consolidateUTXOs(address, privateKey);
      if (result.success) {
        console.log(`Auto-consolidation complete: ${result.consolidated} UTXOs consolidated, txId: ${result.transactionId}`);
      } else {
        console.error(`Auto-consolidation failed: ${result.error}`);
      }
    }
  } catch (error) {
    // Don't throw - auto-consolidation is best-effort and shouldn't break transactions
    console.error('Auto-consolidation check failed:', error);
  }
}

// Create and submit a full transaction (convenience function)
export async function sendTransaction(
  fromAddress: string,
  toAddress: string,
  amountSompi: number,
  privateKey: string,
  feeSompi: number = 50000 // Default fee of 0.0005 KAS - network minimum varies
): Promise<TransactionResult & { needsConsolidation?: boolean; utxoCount?: number }> {
  try {
    console.log('sendTransaction called:', { fromAddress, toAddress, amountSompi, feeSompi });
    
    // Get UTXOs for the sender
    const utxos = await getUTXOs(fromAddress);
    console.log('UTXOs fetched:', { count: utxos.length, utxos: utxos.slice(0, 5) });
    
    if (utxos.length === 0) {
      return {
        success: false,
        error: 'No UTXOs available',
      };
    }
    
    // Sort UTXOs by amount descending (largest first) to minimize UTXO count needed
    utxos.sort((a, b) => b.amount - a.amount);
    
    // Select UTXOs to cover amount + fee
    const requiredAmount = amountSompi + feeSompi;
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
        error: `Insufficient funds. Need ${requiredAmount} sompi, have ${totalSelected} sompi`,
      };
    }
    
    // Check if too many UTXOs needed - would exceed mass limit
    console.log('Selected UTXOs for transaction:', { count: selectedUtxos.length, totalSelected, requiredAmount });
    
    if (selectedUtxos.length > MAX_UTXOS_PER_TX) {
      console.log('Too many UTXOs, needs consolidation:', selectedUtxos.length);
      return {
        success: false,
        error: 'Too many UTXOs needed for this transaction. Please consolidate your wallet first.',
        needsConsolidation: true,
        utxoCount: selectedUtxos.length,
      };
    }
    
    // Sign the transaction
    const signResult = await signTransaction(
      selectedUtxos,
      toAddress,
      amountSompi,
      feeSompi,
      fromAddress, // Change goes back to sender
      privateKey
    );
    
    if (!signResult.success || !signResult.signedTx) {
      return signResult;
    }
    
    // Submit to network
    return await submitTransaction(signResult.signedTx);
  } catch (error) {
    console.error('Kaspa send transaction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction failed',
    };
  }
}

// Sign a message with private key
export async function signMessage(message: string, privateKey: string): Promise<string> {
  const result = await kaspaWalletSDK.signMessage({
    privateKey,
    data: { message },
  });
  return result;
}

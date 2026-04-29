import { useState } from 'react';

interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  JPY: number;
}

interface KnsResolution {
  domain: string;
  walletAddress: string;
  isValid: boolean;
}

interface KaspayUsernameResolution {
  username: string;
  walletAddress: string;
}

interface TransactionResult {
  success: boolean;
  transactionId?: string;
  recipientAddress?: string;
  recipientDomain?: string;
  amountKAS?: string;
  amountFiat?: string;
  currency?: string;
  timestamp?: string;
  error?: string;
}

interface WalletBalance {
  address: string;
  balanceKAS: string;
  balanceUSD: string;
  timestamp: string;
}

interface Transaction {
  id: number;
  transactionId: string;
  to: string;
  toAddress: string;
  amount: string;
  currency: string;
  amountKAS: string;
  timestamp: string;
  status: string;
}

export function useKaspaApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveKnsDomain = async (domain: string): Promise<KnsResolution | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/kns/resolve/${domain}`);
      if (!response.ok) throw new Error('Failed to resolve domain');
      return await response.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const resolveKaspayUsername = async (username: string): Promise<KaspayUsernameResolution | null> => {
    setLoading(true);
    setError(null);
    try {
      const cleanUsername = username.replace(/^@/, '');
      const response = await fetch(`/api/wallet/resolve/${cleanUsername}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getExchangeRates = async (): Promise<ExchangeRates | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rates');
      if (!response.ok) throw new Error('Failed to fetch rates');
      const data = await response.json();
      return data.rates;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const sendTransaction = async (
    recipientDomain: string,
    amount: string,
    currency: string,
    senderAddress: string
  ): Promise<TransactionResult> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/transactions/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientDomain,
          amount,
          currency,
          senderAddress,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        setError(result.error || 'Transaction failed');
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Transaction failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  const getWalletBalance = async (address: string): Promise<WalletBalance | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/wallet/balance/${address}`);
      if (!response.ok) throw new Error('Failed to fetch balance');
      return await response.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getTransactionHistory = async (address: string): Promise<Transaction[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/transactions/history/${address}`);
      if (!response.ok) throw new Error('Failed to fetch transaction history');
      const data = await response.json();
      return data.transactions;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const checkDomainAvailability = async (domain: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/kns/check/${domain}`);
      if (!response.ok) throw new Error('Failed to check availability');
      const data = await response.json();
      return data.isAvailable;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const registerDomain = async (
    domain: string,
    walletAddress: string
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/kns/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, walletAddress }),
      });
      const result = await response.json();
      if (!result.success) {
        setError(result.error || 'Registration failed');
      }
      return result.success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    resolveKnsDomain,
    resolveKaspayUsername,
    getExchangeRates,
    sendTransaction,
    getWalletBalance,
    getTransactionHistory,
    checkDomainAvailability,
    registerDomain,
  };
}

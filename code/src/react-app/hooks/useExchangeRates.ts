import { useState, useEffect, useCallback } from 'react';

export interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  JPY: number;
  CAD: number;
  AUD: number;
  CHF: number;
  CNY: number;
  INR: number;
  KRW: number;
  SGD: number;
  HKD: number;
  BRL: number;
  MXN: number;
  SEK: number;
  NOK: number;
  DKK: number;
  NZD: number;
  ZAR: number;
  AED: number;
  KAS: number;
}

export type CurrencyCode = keyof ExchangeRates;

interface UseExchangeRatesReturn {
  rates: ExchangeRates;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  kasToFiat: (kasAmount: number, currency: CurrencyCode) => number;
  fiatToKas: (fiatAmount: number, currency: CurrencyCode) => number;
  formatFiat: (amount: number, currency: string) => string;
  formatKas: (amount: number) => string;
}

// Default fallback rates (used if API fails)
const DEFAULT_RATES: ExchangeRates = {
  USD: 0.15,
  EUR: 0.14,
  GBP: 0.12,
  JPY: 22.5,
  CAD: 0.21,
  AUD: 0.23,
  CHF: 0.13,
  CNY: 1.08,
  INR: 12.5,
  KRW: 200,
  SGD: 0.20,
  HKD: 1.17,
  BRL: 0.75,
  MXN: 2.55,
  SEK: 1.55,
  NOK: 1.62,
  DKK: 1.04,
  NZD: 0.25,
  ZAR: 2.75,
  AED: 0.55,
  KAS: 1, // 1 KAS = 1 KAS
};

// Currency formatting configuration
const CURRENCY_CONFIG: Record<string, { symbol: string; position: 'before' | 'after'; decimals: number }> = {
  USD: { symbol: '$', position: 'before', decimals: 2 },
  EUR: { symbol: '€', position: 'before', decimals: 2 },
  GBP: { symbol: '£', position: 'before', decimals: 2 },
  JPY: { symbol: '¥', position: 'before', decimals: 0 },
  CAD: { symbol: 'C$', position: 'before', decimals: 2 },
  AUD: { symbol: 'A$', position: 'before', decimals: 2 },
  CHF: { symbol: 'CHF ', position: 'before', decimals: 2 },
  CNY: { symbol: '¥', position: 'before', decimals: 2 },
  INR: { symbol: '₹', position: 'before', decimals: 2 },
  KRW: { symbol: '₩', position: 'before', decimals: 0 },
  SGD: { symbol: 'S$', position: 'before', decimals: 2 },
  HKD: { symbol: 'HK$', position: 'before', decimals: 2 },
  BRL: { symbol: 'R$', position: 'before', decimals: 2 },
  MXN: { symbol: 'MX$', position: 'before', decimals: 2 },
  SEK: { symbol: 'kr', position: 'after', decimals: 2 },
  NOK: { symbol: 'kr', position: 'after', decimals: 2 },
  DKK: { symbol: 'kr', position: 'after', decimals: 2 },
  NZD: { symbol: 'NZ$', position: 'before', decimals: 2 },
  ZAR: { symbol: 'R', position: 'before', decimals: 2 },
  AED: { symbol: 'د.إ', position: 'before', decimals: 2 },
  KAS: { symbol: '', position: 'after', decimals: 4 },
};

// Auto-refresh interval (30 seconds)
const REFRESH_INTERVAL = 30000;

export function useExchangeRates(): UseExchangeRatesReturn {
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/rates');
      if (!response.ok) {
        throw new Error('Failed to fetch rates');
      }
      
      const data = await response.json();
      if (data.rates) {
        setRates(data.rates);
        setLastUpdated(new Date(data.timestamp || Date.now()));
      }
    } catch (err) {
      console.error('Failed to fetch exchange rates:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Keep using existing/default rates on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchRates();
    
    const interval = setInterval(fetchRates, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchRates]);

  // Convert KAS to fiat (or KAS if currency is KAS)
  const kasToFiat = useCallback((kasAmount: number, currency: CurrencyCode): number => {
    if (currency === 'KAS') return kasAmount;
    const rate = rates[currency];
    if (!rate || rate === 0) return 0;
    return kasAmount * rate;
  }, [rates]);

  // Convert fiat to KAS (or pass through if currency is KAS)
  const fiatToKas = useCallback((fiatAmount: number, currency: CurrencyCode): number => {
    if (currency === 'KAS') return fiatAmount;
    const rate = rates[currency];
    if (!rate || rate === 0) return 0;
    return fiatAmount / rate;
  }, [rates]);

  // Format fiat amount with currency symbol
  const formatFiat = useCallback((amount: number, currency: string): string => {
    const config = CURRENCY_CONFIG[currency] || { symbol: currency + ' ', position: 'before', decimals: 2 };
    
    const formattedAmount = amount.toLocaleString(undefined, {
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    });
    
    if (config.position === 'after') {
      return `${formattedAmount} ${config.symbol}`;
    }
    return `${config.symbol}${formattedAmount}`;
  }, []);

  // Format KAS amount
  const formatKas = useCallback((amount: number): string => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M KAS`;
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K KAS`;
    }
    return `${amount.toFixed(4)} KAS`;
  }, []);

  return {
    rates,
    loading,
    error,
    lastUpdated,
    refresh: fetchRates,
    kasToFiat,
    fiatToKas,
    formatFiat,
    formatKas,
  };
}

// CoinGecko API service for real-time KAS exchange rates

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
  KAS: number; // 1 KAS = 1 KAS (for users who prefer native display)
  timestamp: string;
}

// All supported currencies for CoinGecko API
const SUPPORTED_CURRENCIES = [
  'usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'chf', 'cny', 
  'inr', 'krw', 'sgd', 'hkd', 'brl', 'mxn', 'sek', 'nok',
  'dkk', 'nzd', 'zar', 'aed'
];

// Cache rates for 60 seconds to avoid hitting API limits
let cachedRates: ExchangeRates | null = null;
let cacheTime = 0;
const CACHE_DURATION = 60000; // 1 minute

// Fallback rates (approximate values)
const FALLBACK_RATES: ExchangeRates = {
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
  KAS: 1, // Native display
  timestamp: new Date().toISOString(),
};

export async function getKaspaExchangeRates(apiKey?: string): Promise<ExchangeRates> {
  const now = Date.now();
  
  // Return cached rates if still valid
  if (cachedRates && (now - cacheTime) < CACHE_DURATION) {
    return cachedRates;
  }
  
  try {
    // CoinGecko API - always use the free API endpoint
    const baseUrl = 'https://api.coingecko.com/api/v3';
    
    const currencyList = SUPPORTED_CURRENCIES.join(',');
    const url = `${baseUrl}/simple/price?ids=kaspa&vs_currencies=${currencyList}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.error('CoinGecko API error:', response.status, await response.text());
      return getFallbackRates();
    }
    
    const data = await response.json() as { kaspa?: Record<string, number> };
    
    if (!data.kaspa) {
      console.error('No Kaspa data from CoinGecko');
      return getFallbackRates();
    }
    
    cachedRates = {
      USD: data.kaspa.usd || FALLBACK_RATES.USD,
      EUR: data.kaspa.eur || FALLBACK_RATES.EUR,
      GBP: data.kaspa.gbp || FALLBACK_RATES.GBP,
      JPY: data.kaspa.jpy || FALLBACK_RATES.JPY,
      CAD: data.kaspa.cad || FALLBACK_RATES.CAD,
      AUD: data.kaspa.aud || FALLBACK_RATES.AUD,
      CHF: data.kaspa.chf || FALLBACK_RATES.CHF,
      CNY: data.kaspa.cny || FALLBACK_RATES.CNY,
      INR: data.kaspa.inr || FALLBACK_RATES.INR,
      KRW: data.kaspa.krw || FALLBACK_RATES.KRW,
      SGD: data.kaspa.sgd || FALLBACK_RATES.SGD,
      HKD: data.kaspa.hkd || FALLBACK_RATES.HKD,
      BRL: data.kaspa.brl || FALLBACK_RATES.BRL,
      MXN: data.kaspa.mxn || FALLBACK_RATES.MXN,
      SEK: data.kaspa.sek || FALLBACK_RATES.SEK,
      NOK: data.kaspa.nok || FALLBACK_RATES.NOK,
      DKK: data.kaspa.dkk || FALLBACK_RATES.DKK,
      NZD: data.kaspa.nzd || FALLBACK_RATES.NZD,
      ZAR: data.kaspa.zar || FALLBACK_RATES.ZAR,
      AED: data.kaspa.aed || FALLBACK_RATES.AED,
      KAS: 1, // Native display (1 KAS = 1 KAS)
      timestamp: new Date().toISOString(),
    };
    cacheTime = now;
    
    return cachedRates;
  } catch (error) {
    console.error('CoinGecko fetch error:', error);
    return getFallbackRates();
  }
}

function getFallbackRates(): ExchangeRates {
  return { ...FALLBACK_RATES, timestamp: new Date().toISOString() };
}

// Convert fiat to KAS
export function fiatToKas(amount: number, currency: string, rates: ExchangeRates): number {
  const rate = (rates as unknown as Record<string, number | string>)[currency];
  if (typeof rate !== 'number' || rate <= 0) return 0;
  return amount / rate;
}

// Convert KAS to fiat
export function kasToFiat(kasAmount: number, currency: string, rates: ExchangeRates): number {
  const rate = (rates as unknown as Record<string, number | string>)[currency];
  if (typeof rate !== 'number') return 0;
  return kasAmount * rate;
}

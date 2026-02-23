import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useExchangeRates } from '../hooks/useExchangeRates';

interface LiveBalanceProps {
  balanceKAS: string;
  preferredCurrency?: 'USD' | 'EUR' | 'GBP' | 'JPY';
  showKAS?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LiveBalance({
  balanceKAS,
  preferredCurrency = 'USD',
  showKAS = true,
  size = 'md',
  className = '',
}: LiveBalanceProps) {
  const { kasToFiat, formatFiat, loading, lastUpdated } = useExchangeRates();
  const [previousFiat, setPreviousFiat] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | null>(null);

  const kasAmount = parseFloat(balanceKAS) || 0;
  const fiatAmount = kasToFiat(kasAmount, preferredCurrency);

  // Track price changes for animation
  useEffect(() => {
    if (previousFiat !== null && fiatAmount !== previousFiat) {
      setPriceDirection(fiatAmount > previousFiat ? 'up' : 'down');
      const timer = setTimeout(() => setPriceDirection(null), 2000);
      return () => clearTimeout(timer);
    }
    setPreviousFiat(fiatAmount);
  }, [fiatAmount, previousFiat]);

  const sizeClasses = {
    sm: {
      fiat: 'text-lg font-semibold',
      kas: 'text-xs',
      icon: 'w-3 h-3',
    },
    md: {
      fiat: 'text-2xl font-bold',
      kas: 'text-sm',
      icon: 'w-4 h-4',
    },
    lg: {
      fiat: 'text-4xl font-bold',
      kas: 'text-base',
      icon: 'w-5 h-5',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2">
        <span
          className={`${classes.fiat} text-white transition-colors duration-500 ${
            priceDirection === 'up'
              ? 'text-green-400'
              : priceDirection === 'down'
              ? 'text-red-400'
              : ''
          }`}
        >
          {formatFiat(fiatAmount, preferredCurrency)}
        </span>
        
        {priceDirection && (
          <span className={`transition-opacity duration-500 ${priceDirection ? 'opacity-100' : 'opacity-0'}`}>
            {priceDirection === 'up' ? (
              <TrendingUp className={`${classes.icon} text-green-400`} />
            ) : (
              <TrendingDown className={`${classes.icon} text-red-400`} />
            )}
          </span>
        )}
        
        {loading && (
          <RefreshCw className={`${classes.icon} text-white/40 animate-spin`} />
        )}
      </div>
      
      {showKAS && (
        <div className={`${classes.kas} text-white/50 flex items-center gap-1`}>
          <span>{kasAmount.toFixed(4)} KAS</span>
          {lastUpdated && (
            <span className="text-white/30">
              • {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

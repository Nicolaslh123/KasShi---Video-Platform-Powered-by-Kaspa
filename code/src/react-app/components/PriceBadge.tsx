import { Coins } from 'lucide-react';

interface PriceBadgeProps {
  priceKas?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function PriceBadge({ priceKas, size = 'sm', className = '' }: PriceBadgeProps) {
  const price = parseFloat(priceKas || '0');
  const isFree = price === 0 || !priceKas;
  
  const sizeClasses = size === 'sm' 
    ? 'px-1.5 py-0.5 text-xs gap-1' 
    : 'px-2 py-1 text-sm gap-1.5';
  
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  
  if (isFree) {
    return (
      <span className={`inline-flex items-center ${sizeClasses} bg-blue-500/20 text-blue-300 rounded font-medium ${className}`}>
        Free
      </span>
    );
  }
  
  return (
    <span className={`inline-flex items-center ${sizeClasses} bg-green-500/20 text-green-300 rounded font-medium ${className}`}>
      <Coins className={iconSize} />
      {price.toFixed(2)} KAS
    </span>
  );
}

export default PriceBadge;

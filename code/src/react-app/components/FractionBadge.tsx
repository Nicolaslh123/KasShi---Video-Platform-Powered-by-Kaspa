import { PieChart } from 'lucide-react';

interface FractionBadgeProps {
  ticker: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function FractionBadge({ ticker, className = '', size = 'sm' }: FractionBadgeProps) {
  const sizeClasses = size === 'sm' 
    ? 'text-[10px] px-1.5 py-0.5 gap-0.5'
    : 'text-xs px-2 py-1 gap-1';
  
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  
  return (
    <span 
      className={`inline-flex items-center ${sizeClasses} rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30 ${className}`}
      title={`Fractionalized as $${ticker}`}
    >
      <PieChart className={iconSize} />
      ${ticker}
    </span>
  );
}

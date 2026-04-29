import { useState, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { usePayment } from './usePayment';

interface PurchaseResult {
  canPlay: boolean;
  needsPurchase: boolean;
  price: string;
}

export function useMusicPurchase() {
  const { externalWallet, isConnected, balance } = useWallet();
  const { pay } = usePayment();
  const [isPurchasing, setIsPurchasing] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (externalWallet?.authToken) {
      headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
    }
    return headers;
  }, [externalWallet?.authToken]);

  const checkPurchase = useCallback(async (
    contentType: 'track' | 'episode',
    contentId: number,
    priceKas: string
  ): Promise<PurchaseResult> => {
    const price = parseFloat(priceKas || '0');
    
    // Free content
    if (price === 0) {
      return { canPlay: true, needsPurchase: false, price: '0' };
    }
    
    // Not logged in
    if (!isConnected && !externalWallet) {
      return { canPlay: false, needsPurchase: true, price: priceKas };
    }
    
    try {
      const res = await fetch(
        `/api/music/purchase/check?type=${contentType}&id=${contentId}`,
        { headers: getAuthHeaders(), credentials: 'include' }
      );
      const data = await res.json();
      
      if (data.purchased) {
        return { canPlay: true, needsPurchase: false, price: priceKas };
      }
      
      return { canPlay: false, needsPurchase: true, price: priceKas };
    } catch {
      return { canPlay: false, needsPurchase: true, price: priceKas };
    }
  }, [isConnected, externalWallet, getAuthHeaders]);

  const purchaseContent = useCallback(async (
    contentType: 'track' | 'episode',
    contentId: number,
    priceKas: string,
    creatorWallet: string
  ): Promise<{ success: boolean; error?: string }> => {
    const price = parseFloat(priceKas || '0');
    
    if (price === 0) {
      return { success: true };
    }
    
    if (!isConnected && !externalWallet) {
      return { success: false, error: 'Please connect your wallet' };
    }
    
    const currentBalance = parseFloat(balance || '0');
    if (currentBalance < price) {
      return { success: false, error: `Insufficient balance. Need ${price} KAS` };
    }
    
    setIsPurchasing(true);
    
    try {
      // Make payment to creator (95% to creator, 5% platform fee handled by backend)
      const payResult = await pay(creatorWallet, price, {
        paymentType: 'music_purchase',
      });
      
      if (!payResult.success || !payResult.transactionId) {
        setIsPurchasing(false);
        return { success: false, error: payResult.error || 'Payment failed' };
      }
      
      // Record purchase
      const res = await fetch('/api/music/purchase', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          contentType,
          contentId,
          transactionId: payResult.transactionId,
        }),
      });
      
      if (!res.ok) {
        setIsPurchasing(false);
        return { success: false, error: 'Failed to record purchase' };
      }
      
      setIsPurchasing(false);
      return { success: true };
    } catch (err) {
      setIsPurchasing(false);
      return { success: false, error: 'Purchase failed' };
    }
  }, [isConnected, externalWallet, balance, pay, getAuthHeaders]);

  return {
    checkPurchase,
    purchaseContent,
    isPurchasing,
  };
}

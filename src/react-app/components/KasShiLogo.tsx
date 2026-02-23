import React from "react";

interface KasShiLogoProps {
  size?: number;
  className?: string;
}

// KasShi main logo - served from app's own domain via /api/static/
// This avoids antivirus blocking mochausercontent.com CDN
export const KasShiLogo: React.FC<KasShiLogoProps> = ({ size = 32, className = "" }) => (
  <img
    src="/api/static/kasshi-logo"
    alt="KasShi"
    width={size}
    height={size}
    className={`rounded-full flex-shrink-0 object-contain ${className}`}
    loading="eager"
  />
);

// Kaspa/KAS currency icon - served from app's own domain
export const KaspaIcon: React.FC<{ size?: number; className?: string }> = ({ 
  size = 16, 
  className = "" 
}) => (
  <img
    src="/api/static/kaspa-icon"
    alt="KAS"
    width={size}
    height={size}
    className={`rounded-full flex-shrink-0 object-contain ${className}`}
    loading="eager"
  />
);

export default KasShiLogo;

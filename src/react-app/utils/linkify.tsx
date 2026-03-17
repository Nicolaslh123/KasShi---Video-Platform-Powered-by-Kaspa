import React from 'react';

/**
 * Converts URLs in text to clickable links
 * Supports http, https, and www. prefixed URLs
 */
export function linkifyText(text: string): React.ReactNode {
  if (!text) return text;
  
  // URL regex pattern - matches http://, https://, and www. URLs
  const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  
  const parts = text.split(urlPattern);
  
  return parts.map((part, index) => {
    // Check if this part matches the URL pattern
    if (urlPattern.test(part)) {
      // Reset lastIndex since we're reusing the regex
      urlPattern.lastIndex = 0;
      
      // Add https:// if URL starts with www.
      const href = part.startsWith('www.') ? `https://${part}` : part;
      
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-primary hover:text-primary/80 hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

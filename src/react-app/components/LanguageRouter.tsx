import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useLanguage, Language, languages } from '../contexts/LanguageContext';

// Valid language codes for URL routing
const validLangCodes = languages.map(l => l.code);

export function extractLanguageFromPath(pathname: string): { lang: Language | null; restPath: string } {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();
  
  if (firstSegment && validLangCodes.includes(firstSegment as Language)) {
    return {
      lang: firstSegment as Language,
      restPath: '/' + segments.slice(1).join('/') || '/'
    };
  }
  
  return { lang: null, restPath: pathname };
}

export function buildLocalizedPath(path: string, lang: Language): string {
  // Extract any existing language from the path
  const { restPath } = extractLanguageFromPath(path);
  
  // For English, don't add prefix (it's the default)
  if (lang === 'en') {
    return restPath || '/';
  }
  
  // Add language prefix
  const cleanPath = restPath.startsWith('/') ? restPath : '/' + restPath;
  return `/${lang}${cleanPath === '/' ? '' : cleanPath}`;
}

export default function LanguageRouter() {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  
  // On mount and URL change, sync language from URL
  useEffect(() => {
    const { lang } = extractLanguageFromPath(location.pathname);
    
    if (lang && lang !== language) {
      // URL has a different language, update context
      setLanguage(lang);
    }
  }, [location.pathname]);
  
  // When language changes (via UI), update URL
  useEffect(() => {
    const { lang, restPath } = extractLanguageFromPath(location.pathname);
    const currentUrlLang = lang || 'en';
    
    if (currentUrlLang !== language) {
      // Language was changed via UI, update URL
      const newPath = buildLocalizedPath(restPath + location.search, language);
      navigate(newPath, { replace: true });
    }
  }, [language]);
  
  return <Outlet />;
}

// Hook for language-aware navigation
export function useLocalizedNavigate() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  
  return useCallback((to: string, options?: { replace?: boolean; state?: unknown }) => {
    const localizedPath = buildLocalizedPath(to, language);
    navigate(localizedPath, options);
  }, [navigate, language]);
}

// Hook to get localized path for Link components
export function useLocalizedPath() {
  const { language } = useLanguage();
  
  return (path: string) => buildLocalizedPath(path, language);
}

import { Link, LinkProps } from 'react-router-dom';
import { useLanguage, Language, languages } from '../contexts/LanguageContext';

const validLangCodes = languages.map(l => l.code);

function extractLanguageFromPath(pathname: string): { lang: Language | null; restPath: string } {
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
  // Handle external URLs
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
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

interface LocalizedLinkProps extends Omit<LinkProps, 'to'> {
  to: string;
}

export default function LocalizedLink({ to, children, ...props }: LocalizedLinkProps) {
  const { language } = useLanguage();
  const localizedTo = buildLocalizedPath(to, language);
  
  return (
    <Link to={localizedTo} {...props}>
      {children}
    </Link>
  );
}

// Hook for programmatic navigation with language support
export function useLocalizedPath() {
  const { language } = useLanguage();
  return (path: string) => buildLocalizedPath(path, language);
}

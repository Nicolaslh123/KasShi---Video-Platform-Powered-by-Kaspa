import { KasShiLogo, KaspaIcon } from "./KasShiLogo";
import { useLanguage } from "../contexts/LanguageContext";
import LocalizedLink from "./LocalizedLink";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { t } = useLanguage();
  
  return (
    <footer className="mt-auto border-t border-white/10 bg-slate-950/50">
      {/* Main row - compact single line on desktop */}
      <div className="max-w-[1800px] mx-auto px-4 py-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-4">
          {/* Logo & Copyright */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <KasShiLogo size={20} />
            <span className="text-white/40 text-xs">
              © {currentYear} KasShi
            </span>
          </div>
          
          {/* Risk Warning - middle on desktop */}
          <p className="text-white/30 text-[10px] sm:text-xs text-center flex-1 max-w-2xl order-3 lg:order-2">
            ⚠️ {t.footer?.riskWarning || "Cryptocurrency involves significant risk. All transactions are final. Not financial advice. 18+ only."}
          </p>
          
          {/* Legal Links */}
          <nav className="flex items-center gap-3 sm:gap-4 text-xs flex-shrink-0 order-2 lg:order-3">
            <LocalizedLink 
              to="/legal" 
              className="text-white/50 hover:text-teal-400 transition-colors"
            >
              {t.footer?.privacy || "Privacy"}
            </LocalizedLink>
            <LocalizedLink 
              to="/legal" 
              className="text-white/50 hover:text-teal-400 transition-colors"
            >
              {t.footer?.terms || "Terms"}
            </LocalizedLink>
            <LocalizedLink 
              to="/legal" 
              className="text-white/50 hover:text-teal-400 transition-colors"
            >
              {t.footer?.dmca || "DMCA"}
            </LocalizedLink>
            <a 
              href="https://kaspa.org" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white/50 hover:text-teal-400 transition-colors flex items-center gap-1"
            >
              <KaspaIcon size={12} />
              {t.footer?.kaspa || "Kaspa"}
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

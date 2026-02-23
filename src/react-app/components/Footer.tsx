import { Link } from "react-router-dom";
import { KasShiLogo, KaspaIcon } from "./KasShiLogo";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
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
            ⚠️ Cryptocurrency involves significant risk. All transactions are final. Not financial advice. 18+ only.
          </p>
          
          {/* Legal Links */}
          <nav className="flex items-center gap-3 sm:gap-4 text-xs flex-shrink-0 order-2 lg:order-3">
            <Link 
              to="/legal" 
              className="text-white/50 hover:text-teal-400 transition-colors"
            >
              Privacy
            </Link>
            <Link 
              to="/legal" 
              className="text-white/50 hover:text-teal-400 transition-colors"
            >
              Terms
            </Link>
            <Link 
              to="/legal" 
              className="text-white/50 hover:text-teal-400 transition-colors"
            >
              DMCA
            </Link>
            <a 
              href="https://kaspa.org" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white/50 hover:text-teal-400 transition-colors flex items-center gap-1"
            >
              <KaspaIcon size={12} />
              Kaspa
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

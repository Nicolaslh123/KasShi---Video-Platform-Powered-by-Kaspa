import { useState, useEffect } from "react";
import { Flame } from "lucide-react";

interface SuperReact {
  id: number;
  userAddress: string;
  amountKas: number;
  commentText: string;
  isAnonymous: boolean;
  createdAt: string;
}

interface SuperReactsListProps {
  trackId: number;
  refreshTrigger?: number;
  limit?: number;
  compact?: boolean;
}

export function SuperReactsList({ trackId, refreshTrigger, limit, compact }: SuperReactsListProps) {
  const [superReacts, setSuperReacts] = useState<SuperReact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSuperReacts = async () => {
      try {
        const res = await fetch(`/api/kasshi/super-reacts/${trackId}`);
        if (res.ok) {
          const data = await res.json();
          setSuperReacts(data.superReacts || []);
        }
      } catch (error) {
        console.error("Failed to fetch super reacts:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuperReacts();
  }, [trackId, refreshTrigger]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 bg-slate-800/50 rounded-xl" />
        ))}
      </div>
    );
  }

  if (superReacts.length === 0) {
    return compact ? null : (
      <p className="text-slate-500 text-sm">No super reacts yet. Be the first!</p>
    );
  }

  const displayReacts = limit ? superReacts.slice(0, limit) : superReacts;

  const formatAddress = (address: string) => {
    if (address === "anonymous") return "Anonymous";
    return address.slice(0, 10) + "..." + address.slice(-4);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && (
        <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
          <Flame className="w-5 h-5 text-orange-500" />
          Top Super Reacts
        </h3>
      )}
      {displayReacts.map((react) => (
        <div
          key={react.id}
          className={compact 
            ? "bg-black/30 border border-white/10 p-2 rounded-lg"
            : "bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-500/30 p-4 rounded-xl"
          }
        >
          <p className={`text-white leading-relaxed ${compact ? "text-xs line-clamp-2" : "text-sm"}`}>
            {react.commentText}
          </p>
          <div className={`flex items-center justify-between ${compact ? "mt-1.5 text-[10px]" : "mt-3 text-xs"}`}>
            <span className="text-amber-400/80">
              {react.isAnonymous ? "Anonymous" : formatAddress(react.userAddress)}
            </span>
            <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full font-medium">
              {react.amountKas} KAS
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

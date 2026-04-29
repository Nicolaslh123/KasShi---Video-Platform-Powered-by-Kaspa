import { useEffect, useState } from "react";

interface SuperReact {
  id: number;
  comment_text: string;
  amount_kas: number;
  user_address: string;
  is_anonymous: boolean;
}

interface Props {
  trackId: number;
}

export default function TopSuperReacts({ trackId }: Props) {
  const [reacts, setReacts] = useState<SuperReact[]>([]);

  useEffect(() => {
    fetch(`/api/kasshi/super-reacts/${trackId}`)
      .then(res => res.json())
      .then(data => setReacts(data.superReacts || []));
  }, [trackId]);

  if (reacts.length === 0) return null;

  return (
    <div className="mt-6 bg-black/70 backdrop-blur-md rounded-3xl p-4 max-h-64 overflow-y-auto border border-amber-400/30">
      <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-3">
        🔥 TOP SUPER REACTS
      </div>
      {reacts.map((r) => (
        <div key={r.id} className="mb-4 last:mb-0">
          <p className="text-white text-sm leading-tight">{r.comment_text}</p>
          <div className="flex justify-between text-[10px] text-amber-300 mt-1">
            <span>
              {r.is_anonymous ? "Anonymous" : `${r.user_address.slice(0, 6)}...`}
            </span>
            <span className="font-medium">{r.amount_kas} KAS</span>
          </div>
        </div>
      ))}
    </div>
  );
}

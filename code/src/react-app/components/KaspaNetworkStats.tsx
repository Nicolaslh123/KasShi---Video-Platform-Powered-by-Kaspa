import { useState, useEffect, useRef } from 'react';
import { Activity, Cpu, Box, Zap, RefreshCw, TrendingUp } from 'lucide-react';

interface Block {
  id: number;
  x: number; // Current x position (0-100%)
  y: number;
  speed: number; // Varying speed per block
  parentIds: number[]; // Store parent block IDs, not array indices
}

interface NetworkStats {
  hashrate: number;
  blockCount: number;
  difficulty: number;
  daaScore: number;
}

export default function KaspaNetworkStats() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const blocksRef = useRef<Block[]>([]);
  const lastFrameRef = useRef<number>(Date.now());
  
  // Kaspa targets ~10 BPS (blocks per second)
  const TARGET_BPS = 10;
  
  // Fetch network stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [hashrateRes, networkRes] = await Promise.all([
          fetch('https://api.kaspa.org/info/hashrate'),
          fetch('https://api.kaspa.org/info/blockdag'),
        ]);
        
        if (hashrateRes.ok && networkRes.ok) {
          const hashrateData = await hashrateRes.json();
          const networkData = await networkRes.json();
          
          setStats({
            hashrate: hashrateData.hashrate || 0,
            blockCount: networkData.blockCount || 0,
            difficulty: networkData.difficulty || 0,
            daaScore: networkData.virtualDaaScore || 0,
          });
          setError(null);
        } else {
          setError('Failed to fetch network data');
        }
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);
  
  // Animation loop - spawns blocks and updates positions
  useEffect(() => {
    let animationId: number;
    let lastSpawn = Date.now();
    const SPAWN_INTERVAL = 100; // 10 BPS = 100ms between blocks
    
    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastFrameRef.current) / 1000; // seconds
      lastFrameRef.current = now;
      
      // Update block positions (move left)
      let updatedBlocks = blocksRef.current.map(block => ({
        ...block,
        x: block.x - block.speed * deltaTime * 30, // Speed factor
      })).filter(b => b.x > -10); // Remove blocks that are off-screen left
      
      // Spawn new block at 10 BPS
      if (now - lastSpawn >= SPAWN_INTERVAL) {
        lastSpawn = now;
        
        // Determine Y position based on parents (like reference)
        let y: number;
        const parentIds: number[] = [];
        
        if (updatedBlocks.length > 0) {
          // Select 1-3 parents from recent blocks (last 15)
          const recentBlocks = updatedBlocks.slice(-15);
          const numParents = 1 + Math.floor(Math.random() * 3); // 1-3 parents
          const candidates = [...recentBlocks];
          
          for (let i = 0; i < Math.min(numParents, candidates.length); i++) {
            const randIdx = Math.floor(Math.random() * candidates.length);
            const parent = candidates.splice(randIdx, 1)[0];
            parentIds.push(parent.id);
          }
          
          // Y position based on main parent with spread
          const mainParent = recentBlocks.find(b => b.id === parentIds[0]);
          if (mainParent) {
            const spread = (Math.random() - 0.5) * 40; // ±20% spread
            y = Math.max(10, Math.min(90, mainParent.y + spread));
          } else {
            y = 50;
          }
        } else {
          y = 50; // Genesis block in center
        }
        
        const newBlock: Block = {
          id: now + Math.random(),
          x: 100, // Start on right
          y,
          speed: 0.5 + Math.random() * 0.5, // Variable speed like reference
          parentIds,
        };
        
        updatedBlocks = [...updatedBlocks, newBlock];
      }
      
      blocksRef.current = updatedBlocks;
      setBlocks([...updatedBlocks]);
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  const formatHashrate = (hashrate: number): string => {
    if (hashrate >= 1e15) return `${(hashrate / 1e15).toFixed(2)} PH/s`;
    if (hashrate >= 1e12) return `${(hashrate / 1e12).toFixed(2)} TH/s`;
    if (hashrate >= 1e9) return `${(hashrate / 1e9).toFixed(2)} GH/s`;
    if (hashrate >= 1e6) return `${(hashrate / 1e6).toFixed(2)} MH/s`;
    return `${hashrate.toFixed(2)} H/s`;
  };
  
  const formatNumber = (num: number): string => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(0);
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#70C7BA]" />
          <h3 className="text-sm font-semibold text-white/80">Kaspa Network</h3>
        </div>
        {loading && <RefreshCw className="w-4 h-4 text-white/40 animate-spin" />}
        {!loading && !error && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Live</span>
          </div>
        )}
      </div>
      
      {error ? (
        <div className="text-center py-4">
          <p className="text-sm text-white/40">{error}</p>
        </div>
      ) : (
        <>
          {/* BlockDAG Visualization */}
          <div className="relative h-24 mb-4 overflow-hidden rounded-lg bg-slate-900/50 border border-white/5">
            {/* DAG Grid Lines */}
            <div className="absolute inset-0 opacity-20">
              {[...Array(8)].map((_, i) => (
                <div key={`h-${i}`} className="absolute w-full h-px bg-white/20" style={{ top: `${(i + 1) * 12.5}%` }} />
              ))}
              {[...Array(16)].map((_, i) => (
                <div key={`v-${i}`} className="absolute h-full w-px bg-white/20" style={{ left: `${(i + 1) * 6.25}%` }} />
              ))}
            </div>
            
            {/* Connection Lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {blocks.map((block) => {
                // Draw lines to all parents (look up by ID)
                return block.parentIds.map((parentId, i) => {
                  const parent = blocks.find(b => b.id === parentId);
                  if (!parent) return null; // Parent already removed
                  
                  // Fade lines as they move left (like reference)
                  const minX = Math.min(block.x, parent.x);
                  const opacity = minX < 0 ? 0.1 : 0.4;
                  
                  return (
                    <line
                      key={`line-${block.id}-${i}`}
                      x1={`${parent.x}%`}
                      y1={`${parent.y}%`}
                      x2={`${block.x}%`}
                      y2={`${block.y}%`}
                      stroke="rgba(189, 195, 199, 1)"
                      strokeWidth="1"
                      opacity={opacity}
                    />
                  );
                });
              })}
            </svg>
            
            {/* Animated Blocks */}
            <div className="absolute inset-0">
              {blocks.map((block) => {
                // Fade blocks as they move left (like reference)
                const opacity = block.x < 0 ? 0.2 : 1;
                
                return (
                  <div
                    key={block.id}
                    className="absolute rounded-sm"
                    style={{
                      left: `${block.x}%`,
                      top: `${block.y}%`,
                      width: 8,
                      height: 8,
                      backgroundColor: 'rgba(41, 128, 185, 1)',
                      transform: 'translate(-50%, -50%)',
                      opacity,
                    }}
                  />
                );
              })}
            </div>
            
            {/* Labels */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5">
              <Box className="w-3 h-3 text-[#70C7BA]" />
              <span className="text-[10px] text-white/60 font-medium">BlockDAG</span>
            </div>
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs text-white/50">BPS</span>
              </div>
              <p className="text-lg font-bold text-white">{TARGET_BPS}</p>
              <p className="text-[10px] text-white/40">blocks/second</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs text-white/50">TPS</span>
              </div>
              <p className="text-lg font-bold text-white">~{Math.floor(TARGET_BPS * 10)}</p>
              <p className="text-[10px] text-white/40">tx capacity/sec</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs text-white/50">Hashrate</span>
              </div>
              <p className="text-lg font-bold text-white">
                {stats ? formatHashrate(stats.hashrate) : '—'}
              </p>
              <p className="text-[10px] text-white/40">network power</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Box className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs text-white/50">Blocks</span>
              </div>
              <p className="text-lg font-bold text-white">
                {stats ? formatNumber(stats.blockCount) : '—'}
              </p>
              <p className="text-[10px] text-white/40">total blocks</p>
            </div>
          </div>
          
          {/* DAA Score */}
          {stats && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">DAA Score</span>
                <span className="text-xs font-mono text-white/60">{formatNumber(stats.daaScore)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

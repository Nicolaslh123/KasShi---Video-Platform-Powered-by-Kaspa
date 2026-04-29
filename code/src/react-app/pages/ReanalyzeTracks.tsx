import { useState, useEffect } from 'react';
import { analyzeBeatGrid } from '../utils/beatGridAnalyzer';
import { useWallet } from '../contexts/WalletContext';
import { ArrowLeft, Music2, RefreshCw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLocalizedPath } from '../components/LocalizedLink';
import ElectronTitleBar from '../components/ElectronTitleBar';

export default function ReanalyzeTracks() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<string>('');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const { externalWallet } = useWallet();
  const navigate = useNavigate();
  const localizedPath = useLocalizedPath();
  
  const authToken = externalWallet?.authToken;

  useEffect(() => {
    checkAdminStatus();
  }, [authToken]);

  const checkAdminStatus = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const res = await fetch('/api/admin/status', {
        headers,
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(data.isAdmin === true);
      }
    } catch (err) {
      console.error('Failed to check admin status:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllTracks = async () => {
    setMessage('Fetching all tracks...');
    
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const res = await fetch('/api/music/admin/all-tracks', {
        headers,
        credentials: 'include'
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch tracks');
      }
      
      const data = await res.json();
      setMessage(`Found ${data.tracks?.length || 0} tracks.`);
      return data.tracks || [];
    } catch (err) {
      setMessage('Error fetching tracks: ' + err);
      return [];
    }
  };

  const reanalyzeAllTracks = async () => {
    setProcessing(true);
    setResults({ success: 0, failed: 0 });
    setProgress(0);
    
    const trackList = await fetchAllTracks();
    
    if (trackList.length === 0) {
      setMessage('No tracks found to analyze.');
      setProcessing(false);
      return;
    }

    setMessage(`Starting analysis of ${trackList.length} tracks...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < trackList.length; i++) {
      const track = trackList[i];
      setCurrentTrack(track.title);
      setMessage(`Analyzing ${i + 1}/${trackList.length}: ${track.title}`);

      try {
        // Skip tracks without audio URL
        if (!track.audioUrl) {
          console.warn(`Skipping ${track.title}: No audio URL`);
          failCount++;
          continue;
        }

        // Fetch the audio file
        const audioRes = await fetch(track.audioUrl);
        if (!audioRes.ok) {
          throw new Error('Failed to fetch audio');
        }
        
        const audioBlob = await audioRes.blob();
        const file = new File([audioBlob], `track-${track.id}.mp3`, { type: 'audio/mpeg' });

        // Generate beat grid
        const beatData = await analyzeBeatGrid(file);

        console.log(`✅ ${track.title}: ${beatData.beatGrid.length} beats @ ${beatData.bpm} BPM`);

        // Update the track with new beat grid
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const updateRes = await fetch(`/api/music/admin/update-beat-grid/${track.id}`, {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            beatGrid: beatData.beatGrid,
            bpm: beatData.bpm
          }),
        });

        if (!updateRes.ok) {
          throw new Error('Failed to update track');
        }

        successCount++;
        setResults({ success: successCount, failed: failCount });
      } catch (err) {
        console.warn(`Failed on track ${track.title}:`, err);
        failCount++;
        setResults({ success: successCount, failed: failCount });
      }

      setProgress(Math.round(((i + 1) / trackList.length) * 100));
    }

    setCurrentTrack('');
    setMessage(`✅ Re-analysis completed! ${successCount} succeeded, ${failCount} failed.`);
    setProcessing(false);
  };

  const reanalyzeWithoutBeatGrid = async () => {
    setProcessing(true);
    setResults({ success: 0, failed: 0 });
    setProgress(0);
    setMessage('Fetching tracks without beatGrid...');

    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await fetch('/api/music/admin/tracks-missing-beatgrid', {
        headers,
        credentials: 'include'
      });
      const data = await res.json();

      if (!data.success || data.count === 0) {
        setMessage('No tracks missing beatGrid.');
        setProcessing(false);
        return;
      }

      const tracks = data.tracks;
      setMessage(`Found ${tracks.length} tracks to analyze.`);

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        setCurrentTrack(track.title);
        setMessage(`Analyzing ${i + 1}/${tracks.length}: ${track.title}`);

        try {
          const audioRes = await fetch(track.audioUrl);
          if (!audioRes.ok) throw new Error("Failed to download audio");

          const blob = await audioRes.blob();
          const file = new File([blob], track.filename || 'track.mp3', { type: blob.type });

          const beatData = await analyzeBeatGrid(file);

          console.log(`✅ ${track.title}: ${beatData.beatGrid.length} beats @ ${beatData.bpm} BPM`);

          const updateHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (authToken) updateHeaders['Authorization'] = `Bearer ${authToken}`;

          await fetch(`/api/music/admin/update-beat-grid/${track.id}`, {
            method: 'PATCH',
            headers: updateHeaders,
            credentials: 'include',
            body: JSON.stringify({
              beatGrid: beatData.beatGrid,
              bpm: beatData.bpm
            }),
          });

          successCount++;
          setResults({ success: successCount, failed: failCount });
        } catch (err) {
          console.warn(`Failed on ${track.title}`, err);
          failCount++;
          setResults({ success: successCount, failed: failCount });
        }

        setProgress(Math.round(((i + 1) / tracks.length) * 100));
      }

      setCurrentTrack('');
      setMessage(`✅ Completed! ${successCount} succeeded, ${failCount} failed.`);
    } catch (err: any) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <ElectronTitleBar />
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <ElectronTitleBar />
        <div className="p-8 max-w-2xl mx-auto pt-20">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-red-400 mb-2">Access Denied</h2>
            <p className="text-slate-400">You need admin privileges to access this tool.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ElectronTitleBar />
      <div className="p-8 max-w-3xl mx-auto pt-20">
        {/* Header */}
        <button 
          onClick={() => navigate(localizedPath('/music'))}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Music</span>
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
            <Music2 className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Re-analyze All Tracks</h1>
            <p className="text-slate-400">Run beat detection on existing tracks</p>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8">
          <h3 className="font-semibold mb-3 text-white">What this does:</h3>
          <ul className="space-y-2 text-slate-300 text-sm">
            <li>• Downloads each track's audio file</li>
            <li>• Runs beat detection analysis (focuses on 808s and kicks)</li>
            <li>• Updates the track's beat_grid and bpm in the database</li>
            <li>• Enables synced reactive visualizations on the Reactive Ocean theme</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={reanalyzeWithoutBeatGrid}
            disabled={processing}
            className="flex-1 px-6 py-4 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-semibold rounded-xl hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing... {progress}%
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Analyze Missing Only
              </>
            )}
          </button>

          <button
            onClick={reanalyzeAllTracks}
            disabled={processing}
            className="flex-1 px-6 py-4 bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 font-semibold rounded-xl hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing... {progress}%
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Re-analyze All
              </>
            )}
          </button>
        </div>

        {/* Progress */}
        {processing && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-300">Progress</span>
              <span className="text-cyan-400 font-mono">{progress}%</span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {currentTrack && (
              <p className="mt-3 text-sm text-slate-400 truncate">
                Current: {currentTrack}
              </p>
            )}
          </div>
        )}

        {/* Results */}
        {(results.success > 0 || results.failed > 0) && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <div>
                <p className="text-2xl font-bold text-emerald-400">{results.success}</p>
                <p className="text-sm text-slate-400">Succeeded</p>
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
              <XCircle className="w-6 h-6 text-red-400" />
              <div>
                <p className="text-2xl font-bold text-red-400">{results.failed}</p>
                <p className="text-sm text-slate-400">Failed</p>
              </div>
            </div>
          </div>
        )}

        {/* Status Message */}
        {message && (
          <div className={`rounded-xl p-4 ${
            message.includes('✅') 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : message.includes('Error')
              ? 'bg-red-500/10 border border-red-500/20 text-red-400'
              : 'bg-slate-800/50 border border-slate-700 text-slate-300'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

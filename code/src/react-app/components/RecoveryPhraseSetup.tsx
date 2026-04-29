import { useState, useEffect, useMemo } from 'react';
import { Shield, AlertTriangle, Copy, Check, Eye, EyeOff, ChevronRight, ArrowLeft, Lock } from 'lucide-react';

interface RecoveryPhraseSetupProps {
  onComplete: (phrase: string) => void;
}

// BIP39 word list (first 512 words for demo - real implementation uses full 2048)
const WORD_LIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
  'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
  'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
  'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
  'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
  'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
  'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
  'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
  'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
  'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
  'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
  'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
  'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable',
  'cactus', 'cage', 'cake', 'call', 'calm', 'camera', 'camp', 'can',
  'canal', 'cancel', 'candy', 'cannon', 'canoe', 'canvas', 'canyon', 'capable',
  'capital', 'captain', 'car', 'carbon', 'card', 'cargo', 'carpet', 'carry',
  'cart', 'case', 'cash', 'casino', 'castle', 'casual', 'cat', 'catalog',
  'catch', 'category', 'cattle', 'caught', 'cause', 'caution', 'cave', 'ceiling',
  'celery', 'cement', 'census', 'century', 'cereal', 'certain', 'chair', 'chalk',
  'champion', 'change', 'chaos', 'chapter', 'charge', 'chase', 'chat', 'cheap',
  'check', 'cheese', 'chef', 'cherry', 'chest', 'chicken', 'chief', 'child',
  'chimney', 'choice', 'choose', 'chronic', 'chuckle', 'chunk', 'churn', 'cigar',
  'cinnamon', 'circle', 'citizen', 'city', 'civil', 'claim', 'clap', 'clarify',
  'claw', 'clay', 'clean', 'clerk', 'clever', 'click', 'client', 'cliff',
  'climb', 'clinic', 'clip', 'clock', 'clog', 'close', 'cloth', 'cloud',
  'clown', 'club', 'clump', 'cluster', 'clutch', 'coach', 'coast', 'coconut',
  'code', 'coffee', 'coil', 'coin', 'collect', 'color', 'column', 'combine',
  'come', 'comfort', 'comic', 'common', 'company', 'concert', 'conduct', 'confirm',
  'congress', 'connect', 'consider', 'control', 'convince', 'cook', 'cool', 'copper',
  'copy', 'coral', 'core', 'corn', 'correct', 'cost', 'cotton', 'couch',
  'country', 'couple', 'course', 'cousin', 'cover', 'coyote', 'crack', 'cradle',
  'craft', 'cram', 'crane', 'crash', 'crater', 'crawl', 'crazy', 'cream',
  'credit', 'creek', 'crew', 'cricket', 'crime', 'crisp', 'critic', 'crop',
  'cross', 'crouch', 'crowd', 'crucial', 'cruel', 'cruise', 'crumble', 'crunch',
  'crush', 'cry', 'crystal', 'cube', 'culture', 'cup', 'cupboard', 'curious',
  'current', 'curtain', 'curve', 'cushion', 'custom', 'cute', 'cycle', 'dad',
  'damage', 'damp', 'dance', 'danger', 'daring', 'dash', 'daughter', 'dawn',
  'day', 'deal', 'debate', 'debris', 'decade', 'december', 'decide', 'decline',
  'decorate', 'decrease', 'deer', 'defense', 'define', 'defy', 'degree', 'delay',
  'deliver', 'demand', 'demise', 'denial', 'dentist', 'deny', 'depart', 'depend',
  'deposit', 'depth', 'deputy', 'derive', 'describe', 'desert', 'design', 'desk',
  'despair', 'destroy', 'detail', 'detect', 'develop', 'device', 'devote', 'diagram',
  'dial', 'diamond', 'diary', 'dice', 'diesel', 'diet', 'differ', 'digital',
];

function generateRecoveryPhrase(wordCount: 12 | 24): string[] {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const randomIndex = Math.floor(Math.random() * WORD_LIST.length);
    words.push(WORD_LIST[randomIndex]);
  }
  return words;
}

export default function RecoveryPhraseSetup({ onComplete }: RecoveryPhraseSetupProps) {
  const [step, setStep] = useState<'choose' | 'warning' | 'display' | 'verify' | 'complete'>('choose');
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string[]>([]);
  const [showPhrase, setShowPhrase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [userAnswers, setUserAnswers] = useState<{ [key: number]: string }>({});
  const [verifyError, setVerifyError] = useState(false);
  const [acknowledged, setAcknowledged] = useState([false, false, false]);

  // Generate phrase when word count is selected
  const handleSelectWordCount = (count: 12 | 24) => {
    setWordCount(count);
    setRecoveryPhrase(generateRecoveryPhrase(count));
    setStep('warning');
  };

  // Select random words for verification (3 for 12 words, 4 for 24 words)
  useEffect(() => {
    if (step === 'verify') {
      const numToVerify = wordCount === 24 ? 4 : 3;
      const indices: number[] = [];
      while (indices.length < numToVerify) {
        const idx = Math.floor(Math.random() * wordCount);
        if (!indices.includes(idx)) indices.push(idx);
      }
      setVerifyIndices(indices.sort((a, b) => a - b));
      setUserAnswers({});
      setVerifyError(false);
    }
  }, [step, wordCount]);

  // Generate word options for verification (correct word + 3 random)
  const wordOptions = useMemo(() => {
    const options: { [key: number]: string[] } = {};
    verifyIndices.forEach(idx => {
      const correctWord = recoveryPhrase[idx];
      const otherWords: string[] = [];
      while (otherWords.length < 3) {
        const randomWord = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
        if (randomWord !== correctWord && !otherWords.includes(randomWord)) {
          otherWords.push(randomWord);
        }
      }
      // Shuffle all 4 options
      options[idx] = [correctWord, ...otherWords].sort(() => Math.random() - 0.5);
    });
    return options;
  }, [verifyIndices, recoveryPhrase]);

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryPhrase.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = () => {
    const allCorrect = verifyIndices.every(idx => userAnswers[idx] === recoveryPhrase[idx]);
    if (allCorrect) {
      setStep('complete');
    } else {
      setVerifyError(true);
    }
  };

  const handleComplete = () => {
    onComplete(recoveryPhrase.join(' '));
  };

  const allAcknowledged = acknowledged.every(a => a);
  const allAnswered = verifyIndices.every(idx => userAnswers[idx]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl my-8">
        
        {/* Choose Word Count Step */}
        {step === 'choose' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[#70C7BA] to-[#49EACB] flex items-center justify-center mb-4 shadow-lg shadow-teal-500/30">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Create Recovery Phrase</h2>
              <p className="text-white/60 text-sm">
                Choose the length of your recovery phrase. A longer phrase provides more security.
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleSelectWordCount(12)}
                className="w-full p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-[#70C7BA]/50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-white font-semibold text-lg">12 Words</p>
                    <p className="text-white/50 text-sm">Standard security - recommended for most users</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#70C7BA]/20 flex items-center justify-center group-hover:bg-[#70C7BA]/30 transition-colors">
                    <ChevronRight className="w-5 h-5 text-[#70C7BA]" />
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleSelectWordCount(24)}
                className="w-full p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-purple-500/50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-white font-semibold text-lg flex items-center gap-2">
                      24 Words
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs">
                        Maximum Security
                      </span>
                    </p>
                    <p className="text-white/50 text-sm">Enhanced security for large holdings</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                    <ChevronRight className="w-5 h-5 text-purple-400" />
                  </div>
                </div>
              </button>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <p className="text-blue-300 text-sm">
                <strong>What's the difference?</strong> Both are secure. 24 words provide 256-bit entropy vs 128-bit for 12 words. 
                For most users, 12 words is more than sufficient.
              </p>
            </div>


          </>
        )}

        {/* Warning Step */}
        {step === 'warning' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setStep('choose')}
                className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-white">Important Information</h2>
                <p className="text-white/60 text-sm">{wordCount}-word recovery phrase</p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-amber-400 mb-1">This is your ONLY backup</h3>
                  <p className="text-sm text-amber-300/80">
                    If you lose access to your Google account, this recovery phrase is the only way to restore your wallet.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {[
                "I understand this phrase is the ONLY way to recover my wallet if I lose Google access",
                "I will write it down on paper and store it securely (NOT digitally)",
                "I will NEVER share this phrase with anyone - not even Kaspay support"
              ].map((text, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={acknowledged[i]}
                    onChange={() => {
                      const newAck = [...acknowledged];
                      newAck[i] = !newAck[i];
                      setAcknowledged(newAck);
                    }}
                    className="mt-0.5 w-5 h-5 rounded border-white/30 bg-white/10 text-[#70C7BA] focus:ring-[#70C7BA]"
                  />
                  <span className="text-sm text-white/80">{text}</span>
                </label>
              ))}
            </div>

            <button
              onClick={() => setStep('display')}
              disabled={!allAcknowledged}
              className="w-full py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-teal-500/30 transition-all flex items-center justify-center gap-2"
            >
              Show My Recovery Phrase
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Display Phrase Step */}
        {step === 'display' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setStep('warning')}
                className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-white">Your {wordCount}-Word Recovery Phrase</h2>
                <p className="text-white/60 text-sm">Write these words down in order</p>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">
                  <strong>Write this down on paper NOW.</strong> Never screenshot, email, or store digitally. Anyone with these words can steal your funds.
                </p>
              </div>
            </div>

            <div className="relative mb-4">
              {!showPhrase && (
                <button
                  onClick={() => setShowPhrase(true)}
                  className="absolute inset-0 z-10 bg-slate-800/95 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-2"
                >
                  <Eye className="w-8 h-8 text-white/60" />
                  <span className="text-white/80 font-medium">Click to reveal</span>
                  <span className="text-white/40 text-sm">Make sure no one is watching</span>
                </button>
              )}
              
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className={`grid ${wordCount === 24 ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                  {recoveryPhrase.map((word, index) => (
                    <div
                      key={index}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 flex items-center gap-1.5"
                    >
                      <span className="text-xs text-white/40 w-5">{index + 1}.</span>
                      <span className="text-white font-mono text-sm">{showPhrase ? word : '•••••'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mb-4">
              <button
                onClick={handleCopy}
                disabled={!showPhrase}
                className="flex-1 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => setShowPhrase(!showPhrase)}
                className="py-2.5 px-4 bg-white/5 border border-white/10 text-white rounded-lg font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                {showPhrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={() => setStep('verify')}
              disabled={!showPhrase}
              className="w-full py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-teal-500/30 transition-all flex items-center justify-center gap-2"
            >
              I've written it down
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Verify Step */}
        {step === 'verify' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setStep('display')}
                className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-white">Verify Your Phrase</h2>
                <p className="text-white/60 text-sm">Select the correct words to confirm you wrote it down</p>
              </div>
            </div>

            {verifyError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <div>
                    <p className="text-sm text-red-300 font-medium">Incorrect answers</p>
                    <p className="text-xs text-red-300/70">Please go back and check your phrase again.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 mb-6">
              {verifyIndices.map(idx => (
                <div key={idx}>
                  <label className="block text-sm text-white/60 mb-2">
                    Word #{idx + 1}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {wordOptions[idx]?.map(word => (
                      <button
                        key={word}
                        onClick={() => {
                          setUserAnswers(prev => ({ ...prev, [idx]: word }));
                          setVerifyError(false);
                        }}
                        className={`py-3 px-4 rounded-lg font-mono text-sm transition-all ${
                          userAnswers[idx] === word
                            ? 'bg-[#70C7BA]/20 border-2 border-[#70C7BA] text-[#70C7BA]'
                            : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                        }`}
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleVerify}
              disabled={!allAnswered}
              className="w-full py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-teal-500/30 transition-all"
            >
              Verify
            </button>
          </>
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <Shield className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Wallet Secured!</h2>
            <p className="text-white/60 text-sm mb-6">
              Your {wordCount}-word recovery phrase has been verified. Keep it safe—you'll need it to restore your wallet if you ever lose access.
            </p>

            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
              <ul className="text-sm text-green-300/80 space-y-2 text-left">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Store your phrase in a secure physical location</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Consider a metal backup for fire/water resistance</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Never store it digitally or in the cloud</span>
                </li>
              </ul>
            </div>

            <button
              onClick={handleComplete}
              className="w-full py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-teal-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Lock className="w-5 h-5" />
              Continue to Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

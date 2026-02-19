'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { useAccount, useSendCalls } from 'wagmi';
import { keccak256, toHex, parseUnits, encodeFunctionData } from 'viem';
import { useApi } from '@/lib/hooks/useApi';
import {
  BET_SETTLER_CONTRACT_ADDRESS,
  BET_SETTLER_ABI,
  ERC20_ABI,
  TOKENS,
  LIFEBET_FEE,
  LIFEBET_WINNER_SHARE,
  MIN_STAKE,
} from '@/lib/contracts';

type Step = 'statement' | 'outcomes' | 'stake' | 'window' | 'judges' | 'review' | 'signing' | 'saving' | 'done';

function CreateBetContent() {
  const router = useRouter();
  const api = useApi();
  const { address, isConnected, status } = useAccount();

  const [step, setStep] = useState<Step>('statement');
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [statement, setStatement] = useState('');
  const [rules, setRules] = useState('');
  const [outcomes, setOutcomes] = useState(['Yes', 'No']);
  const [stakeAmount, setStakeAmount] = useState('5');
  const [token, setToken] = useState<'USDC' | 'USDT'>('USDC');
  const [bettingDeadlineDays, setBettingDeadlineDays] = useState(3);
  const [resolveAfterDays, setResolveAfterDays] = useState(7);
  const [judgeUsernames, setJudgeUsernames] = useState<string[]>(['', '', '']);
  const [players, setPlayers] = useState<{ username: string; smartAccountAddress: string }[]>([]);

  const { sendCalls, isPending: isTxPending } = useSendCalls();

  useEffect(() => {
    if (status === 'connecting' || status === 'reconnecting') return;
    if (!isConnected) {
      router.push('/');
      return;
    }
    const userId = localStorage.getItem('userId');
    if (userId) {
      api.setAuthToken(userId);
    }
    api.listPlayers().then((res) => {
      if (res.data?.players) {
        setPlayers(res.data.players);
      }
    });
  }, [isConnected, status, router, api]);

  const myUsername = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
  const availableJudges = players.filter(
    (p) => p.username !== myUsername && !judgeUsernames.includes(p.username)
  );

  const addOutcome = () => setOutcomes([...outcomes, '']);
  const removeOutcome = (i: number) => {
    if (outcomes.length <= 2) return;
    setOutcomes(outcomes.filter((_, idx) => idx !== i));
  };
  const updateOutcome = (i: number, val: string) => {
    const copy = [...outcomes];
    copy[i] = val;
    setOutcomes(copy);
  };

  const addJudge = () => setJudgeUsernames([...judgeUsernames, '']);
  const removeJudge = (i: number) => {
    if (judgeUsernames.length <= 3) return;
    setJudgeUsernames(judgeUsernames.filter((_, idx) => idx !== i));
  };
  const updateJudge = (i: number, val: string) => {
    const copy = [...judgeUsernames];
    copy[i] = val;
    setJudgeUsernames(copy);
  };

  const validJudges = judgeUsernames.filter((u) => u && players.some((p) => p.username === u));
  const isOddJudges = validJudges.length >= 3 && validJudges.length % 2 === 1;

  const bettingDeadline = new Date(Date.now() + bettingDeadlineDays * 24 * 60 * 60 * 1000);
  const resolveDate = new Date(Date.now() + resolveAfterDays * 24 * 60 * 60 * 1000);

  const canProceed = () => {
    switch (step) {
      case 'statement': return statement.trim().length >= 5;
      case 'outcomes': return outcomes.filter((o) => o.trim()).length >= 2;
      case 'stake': return Number(stakeAmount) >= MIN_STAKE;
      case 'window': return bettingDeadlineDays >= 1 && resolveAfterDays > bettingDeadlineDays;
      case 'judges': return isOddJudges;
      case 'review': return true;
      default: return false;
    }
  };

  const steps: Step[] = ['statement', 'outcomes', 'stake', 'window', 'judges', 'review'];
  const currentStepIndex = steps.indexOf(step);

  const goNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setStep(steps[currentStepIndex + 1]);
    }
  };

  const goBack = () => {
    if (currentStepIndex > 0) {
      setStep(steps[currentStepIndex - 1]);
    }
  };

  const handleCreate = () => {
    if (!address) return;

    const tokenInfo = TOKENS[token];
    const stakeAmountParsed = parseUnits(stakeAmount, tokenInfo.decimals);
    const betId = keccak256(toHex(`bet-${crypto.randomUUID()}-${Date.now()}`));
    const bettingDeadlineTs = BigInt(Math.floor(bettingDeadline.getTime() / 1000));
    const settleByTs = BigInt(Math.floor(resolveDate.getTime() / 1000) + 30 * 24 * 60 * 60);

    setError(null);
    setStep('signing');

    sendCalls({
      calls: [
        {
          to: tokenInfo.address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [BET_SETTLER_CONTRACT_ADDRESS, stakeAmountParsed],
          }),
        },
        {
          to: BET_SETTLER_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: BET_SETTLER_ABI,
            functionName: 'createBet',
            args: [betId, stakeAmountParsed, tokenInfo.address, bettingDeadlineTs, settleByTs],
          }),
        },
      ],
    }, {
      onSuccess: async (result) => {
        setStep('saving');
        const response = await api.createBet({
          statement: statement.trim(),
          rules: rules.trim() || undefined,
          outcomes: outcomes.filter((o) => o.trim()),
          stakeAmount: stakeAmountParsed.toString(),
          token: tokenInfo.address,
          bettingDeadline: bettingDeadline.toISOString(),
          resolveDate: resolveDate.toISOString(),
          judgeUsernames: validJudges,
          betId,
          txHash: result.id,
        });

        if (response.error) {
          setError(response.error);
          setStep('review');
          return;
        }
        setStep('done');
        router.push(`/bets/${encodeURIComponent(betId)}`);
      },
      onError: (err) => {
        setError(err.message || 'Transaction failed');
        setStep('review');
      },
    });
  };

  const isProcessing = step === 'signing' || step === 'saving' || step === 'done';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => router.push('/bets')}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Bets
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-12">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-2">Create a LifeBet</h1>
          <p className="text-gray-500 text-sm mb-6">Bet on a real life event, judged by a trusted panel.</p>

          {/* Progress bar */}
          {!isProcessing && (
            <div className="flex gap-1 mb-8">
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full ${i <= currentStepIndex ? 'bg-amber-500' : 'bg-gray-200'}`}
                />
              ))}
            </div>
          )}

          {/* Step: Statement */}
          {step === 'statement' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">The proposition</label>
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="e.g. Gabite will not talk to Clara this year"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
              <label className="block text-sm font-medium text-gray-700">Rules / Clarification (optional)</label>
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Any additional rules or clarifications..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
          )}

          {/* Step: Outcomes */}
          {step === 'outcomes' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">Possible outcomes (min 2)</label>
              {outcomes.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={o}
                    onChange={(e) => updateOutcome(i, e.target.value)}
                    placeholder={`Outcome ${i + 1}`}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  {outcomes.length > 2 && (
                    <button
                      onClick={() => removeOutcome(i)}
                      className="text-gray-400 hover:text-gray-600 px-2"
                    >
                      X
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addOutcome}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                + Add outcome
              </button>
            </div>
          )}

          {/* Step: Stake */}
          {step === 'stake' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">Stake per bettor</label>
              <div className="relative">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  min={MIN_STAKE}
                  step="1"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <div className="absolute right-3 top-3 text-gray-500">USD</div>
              </div>
              <p className="text-sm text-gray-500">Minimum: ${MIN_STAKE}</p>
              <label className="block text-sm font-medium text-gray-700 mt-4">Token</label>
              <div className="flex gap-4">
                {(['USDC', 'USDT'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setToken(t)}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition ${
                      token === t
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step: Window */}
          {step === 'window' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">Betting window (days from now)</label>
              <input
                type="number"
                value={bettingDeadlineDays}
                onChange={(e) => setBettingDeadlineDays(parseInt(e.target.value) || 1)}
                min={1}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500">Betting closes: {bettingDeadline.toLocaleDateString()}</p>

              <label className="block text-sm font-medium text-gray-700 mt-4">Resolve date (days from now)</label>
              <input
                type="number"
                value={resolveAfterDays}
                onChange={(e) => setResolveAfterDays(parseInt(e.target.value) || bettingDeadlineDays + 1)}
                min={bettingDeadlineDays + 1}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500">Judges vote after: {resolveDate.toLocaleDateString()}</p>
            </div>
          )}

          {/* Step: Judges */}
          {step === 'judges' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Select judges (odd number, min 3)
              </label>
              {judgeUsernames.map((u, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={u}
                    onChange={(e) => updateJudge(i, e.target.value)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                  >
                    <option value="">Select a judge...</option>
                    {players
                      .filter((p) => p.username !== myUsername && (p.username === u || !judgeUsernames.includes(p.username)))
                      .map((p) => (
                        <option key={p.username} value={p.username}>
                          {p.username}
                        </option>
                      ))}
                  </select>
                  {judgeUsernames.length > 3 && (
                    <button onClick={() => removeJudge(i)} className="text-gray-400 hover:text-gray-600 px-2">X</button>
                  )}
                </div>
              ))}
              {judgeUsernames.length % 2 === 0 && (
                <p className="text-xs text-orange-600">Add one more judge to make an odd number.</p>
              )}
              <button
                onClick={addJudge}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                + Add judge
              </button>
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Statement</p>
                  <p className="font-semibold text-gray-900">{statement}</p>
                  {rules && <p className="text-sm text-gray-600 mt-1">{rules}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Outcomes</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {outcomes.filter((o) => o.trim()).map((o, i) => (
                      <span key={i} className="bg-white border border-gray-200 px-3 py-1 rounded-full text-sm">{o}</span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Stake</p>
                    <p className="font-semibold">{stakeAmount} {token}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Platform fee</p>
                    <p className="font-semibold text-gray-700">{LIFEBET_FEE * 100}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Betting closes</p>
                    <p className="font-semibold">{bettingDeadline.toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Resolve date</p>
                    <p className="font-semibold">{resolveDate.toLocaleDateString()}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Judges</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {validJudges.map((j) => (
                      <span key={j} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">{j}</span>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Processing states */}
          {isProcessing && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4" />
              <p className="text-gray-700 font-medium">
                {step === 'signing' && (isTxPending ? 'Confirm in your wallet...' : 'Sending transaction...')}
                {step === 'saving' && 'Saving bet...'}
                {step === 'done' && 'Bet created! Redirecting...'}
              </p>
            </div>
          )}

          {/* Navigation buttons */}
          {!isProcessing && (
            <div className="flex gap-3 mt-8">
              {currentStepIndex > 0 && (
                <button
                  onClick={goBack}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-semibold hover:bg-gray-200 transition"
                >
                  Back
                </button>
              )}
              {step === 'review' ? (
                <button
                  onClick={handleCreate}
                  disabled={!canProceed()}
                  className="flex-1 bg-amber-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-amber-600 transition disabled:opacity-50"
                >
                  Create Bet & Sign
                </button>
              ) : (
                <button
                  onClick={goNext}
                  disabled={!canProceed()}
                  className="flex-1 bg-amber-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-amber-600 transition disabled:opacity-50"
                >
                  Next
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function CreateBetPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateBetContent />
    </Suspense>
  );
}

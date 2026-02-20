'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useJawAccount } from '@/lib/contexts/AccountContext';
import { publicClient, JAW_PAYMASTER_URL } from '@/lib/account';
import { useApi } from '@/lib/hooks/useApi';
import { useSessionPermission } from '@/lib/hooks/useSessionPermission';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { getTokenSymbol, ENS_DOMAIN, USDC_ADDRESS, TOKENS, ERC20_ABI } from '@/lib/contracts';

/* ── Pac-Man Theme Constants ── */
const C = {
  bg: '#2563EB',
  pacYellow: '#FFD700',
  ghostRed: '#FF4444',
  ghostPink: '#FF8ED4',
  ghostCyan: '#00E5FF',
  ghostOrange: '#FFAA33',
  dotWhite: '#FFFFFF',
  cardBg: 'rgba(0, 0, 0, 0.18)',
  cardBorder: 'rgba(255, 255, 255, 0.2)',
  playYellow: '#FFD700',
  betOrange: '#FF8C42',
  invitePink: '#FF6B9D',
};
const ghostColors = [C.ghostRed, C.ghostPink, C.ghostCyan, C.ghostOrange];

/* ── Responsive CSS ── */
const responsiveCSS = `
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }

.jaw-main { max-width: 100%; margin: 0 auto; }
.jaw-actions { display: flex; flex-direction: column; gap: 12px; }
.jaw-players-grid { display: flex; flex-direction: column; gap: 8px; }

@media (min-width: 640px) {
  .jaw-main { max-width: 1024px; }
  .jaw-actions { flex-direction: row; gap: 16px; }
  .jaw-actions > button { flex: 1; }
  .jaw-players-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
}
`;

/* ── SVG Components ── */
const PacManMouth = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill={C.pacYellow} />
    <path d="M12 12 L24 4 L24 20 Z" fill="#1a3a8a" />
    <circle cx="14" cy="7" r="1.5" fill="#1a3a8a" />
  </svg>
);

const Ghost = ({ size = 24, color = C.ghostRed }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 28 28">
    <ellipse cx="14" cy="16" rx="12" ry="11" fill={color} />
    <ellipse cx="6.5" cy="7" rx="3.2" ry="4.5" fill={color} />
    <ellipse cx="21.5" cy="7" rx="3.2" ry="4.5" fill={color} />
    <ellipse cx="6.5" cy="4.5" rx="1.6" ry="2" fill="white" opacity="0.2" />
    <ellipse cx="21.5" cy="4.5" rx="1.6" ry="2" fill="white" opacity="0.2" />
    <ellipse cx="9" cy="14" rx="3.8" ry="4" fill="white" />
    <ellipse cx="19" cy="14" rx="3.8" ry="4" fill="white" />
    <circle cx="10" cy="14.5" r="2.2" fill="#1a1a2e" />
    <circle cx="20" cy="14.5" r="2.2" fill="#1a1a2e" />
    <circle cx="11" cy="13.5" r="0.8" fill="white" />
    <circle cx="21" cy="13.5" r="0.8" fill="white" />
    <path d="M7 20 L9.5 22.5 L12 20 L14 22.5 L16 20 L18.5 22.5 L21 20" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <ellipse cx="14" cy="18" rx="5" ry="3" fill="white" opacity="0.08" />
  </svg>
);

const Dot = ({ size = 6 }: { size?: number }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: C.dotWhite, opacity: 0.7, flexShrink: 0 }} />
);

const PowerPellet = ({ size = 14 }: { size?: number }) => {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const i = setInterval(() => setVisible(v => !v), 400); return () => clearInterval(i); }, []);
  return <div style={{ width: size, height: size, borderRadius: '50%', background: C.dotWhite, opacity: visible ? 0.9 : 0.2, transition: 'opacity 0.3s' }} />;
};

const PlayIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#1a3a8a" opacity="0.7">
    <polygon points="4,1 18,10 4,19" />
  </svg>
);

const CubeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M12 2 L22 7 L22 17 L12 22 L2 17 L2 7 Z" />
    <path d="M12 2 L12 12 L22 7" />
    <path d="M12 12 L2 7" />
    <path d="M12 12 L12 22" />
  </svg>
);

const MailIcon = () => (
  <svg width="22" height="17" viewBox="0 0 26 20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8">
    <rect x="1" y="1" width="24" height="18" rx="3" />
    <path d="M1 1 L13 11 L25 1" />
  </svg>
);

/* ── Dashboard ── */
function DashboardContent() {
  const router = useRouter();
  const api = useApi();
  const { isConnected, address, isLoading, account, signOut } = useJawAccount();

  const [username, setUsername] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [players, setPlayers] = useState<{ id: string; username: string; ensName: string; smartAccountAddress: string }[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<bigint | undefined>(undefined);
  const [spendLimit, setSpendLimit] = useState('100');

  const { hasSession, isGranting, isRevoking, expiresAt: sessionExpiresAt, error: sessionError, grantSession, revokeSession } = useSessionPermission();

  const getSessionTimeLeft = () => {
    if (!sessionExpiresAt) return '';
    const diff = sessionExpiresAt.getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m`;
  };

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 1500);
  };

  const fetchBalance = async () => {
    if (!address) return;
    try {
      const balance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      setUsdcBalance(balance as bigint);
    } catch {}
  };

  useEffect(() => {
    if (address) fetchBalance();
  }, [address]);

  useEffect(() => {
    if (isLoading) return;
    if (!isConnected || !address) {
      router.push('/');
      return;
    }

    const init = async () => {
      let userRes: Awaited<ReturnType<typeof api.getUserByAddress>> = { error: 'Not started' };
      for (let attempt = 0; attempt < 5; attempt++) {
        userRes = await api.getUserByAddress(address);
        if (userRes.data) break;
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!userRes.data) {
        setUsername(null);
        setMatchesLoading(false);
        return;
      }

      const resolvedUsername = userRes.data.username;
      setUsername(resolvedUsername);
      localStorage.setItem('username', resolvedUsername);
      localStorage.setItem('userId', userRes.data.id);
      api.setAuthToken(userRes.data.id);

      const [invitesRes, matchesRes, playersRes, judgeInvitesRes] = await Promise.all([
        api.getPendingInvites(resolvedUsername),
        api.getUserMatches(resolvedUsername),
        api.listPlayers(),
        api.getPendingJudgeInvites(),
      ]);

      if (invitesRes.data) {
        const gameInvites = (invitesRes.data.invites || []).length;
        const judgeInvites = (judgeInvitesRes.data?.invites || []).length;
        setInviteCount(gameInvites + judgeInvites);
      }
      if (matchesRes.data) {
        setMatches(matchesRes.data.matches || []);
      }
      if (playersRes.data) {
        setPlayers(
          (playersRes.data.players || []).filter(
            (p) => p.smartAccountAddress.toLowerCase() !== address.toLowerCase()
          )
        );
      }
      setMatchesLoading(false);
    };

    init();
  }, [api, router, isConnected, address, isLoading]);

  const handleSendUSDC = async (recipientAddress: string) => {
    if (!account) return;
    setSendError(null);
    const amount = parseFloat(sendAmount);
    if (!amount || amount <= 0) {
      setSendError('Enter a valid amount');
      return;
    }
    const amountInUnits = parseUnits(sendAmount, TOKENS.USDC.decimals);
    setIsSending(true);
    try {
      await account.sendTransaction([{
        to: USDC_ADDRESS,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipientAddress as `0x${string}`, amountInUnits],
        }),
      }], JAW_PAYMASTER_URL, { token: USDC_ADDRESS });
      setSendingTo(null);
      setSendAmount('');
      fetchBalance();
    } catch (err: any) {
      if (err?.code === 4001) return;
      setSendError(err.message || 'Transfer failed');
    } finally {
      setIsSending(false);
    }
  };

  const handleSignOut = () => {
    signOut();
    router.push('/');
  };

  /* ── Loading / Error States ── */
  if (!username && !matchesLoading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Press Start 2P', 'Courier New', monospace", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
        <style>{responsiveCSS}</style>
        <p style={{ fontSize: 12, color: C.pacYellow, marginBottom: 10 }}>Account not found</p>
        <p style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>Your username could not be resolved. Please sign out and try again.</p>
        <button onClick={handleSignOut} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, background: C.pacYellow, color: '#1a3a8a', border: 'none', borderRadius: 10, padding: '12px 20px', cursor: 'pointer', boxShadow: '0 3px 0 #B8960A' }}>
          SIGN OUT &amp; RETRY
        </button>
      </div>
    );
  }

  if (!username) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Press Start 2P', 'Courier New', monospace", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{responsiveCSS}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PacManMouth size={28} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Loading...</span>
        </div>
      </div>
    );
  }

  /* ── Main Dashboard ── */
  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Press Start 2P', 'Courier New', monospace", position: 'relative', overflow: 'hidden' }}>
      <style>{responsiveCSS}</style>

      {/* Floating dots background */}
      {Array.from({ length: 30 }, (_, i) => (
        <div key={i} style={{
          position: 'fixed', left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`,
          width: i % 7 === 0 ? 8 : 3, height: i % 7 === 0 ? 8 : 3,
          borderRadius: '50%', background: C.dotWhite,
          opacity: i % 7 === 0 ? 0.06 : 0.03, pointerEvents: 'none',
        }} />
      ))}

      {/* ===== HEADER ===== */}
      <div className="jaw-main" style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PacManMouth size={32} />
            <div style={{ fontSize: 14, color: C.pacYellow, textShadow: '0 0 12px rgba(255,215,0,0.4)' }}>
              JAW Games
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', fontSize: 7, color: 'rgba(255,255,255,0.6)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
          >SIGN OUT</button>
        </div>

        {/* Balance card */}
        <div style={{ background: 'rgba(0,0,30,0.35)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Courier New', monospace", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: 6 }}>
              {username}.{ENS_DOMAIN}
            </div>
            {address && (
              <button
                onClick={() => copyAddress(address)}
                style={{ background: 'none', border: 'none', fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
              >
                {copiedAddress === address ? 'Copied!' : truncateAddress(address)}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, color: C.pacYellow, textShadow: '0 0 14px rgba(255,215,0,0.35)' }}>
                {usdcBalance !== undefined ? Number(formatUnits(usdcBalance, TOKENS.USDC.decimals)).toFixed(2) : '...'}
              </div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: 9, color: 'rgba(255,215,0,0.6)', marginTop: 3 }}>
                USDC
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== ACTION CARDS — stacked on mobile, 3-col grid on desktop ===== */}
      <div className="jaw-main" style={{ padding: '20px 20px 0' }}>
        <div className="jaw-actions">
          {/* Play */}
          <button
            onClick={() => router.push('/games')}
            style={{ padding: '22px 20px', background: `linear-gradient(135deg, ${C.playYellow}, #FFC107)`, border: 'none', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 5px 0 #B8960A, 0 7px 20px rgba(0,0,0,0.15)', transition: 'all 0.15s', textAlign: 'left' }}
          >
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PlayIcon />
            </div>
            <div>
              <div style={{ fontSize: 14, color: '#1a3a8a', marginBottom: 5, fontFamily: "'Press Start 2P', monospace" }}>Play</div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 700, color: 'rgba(26,58,138,0.8)' }}>
                Challenge someone to Tic-Tac-Toe
              </div>
            </div>
          </button>

          {/* LifeBet */}
          <button
            onClick={() => router.push('/bets')}
            style={{ padding: '22px 20px', background: `linear-gradient(135deg, ${C.betOrange}, #FF6B35)`, border: 'none', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 5px 0 #B85A20, 0 7px 20px rgba(0,0,0,0.15)', transition: 'all 0.15s', textAlign: 'left' }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CubeIcon />
            </div>
            <div>
              <div style={{ fontSize: 14, color: 'white', marginBottom: 5, fontFamily: "'Press Start 2P', monospace" }}>LifeBet</div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                Bet on real life events
              </div>
            </div>
          </button>

          {/* Invites */}
          <button
            onClick={() => router.push('/invites')}
            style={{ padding: '22px 20px', background: `linear-gradient(135deg, ${C.invitePink}, #FF4D6D)`, border: 'none', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 5px 0 #B83A55, 0 7px 20px rgba(0,0,0,0.15)', transition: 'all 0.15s', textAlign: 'left', position: 'relative' }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MailIcon />
            </div>
            <div>
              <div style={{ fontSize: 14, color: 'white', marginBottom: 5, fontFamily: "'Press Start 2P', monospace" }}>Invites</div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                View pending challenges
              </div>
            </div>
            {inviteCount > 0 && (
              <div style={{ position: 'absolute', top: 10, right: 14, background: C.ghostRed, color: 'white', fontSize: 8, fontWeight: 700, borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P', monospace" }}>
                {inviteCount}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* ===== QUICK BET MODE ===== */}
      <div className="jaw-main" style={{ padding: '20px 20px 0' }}>
        <div style={{ background: 'rgba(0,0,30,0.35)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '14px 18px' }}>
          {hasSession && sessionExpiresAt ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PowerPellet size={8} />
                <span style={{ fontSize: 9, color: '#00FF88' }}>
                  Session active &mdash; {getSessionTimeLeft()}
                </span>
              </div>
              <button
                onClick={revokeSession}
                disabled={isRevoking}
                style={{ fontFamily: 'inherit', fontSize: 7, background: 'rgba(255,68,68,0.15)', color: C.ghostRed, border: '1px solid rgba(255,68,68,0.3)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', transition: 'all 0.15s', opacity: isRevoking ? 0.5 : 1 }}
              >
                {isRevoking ? 'REVOKING...' : 'REVOKE'}
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: C.pacYellow, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <PowerPellet size={8} />
                QUICK BET MODE
              </div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4, marginBottom: 12 }}>
                Play without Face ID each time
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,30,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', flex: '0 0 auto' }}>
                  <input
                    value={spendLimit}
                    onChange={(e) => setSpendLimit(e.target.value)}
                    style={{ width: 45, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: C.dotWhite, textAlign: 'center' }}
                  />
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                    USDC/hr
                  </span>
                </div>
                <button
                  onClick={() => grantSession(spendLimit)}
                  disabled={isGranting || !spendLimit || Number(spendLimit) <= 0}
                  style={{ flex: 1, padding: '12px 14px', fontFamily: "'Press Start 2P', monospace", fontSize: 8, background: C.pacYellow, color: '#1a3a8a', border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: '0 3px 0 #B8960A', transition: 'all 0.15s', opacity: (isGranting || !spendLimit || Number(spendLimit) <= 0) ? 0.5 : 1 }}
                >
                  {isGranting ? 'Granting...' : 'Enable Session (1h)'}
                </button>
              </div>
              {sessionError && (
                <div style={{ fontSize: 8, color: C.ghostRed, marginTop: 8 }}>{sessionError}</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== PLAYERS — stacked on mobile, 2-col grid on desktop ===== */}
      <div className="jaw-main" style={{ padding: '24px 20px 0' }}>
        <h2 style={{ fontSize: 13, color: C.dotWhite, margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>{[1,2,3].map(i => <Dot key={i} size={4} />)}</div>
          Players
          <div style={{ display: 'flex', gap: 4 }}>{[1,2,3].map(i => <Dot key={i} size={4} />)}</div>
        </h2>

        {players.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '12px 0' }}>
              No other players yet.
            </div>
          </div>
        ) : (
          <div className="jaw-players-grid">
            {players.map((player, i) => (
              <div key={player.id}>
                <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <Ghost size={22} color={ghostColors[i % 4]} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 9, color: C.dotWhite }}>{player.username}</div>
                      <div style={{ fontFamily: "'Courier New', monospace", fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.ensName}</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyAddress(player.smartAccountAddress); }}
                        style={{ background: 'none', border: 'none', fontFamily: "'Courier New', monospace", fontSize: 7, color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 0, marginTop: 1, transition: 'color 0.15s' }}
                      >
                        {copiedAddress === player.smartAccountAddress ? 'Copied!' : truncateAddress(player.smartAccountAddress)}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => { setSendingTo(sendingTo === player.id ? null : player.id); setSendAmount(''); setSendError(null); }}
                      style={{ fontFamily: 'inherit', fontSize: 6, padding: '7px 10px', background: 'rgba(0,229,255,0.15)', color: C.ghostCyan, border: '1px solid rgba(0,229,255,0.3)', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s' }}
                    >SEND</button>
                    <button
                      onClick={() => router.push(`/create-match?opponent=${player.username}`)}
                      style={{ fontFamily: 'inherit', fontSize: 6, padding: '7px 8px', background: 'rgba(255,215,0,0.15)', color: C.pacYellow, border: '1px solid rgba(255,215,0,0.3)', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s' }}
                    >CHALLENGE</button>
                  </div>
                </div>

                {sendingTo === player.id && (
                  <div style={{ background: 'rgba(0,0,30,0.3)', border: '1px solid rgba(0,229,255,0.2)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="number"
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                        placeholder="Amount"
                        step="0.01"
                        min="0"
                        style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,30,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px', fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: C.dotWhite, outline: 'none' }}
                      />
                      <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>USDC</span>
                      <button
                        onClick={() => handleSendUSDC(player.smartAccountAddress)}
                        disabled={isSending || !sendAmount}
                        style={{ fontFamily: 'inherit', fontSize: 7, padding: '8px 12px', background: 'rgba(0,229,255,0.2)', color: C.ghostCyan, border: '1px solid rgba(0,229,255,0.4)', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', opacity: (isSending || !sendAmount) ? 0.5 : 1 }}
                      >
                        {isSending ? '...' : 'CONFIRM'}
                      </button>
                    </div>
                    {sendError && (
                      <div style={{ fontSize: 7, color: C.ghostRed, marginTop: 6 }}>{sendError}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== RECENT MATCHES ===== */}
      <div className="jaw-main" style={{ padding: '24px 20px 40px' }}>
        <h2 style={{ fontSize: 13, color: C.dotWhite, margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <PowerPellet size={8} /> Recent Matches
        </h2>

        {matchesLoading ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Loading...</span>
          </div>
        ) : matches.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '12px 0' }}>
              No matches yet. Challenge an opponent!
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matches.slice(0, 10).map((match) => {
              const stakeDisplay = Number(formatUnits(BigInt(match.stake_amount), 6));
              const tokenSymbol = getTokenSymbol(match.token_address);
              const opponent = match.player_a_username === username ? match.player_b_username : match.player_a_username;
              const statusLabel: Record<string, string> = {
                pending_creation: 'Pending',
                created: 'Awaiting opponent',
                accepted: 'Deposit required',
                ready: 'Ready to play',
                in_progress: 'In progress',
                settling: 'Settling',
                settled: 'Completed',
              };
              const isWin = match.status === 'settled' && match.winner_username === username;
              const isLoss = match.status === 'settled' && match.winner_username && match.winner_username !== username;

              return (
                <button
                  key={match.id}
                  onClick={() => router.push(`/matches/${encodeURIComponent(match.match_id)}`)}
                  style={{ width: '100%', background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <PacManMouth size={20} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: C.dotWhite }}>vs {opponent || 'Unknown'}</div>
                      <div style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                        {statusLabel[match.status] || match.status}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: C.pacYellow }}>{stakeDisplay} {tokenSymbol}</div>
                    {isWin && <div style={{ fontSize: 8, color: '#00FF88', marginTop: 3 }}>WON</div>}
                    {isLoss && <div style={{ fontSize: 8, color: C.ghostRed, marginTop: 3 }}>LOST</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div style={{ background: '#2563EB', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Loading...</span>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

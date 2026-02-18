'use client';

import { useRouter } from 'next/navigation';

export default function GamesPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Games</h1>
          <p className="text-gray-600">Challenge an opponent and stake USDC or USDT</p>
        </div>

        <button
          onClick={() => router.push('/create-match?game=tictactoe')}
          className="w-full bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-8 hover:shadow-xl transition transform hover:scale-105 text-left relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 text-white/10 text-9xl font-bold -mr-4 -mt-4">
            #
          </div>
          <div className="relative z-10">
            <div className="text-5xl mb-4">#</div>
            <h2 className="text-2xl font-bold mb-2">Tic-Tac-Toe</h2>
            <p className="text-white/90 mb-4">Simple and fast — best of one round</p>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/20">
              <span className="text-sm">Min. Stake</span>
              <span className="font-bold">$1 USDC</span>
            </div>
          </div>
        </button>

        <div className="mt-8 text-center text-gray-500 text-sm">
          More games coming soon.
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">How It Works</h3>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start"><span className="mr-2">1.</span><span>Choose a stake amount (USDC or USDT)</span></li>
            <li className="flex items-start"><span className="mr-2">2.</span><span>Challenge an opponent by entering their username</span></li>
            <li className="flex items-start"><span className="mr-2">3.</span><span>Both players deposit their stakes into escrow</span></li>
            <li className="flex items-start"><span className="mr-2">4.</span><span>Play the game and winner takes 80% of the pot</span></li>
          </ul>
        </div>
      </main>
    </div>
  );
}

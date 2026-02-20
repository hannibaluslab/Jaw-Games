export interface BackgammonGameState {
  board: number[];           // 24 points, positive = player1, negative = player2
  bar: { player1: number; player2: number };
  borneOff: { player1: number; player2: number };
  player1: string;           // userId
  player2: string;           // userId
  currentTurn: 'player1' | 'player2' | null;
  dice: number[];
  remainingDice: number[];
  winner: 'player1' | 'player2' | null;
  moves: any[];
  turnNumber: number;
  phase: 'rolling' | 'moving';
  initialRollDone: boolean;
}

export interface BackgammonSubmove {
  from: number | 'bar';
  to: number | 'off';
  dieUsed: number;
}

export interface BackgammonValidMove {
  from: number | 'bar';
  to: number | 'off';
  dieUsed: number;
}

const SlimeSoccer = require('./slimesoccer');

const TICK_RATE = 30; // 30 Hz
const TICK_MS = Math.floor(1000 / TICK_RATE);

/**
 * Real-time session manager for a single Slime Soccer match.
 * Runs a server-authoritative physics loop at 30Hz.
 */
class SlimeSoccerSession {
  constructor(matchId, gameState, broadcastFn, onGameEnd) {
    this.matchId = matchId;
    this.state = gameState;
    this.broadcastFn = broadcastFn;
    this.onGameEnd = onGameEnd;
    this.interval = null;

    // Player inputs (updated by setPlayerInput)
    this.leftInputs = { left: false, right: false, jump: false, grab: false };
    this.rightInputs = { left: false, right: false, jump: false, grab: false };

    this.tickCount = 0;
  }

  start() {
    console.log(`[SlimeSoccer] Starting session for match ${this.matchId}`);

    // Broadcast whistle / game start
    this.broadcastFn({
      type: 'game_tick',
      state: this.getClientState(),
      events: [{ type: 'whistle' }],
    });

    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log(`[SlimeSoccer] Session stopped for match ${this.matchId}`);
  }

  setPlayerInput(userId, keys) {
    // Use loose equality to handle string/number mismatch (WS sends strings, DB may return numbers)
    if (userId == this.state.player1) {
      this.leftInputs = keys;
    } else if (userId == this.state.player2) {
      this.rightInputs = keys;
    }
  }

  tick() {
    if (this.state.phase === 'ended') {
      this.stop();
      return;
    }

    // Run physics
    const events = SlimeSoccer.updatePhysics(this.state, this.leftInputs, this.rightInputs);

    // Decrement timer
    this.state.timeLeft -= 1 / TICK_RATE;

    // Check time up
    if (this.state.timeLeft <= 0) {
      this.state.timeLeft = 0;
      this.state.phase = 'ended';

      // Determine winner
      if (this.state.score.left > this.state.score.right) {
        this.state.winner = 'player1';
      } else if (this.state.score.right > this.state.score.left) {
        this.state.winner = 'player2';
      } else {
        this.state.winner = 'draw';
      }

      events.push({ type: 'whistle' });

      // Broadcast final state
      this.broadcastFn({
        type: 'game_tick',
        state: this.getClientState(),
        events,
      });

      this.stop();
      this.onGameEnd(this.state);
      return;
    }

    // Broadcast state every tick
    this.tickCount++;
    this.broadcastFn({
      type: 'game_tick',
      state: this.getClientState(),
      events: events.length > 0 ? events : undefined,
    });
  }

  /**
   * Extract only the data clients need for rendering.
   */
  getClientState() {
    return {
      leftSlime: {
        x: Math.round(this.state.leftSlime.x * 10) / 10,
        y: Math.round(this.state.leftSlime.y * 10) / 10,
        vx: Math.round(this.state.leftSlime.vx * 10) / 10,
        vy: Math.round(this.state.leftSlime.vy * 10) / 10,
        isGrabbing: this.state.leftSlime.isGrabbing,
        hasBall: this.state.leftSlime.hasBall,
        goalLineTime: this.state.leftSlime.goalLineTime,
      },
      rightSlime: {
        x: Math.round(this.state.rightSlime.x * 10) / 10,
        y: Math.round(this.state.rightSlime.y * 10) / 10,
        vx: Math.round(this.state.rightSlime.vx * 10) / 10,
        vy: Math.round(this.state.rightSlime.vy * 10) / 10,
        isGrabbing: this.state.rightSlime.isGrabbing,
        hasBall: this.state.rightSlime.hasBall,
        goalLineTime: this.state.rightSlime.goalLineTime,
      },
      ball: {
        x: Math.round(this.state.ball.x * 10) / 10,
        y: Math.round(this.state.ball.y * 10) / 10,
        vx: Math.round(this.state.ball.vx * 10) / 10,
        vy: Math.round(this.state.ball.vy * 10) / 10,
        grabbedBy: this.state.ball.grabbedBy,
      },
      score: { ...this.state.score },
      timeLeft: Math.max(0, Math.round(this.state.timeLeft * 10) / 10),
      phase: this.state.phase,
      winner: this.state.winner,
    };
  }
}

module.exports = SlimeSoccerSession;

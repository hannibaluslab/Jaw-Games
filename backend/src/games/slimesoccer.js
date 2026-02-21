// Slime Soccer - Server-authoritative physics engine
// Ported from reference: Claude Soccer Slime by Quin Pendragon

const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const GROUND_HEIGHT = 80;
const SLIME_RADIUS = 40;
const BALL_RADIUS = 10;
const GOAL_WIDTH = 80;
const GOAL_HEIGHT = 120;
const GRAVITY = 0.6;
const SLIME_SPEED = 5;
const SLIME_JUMP_POWER = -12;
const BALL_DAMPING = 0.99;
const BALL_BOUNCE_DAMPING = 0.8;
const MAX_BALL_SPEED = 13;
const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT;

class SlimeSoccer {
  /**
   * Create initial game state.
   * player1 = left slime (cyan), player2 = right slime (red)
   */
  static createGame(player1Id, player2Id) {
    return {
      player1: player1Id,
      player2: player2Id,
      leftSlime: {
        x: 200,
        y: GROUND_Y,
        vx: 0,
        vy: 0,
        isGrabbing: false,
        hasBall: false,
        goalLineTime: 0,
      },
      rightSlime: {
        x: 600,
        y: GROUND_Y,
        vx: 0,
        vy: 0,
        isGrabbing: false,
        hasBall: false,
        goalLineTime: 0,
      },
      ball: {
        x: GAME_WIDTH / 2,
        y: 150,
        vx: 0,
        vy: 0,
        grabbedBy: null,
        grabAngle: 0,
        grabAngularVelocity: 0,
      },
      score: { left: 0, right: 0 },
      timeLeft: 180, // 3 minutes
      winner: null,
      phase: 'playing', // 'playing' | 'goal_pause' | 'ended'
      goalPauseTimer: 0,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      moves: [],
    };
  }

  /**
   * makeMove is not used for slime soccer (real-time game).
   * Kept for interface compatibility.
   */
  static makeMove(gameState, playerId, moveData) {
    throw new Error('SlimeSoccer uses real-time control_input, not turn-based moves');
  }

  /**
   * Get result from final game state.
   */
  static getResult(state) {
    if (state.score.left > state.score.right) {
      return { winner: state.player1, isDraw: false, reason: `${state.score.left}-${state.score.right}` };
    } else if (state.score.right > state.score.left) {
      return { winner: state.player2, isDraw: false, reason: `${state.score.left}-${state.score.right}` };
    } else {
      return { winner: null, isDraw: true, reason: `Draw ${state.score.left}-${state.score.right}` };
    }
  }

  /**
   * Reset positions after a goal.
   */
  static resetPositions(state) {
    state.leftSlime.x = 200;
    state.leftSlime.y = GROUND_Y;
    state.leftSlime.vx = 0;
    state.leftSlime.vy = 0;
    state.leftSlime.isGrabbing = false;
    state.leftSlime.hasBall = false;
    state.leftSlime.goalLineTime = 0;

    state.rightSlime.x = 600;
    state.rightSlime.y = GROUND_Y;
    state.rightSlime.vx = 0;
    state.rightSlime.vy = 0;
    state.rightSlime.isGrabbing = false;
    state.rightSlime.hasBall = false;
    state.rightSlime.goalLineTime = 0;

    state.ball.x = GAME_WIDTH / 2;
    state.ball.y = 150;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.grabbedBy = null;
    state.ball.grabAngle = 0;
    state.ball.grabAngularVelocity = 0;
  }

  /**
   * Apply player inputs to slime. Called each tick before physics.
   * keys = { left: bool, right: bool, jump: bool, grab: bool }
   */
  static applyInput(slime, keys) {
    if (keys.left) slime.vx = -SLIME_SPEED;
    else if (keys.right) slime.vx = SLIME_SPEED;
    else slime.vx = 0;

    if (keys.jump && slime.y >= GROUND_Y - 1 && !slime.isGrabbing) {
      slime.vy = SLIME_JUMP_POWER;
    }

    slime.isGrabbing = !!keys.grab;
  }

  /**
   * Run one physics tick. Mutates state in-place.
   * Returns events array: [{ type: 'goal', scorer: 'left'|'right' }, { type: 'kick' }, ...]
   */
  static updatePhysics(state, leftInputs, rightInputs) {
    const events = [];

    if (state.phase === 'goal_pause') {
      state.goalPauseTimer--;
      if (state.goalPauseTimer <= 0) {
        state.phase = 'playing';
      }
      return events;
    }

    if (state.phase === 'ended') return events;

    // Apply inputs
    SlimeSoccer.applyInput(state.leftSlime, leftInputs);
    SlimeSoccer.applyInput(state.rightSlime, rightInputs);

    // Update slime physics
    const slimes = [state.leftSlime, state.rightSlime];
    slimes.forEach((slime, index) => {
      slime.vy += GRAVITY;
      slime.x += slime.vx;
      slime.y += slime.vy;

      // Boundary collision
      if (slime.x < SLIME_RADIUS) slime.x = SLIME_RADIUS;
      if (slime.x > GAME_WIDTH - SLIME_RADIUS) slime.x = GAME_WIDTH - SLIME_RADIUS;

      // Ground collision
      if (slime.y > GROUND_Y) {
        slime.y = GROUND_Y;
        slime.vy = 0;
      }

      // Goal camping penalty
      const isLeftSlime = index === 0;
      const inOwnGoalArea = (isLeftSlime && slime.x < GOAL_WIDTH) ||
                            (!isLeftSlime && slime.x > GAME_WIDTH - GOAL_WIDTH);

      if (inOwnGoalArea) {
        slime.goalLineTime += 1 / 30; // 30 ticks/sec
        if (slime.goalLineTime >= 1) {
          // Penalty goal
          if (isLeftSlime) {
            state.score.right++;
            events.push({ type: 'goal', scorer: 'right' });
          } else {
            state.score.left++;
            events.push({ type: 'goal', scorer: 'left' });
          }
          SlimeSoccer.resetPositions(state);
          state.phase = 'goal_pause';
          state.goalPauseTimer = 30; // 1 second pause
          return events;
        }
      } else {
        slime.goalLineTime = 0;
      }
    });

    // Ball physics
    if (state.ball.grabbedBy) {
      const grabber = state.ball.grabbedBy === 'left' ? state.leftSlime : state.rightSlime;
      const slimeDirection = state.ball.grabbedBy === 'left' ? 1 : -1;

      // Rotational physics
      state.ball.grabAngularVelocity += -grabber.vx * 0.008 * slimeDirection;
      state.ball.grabAngularVelocity *= 0.85;
      state.ball.grabAngle += state.ball.grabAngularVelocity;

      // Constrain angle
      if (state.ball.grabbedBy === 'left') {
        if (state.ball.grabAngle < -Math.PI / 2) {
          state.ball.grabAngle = -Math.PI / 2;
          state.ball.grabAngularVelocity = 0;
        } else if (state.ball.grabAngle > Math.PI / 2) {
          state.ball.grabAngle = Math.PI / 2;
          state.ball.grabAngularVelocity = 0;
        }
      } else {
        while (state.ball.grabAngle < 0) state.ball.grabAngle += Math.PI * 2;
        while (state.ball.grabAngle > Math.PI * 2) state.ball.grabAngle -= Math.PI * 2;
        if (state.ball.grabAngle < Math.PI / 2 && state.ball.grabAngle >= 0) {
          state.ball.grabAngle = Math.PI / 2;
          state.ball.grabAngularVelocity = 0;
        } else if (state.ball.grabAngle > 3 * Math.PI / 2) {
          state.ball.grabAngle = 3 * Math.PI / 2;
          state.ball.grabAngularVelocity = 0;
        }
      }

      // Ball position on grabbed slime
      const holdDistance = SLIME_RADIUS + BALL_RADIUS - 5;
      state.ball.x = grabber.x + Math.cos(state.ball.grabAngle) * holdDistance;
      state.ball.y = grabber.y + Math.sin(state.ball.grabAngle) * holdDistance;
      state.ball.vx = grabber.vx;
      state.ball.vy = grabber.vy;

      // Release check
      if (!grabber.isGrabbing) {
        const releaseAngle = state.ball.grabAngle;
        const releaseSpeed = Math.abs(state.ball.grabAngularVelocity) * 20;
        state.ball.vx = grabber.vx * 1.5 + Math.cos(releaseAngle) * (3 + releaseSpeed);
        state.ball.vy = grabber.vy - 2 + Math.sin(releaseAngle) * releaseSpeed * 0.3;
        state.ball.grabbedBy = null;
        state.ball.grabAngle = 0;
        state.ball.grabAngularVelocity = 0;
        grabber.hasBall = false;
        events.push({ type: 'kick' });
      }
    } else {
      // Free ball physics
      state.ball.vy += GRAVITY;
      state.ball.vx *= BALL_DAMPING;
      state.ball.x += state.ball.vx;
      state.ball.y += state.ball.vy;
    }

    // Ball boundary collisions
    if (state.ball.x < BALL_RADIUS) {
      state.ball.x = BALL_RADIUS;
      state.ball.vx = -state.ball.vx * BALL_BOUNCE_DAMPING;
    }
    if (state.ball.x > GAME_WIDTH - BALL_RADIUS) {
      state.ball.x = GAME_WIDTH - BALL_RADIUS;
      state.ball.vx = -state.ball.vx * BALL_BOUNCE_DAMPING;
    }

    // Ground collision
    if (state.ball.y > GROUND_Y - BALL_RADIUS) {
      state.ball.y = GROUND_Y - BALL_RADIUS;
      state.ball.vy = -state.ball.vy * BALL_BOUNCE_DAMPING;
    }

    // Ceiling collision
    if (state.ball.y < BALL_RADIUS) {
      state.ball.y = BALL_RADIUS;
      state.ball.vy = -state.ball.vy * BALL_BOUNCE_DAMPING;
    }

    // Goal detection
    if (state.ball.x <= BALL_RADIUS && state.ball.y > GROUND_Y - GOAL_HEIGHT) {
      state.score.right++;
      events.push({ type: 'goal', scorer: 'right' });
      SlimeSoccer.resetPositions(state);
      state.phase = 'goal_pause';
      state.goalPauseTimer = 30;
      return events;
    } else if (state.ball.x >= GAME_WIDTH - BALL_RADIUS && state.ball.y > GROUND_Y - GOAL_HEIGHT) {
      state.score.left++;
      events.push({ type: 'goal', scorer: 'left' });
      SlimeSoccer.resetPositions(state);
      state.phase = 'goal_pause';
      state.goalPauseTimer = 30;
      return events;
    }

    // Ball-slime collisions
    [state.leftSlime, state.rightSlime].forEach((slime, index) => {
      const slimeName = index === 0 ? 'left' : 'right';
      const otherSlime = index === 0 ? state.rightSlime : state.leftSlime;
      const dx = state.ball.x - slime.x;
      const dy = state.ball.y - slime.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < SLIME_RADIUS + BALL_RADIUS) {
        // Knock ball from opponent's grab
        if (state.ball.grabbedBy && state.ball.grabbedBy !== slimeName) {
          const speed = Math.sqrt(slime.vx * slime.vx + slime.vy * slime.vy);
          if (speed > 2 || Math.abs(slime.vy) > 5) {
            const angle = Math.atan2(dy, dx);
            state.ball.grabbedBy = null;
            state.ball.grabAngle = 0;
            state.ball.grabAngularVelocity = 0;
            otherSlime.hasBall = false;
            state.ball.vx = Math.cos(angle) * 8 + slime.vx;
            state.ball.vy = Math.sin(angle) * 8 + slime.vy;
            events.push({ type: 'kick' });
          }
        }
        // Grab attempt
        else if (slime.isGrabbing && !state.ball.grabbedBy) {
          state.ball.grabbedBy = slimeName;
          state.ball.grabAngle = Math.atan2(dy, dx);
          state.ball.grabAngularVelocity = 0;
          slime.hasBall = true;
        }
        // Normal collision (semicircle)
        else if (!state.ball.grabbedBy) {
          const angle = Math.atan2(dy, dx);
          if (state.ball.y < slime.y || Math.abs(angle) < Math.PI * 0.5) {
            const targetX = slime.x + Math.cos(angle) * (SLIME_RADIUS + BALL_RADIUS);
            const targetY = slime.y + Math.sin(angle) * (SLIME_RADIUS + BALL_RADIUS);
            state.ball.x = targetX;
            state.ball.y = targetY;

            const speed = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
            state.ball.vx = Math.cos(angle) * speed * 1.5 + slime.vx * 0.5;
            state.ball.vy = Math.sin(angle) * speed * 1.5 + slime.vy * 0.5;

            // Cap speed
            const newSpeed = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
            if (newSpeed > MAX_BALL_SPEED) {
              const scale = MAX_BALL_SPEED / newSpeed;
              state.ball.vx *= scale;
              state.ball.vy *= scale;
            }
            events.push({ type: 'kick' });
          }
        }
      }
    });

    return events;
  }
}

// Export constants for client rendering
SlimeSoccer.CONSTANTS = {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_HEIGHT,
  SLIME_RADIUS,
  BALL_RADIUS,
  GOAL_WIDTH,
  GOAL_HEIGHT,
};

module.exports = SlimeSoccer;

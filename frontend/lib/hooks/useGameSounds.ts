'use client';

import { useRef, useEffect, useCallback } from 'react';

type SoundName = 'dice' | 'double' | 'move' | 'hit' | 'win' | 'loss' | 'kick' | 'goal' | 'whistle';

/**
 * Generates game sounds using the Web Audio API (no external files needed).
 * Handles iOS autoplay restrictions by unlocking audio on first user gesture.
 */
export function useGameSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);
  const musicNodesRef = useRef<{ oscillators: OscillatorNode[]; gains: GainNode[]; interval: ReturnType<typeof setInterval> | null } | null>(null);

  // Get or create AudioContext
  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  // Unlock audio on first user gesture (required by iOS Safari)
  useEffect(() => {
    const unlock = () => {
      if (unlockedRef.current) return;
      const ctx = getCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      // Play a silent buffer to fully unlock
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      unlockedRef.current = true;
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('click', unlock, { once: true });
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, [getCtx]);

  const playSound = useCallback((name: SoundName) => {
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;

      switch (name) {
        case 'dice': {
          // Shaking dice rattle — burst of filtered noise
          const duration = 0.6;
          const bufferSize = ctx.sampleRate * duration;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          // Create rattling pattern: several short bursts
          for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate;
            const envelope = Math.exp(-t * 5) * (1 + 0.5 * Math.sin(t * 80));
            data[i] = (Math.random() * 2 - 1) * envelope * 0.4;
          }
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 3000;
          filter.Q.value = 1.5;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.5, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
          src.connect(filter).connect(gain).connect(ctx.destination);
          src.start(now);
          src.stop(now + duration);
          break;
        }

        case 'double': {
          // Special fanfare ding — two ascending tones
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(880, now);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1320, now);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
          osc1.connect(gain).connect(ctx.destination);
          osc2.connect(gain);
          osc1.start(now);
          osc2.start(now + 0.15);
          osc1.stop(now + 0.8);
          osc2.stop(now + 0.8);
          break;
        }

        case 'move': {
          // Wooden clack — short noise burst with resonance
          const duration = 0.12;
          const bufferSize = ctx.sampleRate * duration;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate;
            data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 50) * 0.6;
          }
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 1800;
          filter.Q.value = 3;
          const gain = ctx.createGain();
          gain.gain.value = 0.5;
          src.connect(filter).connect(gain).connect(ctx.destination);
          src.start(now);
          src.stop(now + duration);
          break;
        }

        case 'hit': {
          // Hard knock/slam — louder, lower-pitched thud
          const duration = 0.25;
          const bufferSize = ctx.sampleRate * duration;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate;
            const thud = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t * 20);
            const crack = (Math.random() * 2 - 1) * Math.exp(-t * 40);
            data[i] = (thud * 0.6 + crack * 0.4) * 0.7;
          }
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.7, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
          src.connect(gain).connect(ctx.destination);
          src.start(now);
          src.stop(now + duration);
          break;
        }

        case 'win': {
          // Victory chime — ascending major triad
          const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + i * 0.15;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.25, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, start + 0.8);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.8);
          });
          break;
        }

        case 'loss': {
          // Sad descending tone
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(220, now + 0.8);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 1.0);
          break;
        }

        case 'kick': {
          // Short percussive impact — ball hit by slime
          const duration = 0.08;
          const bufferSize = ctx.sampleRate * duration;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate;
            const thump = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 60);
            const snap = (Math.random() * 2 - 1) * Math.exp(-t * 80);
            data[i] = (thump * 0.5 + snap * 0.5) * 0.6;
          }
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = 0.5;
          src.connect(gain).connect(ctx.destination);
          src.start(now);
          src.stop(now + duration);
          break;
        }

        case 'goal': {
          // Rising fanfare horn — goal scored
          const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            const start = now + i * 0.1;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.15, start + 0.03);
            gain.gain.setValueAtTime(0.15, start + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.01, start + 0.6);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.6);
          });
          // Crowd noise burst
          const noiseDur = 0.8;
          const nBuf = ctx.createBuffer(1, ctx.sampleRate * noiseDur, ctx.sampleRate);
          const nData = nBuf.getChannelData(0);
          for (let i = 0; i < nData.length; i++) {
            const t = i / ctx.sampleRate;
            nData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.15;
          }
          const nSrc = ctx.createBufferSource();
          nSrc.buffer = nBuf;
          const nFilter = ctx.createBiquadFilter();
          nFilter.type = 'bandpass';
          nFilter.frequency.value = 2000;
          nFilter.Q.value = 0.5;
          nSrc.connect(nFilter).connect(ctx.destination);
          nSrc.start(now);
          nSrc.stop(now + noiseDur);
          break;
        }

        case 'whistle': {
          // Referee whistle — two-tone oscillator
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(2800, now);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(3200, now);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.setValueAtTime(0.2, now + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          osc1.connect(gain).connect(ctx.destination);
          osc2.connect(gain);
          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.5);
          osc2.stop(now + 0.5);
          break;
        }
      }
    } catch {
      // Silently fail — sound is non-critical
    }
  }, [getCtx]);

  // Retro electronic music loop for slime soccer
  const startMusic = useCallback(() => {
    try {
      if (musicNodesRef.current) return; // already playing
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const oscillators: OscillatorNode[] = [];
      const gains: GainNode[] = [];

      // Bass line — looping low synth
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'square';
      bassOsc.frequency.value = 55; // A1
      bassGain.gain.value = 0.08;
      bassOsc.connect(bassGain).connect(ctx.destination);
      bassOsc.start();
      oscillators.push(bassOsc);
      gains.push(bassGain);

      // Hi-hat — filtered noise via oscillator trick
      const hihatOsc = ctx.createOscillator();
      const hihatGain = ctx.createGain();
      hihatOsc.type = 'square';
      hihatOsc.frequency.value = 8000;
      hihatGain.gain.value = 0;
      hihatOsc.connect(hihatGain).connect(ctx.destination);
      hihatOsc.start();
      oscillators.push(hihatOsc);
      gains.push(hihatGain);

      // Arpeggio synth
      const arpOsc = ctx.createOscillator();
      const arpGain = ctx.createGain();
      arpOsc.type = 'sawtooth';
      arpOsc.frequency.value = 220;
      arpGain.gain.value = 0.04;
      const arpFilter = ctx.createBiquadFilter();
      arpFilter.type = 'lowpass';
      arpFilter.frequency.value = 1200;
      arpOsc.connect(arpFilter).connect(arpGain).connect(ctx.destination);
      arpOsc.start();
      oscillators.push(arpOsc);
      gains.push(arpGain);

      // Sequencer — change notes on a beat
      const BPM = 140;
      const beatMs = (60 / BPM) * 1000;
      const bassNotes = [55, 55, 73.42, 73.42, 65.41, 65.41, 82.41, 82.41]; // A1, D2, C2, E2
      const arpNotes = [220, 330, 440, 330, 261.63, 392, 523.25, 392]; // A3, E4, A4, E4, C4, G4, C5, G4
      let step = 0;

      const interval = setInterval(() => {
        const s = step % 8;
        // Bass
        bassOsc.frequency.setValueAtTime(bassNotes[s], ctx.currentTime);
        // Arp
        arpOsc.frequency.setValueAtTime(arpNotes[s], ctx.currentTime);
        // Hi-hat on every beat
        hihatGain.gain.setValueAtTime(0.03, ctx.currentTime);
        hihatGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        step++;
      }, beatMs / 2); // 8th notes

      musicNodesRef.current = { oscillators, gains, interval };
    } catch {
      // Silently fail
    }
  }, [getCtx]);

  const stopMusic = useCallback(() => {
    if (!musicNodesRef.current) return;
    const { oscillators, gains, interval } = musicNodesRef.current;
    if (interval) clearInterval(interval);
    oscillators.forEach(osc => { try { osc.stop(); } catch {} });
    gains.forEach(g => { try { g.disconnect(); } catch {} });
    musicNodesRef.current = null;
  }, []);

  return { playSound, startMusic, stopMusic };
}

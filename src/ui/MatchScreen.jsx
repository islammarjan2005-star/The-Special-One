import React, { useEffect, useRef, useState } from 'react';
import { simulateHalf, applyIntervention } from '../engine/game.js';

const REVEAL_MS = 1100; // ~6–10 lines per match ≈ 15 seconds with pauses

export default function MatchScreen({ game, match, onFinish }) {
  const [revealed, setRevealed] = useState([]);
  const [phase, setPhase] = useState('h1'); // h1 | halftime | h2 | ft
  const [shownScore, setShownScore] = useState({ home: 0, away: 0 });
  const queue = useRef([]);
  const timer = useRef(null);
  const halfStarted = useRef({ 1: false, 2: false });

  const playerIsHome = match.playerSide === 'home';

  function revealNext() {
    const ev = queue.current.shift();
    if (!ev) {
      clearInterval(timer.current);
      timer.current = null;
      setPhase((p) => {
        if (p === 'h1') {
          const myGoals = playerIsHome ? match.homeGoals : match.awayGoals;
          const oppGoals = playerIsHome ? match.awayGoals : match.homeGoals;
          // Intervention only offered when losing or drawing at the break.
          return myGoals <= oppGoals ? 'halftime' : 'startH2';
        }
        return 'ft';
      });
      return;
    }
    setRevealed((r) => [...r, ev]);
    if (ev.type === 'goal') {
      setShownScore((s) => ({ home: s.home + (ev.side === 'home' ? 1 : 0), away: s.away + (ev.side === 'away' ? 1 : 0) }));
    }
  }

  function startHalf(half) {
    if (halfStarted.current[half]) return;
    halfStarted.current[half] = true;
    const events = simulateHalf(match);
    queue.current = events.slice();
    setRevealed((r) => [...r, { type: 'marker', text: half === 1 ? 'Kick off!' : 'Second half under way.' }]);
    timer.current = setInterval(revealNext, REVEAL_MS);
  }

  useEffect(() => {
    startHalf(1);
    return () => clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'startH2') {
      setPhase('h2');
      startHalf(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Skip flushes the rest of the current half instantly; the half-time
  // decision (if any) still happens.
  function skip() {
    clearInterval(timer.current);
    timer.current = null;
    while (queue.current.length) revealNext();
    revealNext(); // empty-queue call triggers the phase transition
  }

  function intervene(kind, newMentality) {
    if (kind === 'mentality') applyIntervention(match, match.playerSide, 'mentality', newMentality);
    if (kind === 'hairdryer') applyIntervention(match, match.playerSide, 'hairdryer');
    setPhase('startH2');
  }

  const busy = phase === 'h1' || phase === 'h2';

  return (
    <div className="screen">
      <div className="scoreboard">
        <div className="team">{match.home.name}</div>
        <div className="score">
          {shownScore.home} – {shownScore.away}
        </div>
        <div className="team away">{match.away.name}</div>
      </div>

      <div className="feed">
        {revealed.map((ev, i) => (
          <div key={i} className={`feed-line ${ev.type === 'goal' ? 'goal' : ''}`}>
            {ev.minute != null && <span className="min">{ev.minute}'</span>}
            {ev.text}
          </div>
        ))}
        {phase === 'ft' && (
          <div className="feed-line goal">
            FULL TIME: {match.home.name} {match.homeGoals} – {match.awayGoals} {match.away.name}
          </div>
        )}
      </div>

      {phase === 'halftime' && (
        <div className="halftime">
          <h3>Half-time team talk</h3>
          <p className="muted" style={{ margin: '4px 0' }}>
            You're {shownScore.home === shownScore.away ? 'level' : 'behind'}. One intervention — choose wisely.
          </p>
          <div className="options">
            {['defensive', 'balanced', 'attacking']
              .filter((m) => m !== match[match.playerSide].mentality)
              .map((m) => (
                <button key={m} onClick={() => intervene('mentality', m)}>
                  Switch to {m}
                </button>
              ))}
            <button className="warn" onClick={() => intervene('hairdryer')}>
              🌪️ Hairdryer treatment (form boost, morale risk)
            </button>
            <button className="ghost" onClick={() => intervene('hold')}>
              Hold steady
            </button>
          </div>
        </div>
      )}

      {busy && (
        <button className="ghost" style={{ width: '100%' }} onClick={skip}>
          Skip ⏩
        </button>
      )}
      {phase === 'ft' && (
        <button className="primary big-cta" onClick={() => onFinish(match)}>
          Continue
        </button>
      )}
    </div>
  );
}

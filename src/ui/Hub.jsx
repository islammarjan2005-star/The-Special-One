import React, { useMemo, useState, useEffect } from 'react';
import { myClub, nextFixture, pickBestXI, fmtMoney } from '../engine/game.js';
import { FORMATION, validateXI } from '../engine/match.js';
import { isAvailable } from '../engine/player.js';
import { ratingClass, formArrow } from './helpers.js';

const ICONS = { board: '🏛️', injury: '🚑', news: '📰', bid: '💰', gem: '💎', morale: '😤' };
const POS_ORDER = ['GK', 'DEF', 'MID', 'ATT'];

// How many players of `pos` may be selected: the 4-4-2 quota, plus any
// shortfall other positions can't fill with fit players.
function maxFor(pos, squad) {
  let extra = 0;
  for (const [p, quota] of Object.entries(FORMATION)) {
    if (p === pos) continue;
    const fit = squad.filter((x) => x.position === p && isAvailable(x)).length;
    extra += Math.max(0, quota - fit);
  }
  return pos === 'GK' ? Math.min(1, FORMATION.GK + extra) : FORMATION[pos] + extra;
}

export default function Hub({ game, onKickOff }) {
  const club = myClub(game);
  const fixture = nextFixture(game);
  const [selectedIds, setSelectedIds] = useState(() => new Set(pickBestXI(club.squad).map((p) => p.id)));
  const [mentality, setMentality] = useState('balanced');

  // Re-pick when the week changes (new injuries, transfers).
  useEffect(() => {
    setSelectedIds(new Set(pickBestXI(club.squad).map((p) => p.id)));
  }, [game.week, club.squad.length]);

  const sortedSquad = useMemo(
    () =>
      club.squad
        .slice()
        .sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position) || b.rating - a.rating),
    [club.squad]
  );

  const xi = club.squad.filter((p) => selectedIds.has(p.id));
  const countFor = (pos) => xi.filter((p) => p.position === pos).length;
  const validationError = validateXI(xi, club.squad);

  function toggle(player) {
    if (!isAvailable(player)) return;
    const next = new Set(selectedIds);
    if (next.has(player.id)) {
      next.delete(player.id);
    } else {
      if (xi.length >= 11) return;
      if (countFor(player.position) >= maxFor(player.position, club.squad)) return;
      next.add(player.id);
    }
    setSelectedIds(next);
  }

  const opp = fixture ? game.clubs[fixture.home === game.clubId ? fixture.away : fixture.home] : null;

  return (
    <div className="screen">
      <div className="card">
        <h2>📥 Inbox</h2>
        {game.inbox.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing new.</p>}
        {game.inbox.map((m, i) => (
          <div key={i} className="inbox-item">
            <span className="icon">{ICONS[m.type] ?? '📰'}</span>
            <span>{m.text}</span>
          </div>
        ))}
        <div className="muted" style={{ marginTop: 8 }}>
          Board patience: {game.patience}/100 {game.patience < 25 ? '⚠️' : ''}
        </div>
      </div>

      {opp && (
        <div className="card">
          <h2>
            MW{game.week + 1}: {fixture.home === game.clubId ? 'vs' : 'at'} {opp.short}
          </h2>
          <div className="pick-status">
            {POS_ORDER.map((pos) => (
              <span key={pos} className={countFor(pos) >= FORMATION[pos] ? 'done' : ''}>
                {pos} {countFor(pos)}/{FORMATION[pos]}
              </span>
            ))}
            <span style={{ marginLeft: 'auto' }}>{xi.length}/11</span>
          </div>

          {sortedSquad.map((p) => (
            <div
              key={p.id}
              className={`player-row${selectedIds.has(p.id) ? ' selected' : ''}${!isAvailable(p) ? ' injured' : ''}`}
              onClick={() => toggle(p)}
            >
              <span className="pos">{p.position}</span>
              <span className="name">
                {p.name}
                {p.unsettled ? <span className="unsettled"> · unsettled</span> : null}
                {p.injuryWeeks > 0 ? <span className="muted"> · 🚑 {p.injuryWeeks}w</span> : null}
              </span>
              <span className={`rating ${ratingClass(p.rating)}`}>{p.rating}</span>
              <span className="form">{formArrow(p.form)}</span>
              <span className="wage">{fmtMoney(p.wage)}/w</span>
            </div>
          ))}

          <button
            className="ghost"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => setSelectedIds(new Set(pickBestXI(club.squad).map((p) => p.id)))}
          >
            Auto-pick best XI
          </button>

          <div className="mentality-row">
            {['defensive', 'balanced', 'attacking'].map((m) => (
              <button key={m} className={mentality === m ? 'active' : ''} onClick={() => setMentality(m)}>
                {m === 'defensive' ? '🛡️ Defensive' : m === 'balanced' ? '⚖️ Balanced' : '⚔️ Attacking'}
              </button>
            ))}
          </div>

          {validationError && <div className="buy-note">{validationError}</div>}
          <button className="primary big-cta" disabled={!!validationError} onClick={() => onKickOff(xi, mentality)}>
            Kick off ▶
          </button>
        </div>
      )}
    </div>
  );
}

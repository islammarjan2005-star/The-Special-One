import React, { useMemo, useState } from 'react';
import {
  myClub, aiClubs, dealMode, agreeBuy, agreeSell, cancelDeal, useGemDraw, signGem,
  respondToBid, feeFor, canSell, wageBill, projectedWageBill, projectedSquadSize, fmtMoney,
} from '../engine/game.js';
import { ratingClass } from './helpers.js';

const GRADE_BLURB = {
  wonderkid: '💎 The scouts are giddy. "Sign him before anyone else sees him play."',
  solid: '👍 "Honest pro. He\'ll do a job for us."',
  dud: '😬 "In fairness, the pitch was muddy when we watched him…"',
};

const MODE_BANNER = {
  now: { title: 'Transfer window OPEN', text: 'Deals complete immediately. The window closes at kick-off of your next match.' },
  january: { title: 'Window closed — January deals', text: 'Agree deals now and they go through when the January window opens, after matchweek 19. Funds are committed on agreement.' },
  shut: { title: 'Window shut for the season', text: 'The January deadline has passed. Browse and plan all you like — nobody signs until summer.' },
};

export default function Market({ game, commit }) {
  const club = myClub(game);
  const mode = dealMode(game);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState(null);

  // The market is every player at every other club, searchable year-round.
  const allTargets = useMemo(
    () =>
      aiClubs(game)
        .flatMap((c) => c.squad.map((p) => ({ player: p, club: c })))
        .sort((a, b) => b.player.rating - a.player.rating),
    [game.week, game.pendingDeals.length, club.squad.length] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const q = query.trim().toLowerCase();
  const filtered = allTargets.filter(
    ({ player, club: c }) =>
      (filter === 'ALL' || player.position === filter) &&
      (!q || player.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
  );
  const shown = filtered.slice(0, 30);

  const banner = MODE_BANNER[mode ?? 'shut'];
  const gem = game.gem;

  function act(fn, id) {
    const err = fn();
    setNote(err ? { id, text: err } : null);
    commit();
  }

  return (
    <div className="screen">
      <div className="card">
        <h2>{banner.title}</h2>
        <p className="muted" style={{ margin: 0 }}>{banner.text}</p>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Budget {fmtMoney(club.transferBudget)} · Projected wage bill {fmtMoney(projectedWageBill(game))} /{' '}
          {fmtMoney(club.wageBudget)} per week · Squad {projectedSquadSize(game)} (incl. agreed deals)
        </p>
      </div>

      {game.pendingDeals.length > 0 && (
        <div className="card">
          <h3>🤝 Agreed deals (complete in January)</h3>
          {game.pendingDeals.map((d) => (
            <div key={d.playerId} className="inbox-item">
              <span className="icon">{d.kind === 'buy' ? '🟢' : '🔴'}</span>
              <span style={{ flex: 1 }}>
                {d.kind === 'buy'
                  ? `Buying ${d.playerName} from ${game.clubs[d.fromClubId].short} — ${fmtMoney(d.fee)}`
                  : `Selling ${d.playerName} — ${fmtMoney(d.fee)}`}
              </span>
              <button className="ghost" style={{ padding: '4px 10px' }} onClick={() => { cancelDeal(game, d.playerId); commit(); }}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {game.pendingBid && (
        <div className="card">
          <h3>💰 Incoming bid</h3>
          <p>
            {game.pendingBid.fromClub} offer <b>{fmtMoney(game.pendingBid.fee)}</b> for{' '}
            <b>{game.pendingBid.playerName}</b>.
          </p>
          <p className="muted">Rejecting will unsettle him.</p>
          <div className="row-actions">
            <button className="primary" style={{ flex: 1 }} onClick={() => { respondToBid(game, true); commit(); }}>
              Accept
            </button>
            <button className="danger" style={{ flex: 1 }} onClick={() => { respondToBid(game, false); commit(); }}>
              Reject
            </button>
          </div>
        </div>
      )}

      {(gem.available || (gem.result && !gem.result.signed && gem.usedThisWindow)) && (
        <div className="card gem-card">
          <h3>💎 The Gem Draw</h3>
          {gem.available ? (
            <>
              <p className="muted">
                Your scouts have been scouring non-league pitches and rainy reserve games. They've found
                <i> someone</i>. One reveal per window — could be a wonderkid, could be a donkey.
              </p>
              <button className="warn big-cta" onClick={() => { useGemDraw(game); commit(); }}>
                Reveal the gem
              </button>
            </>
          ) : (
            <>
              <PlayerLine p={gem.result.player} clubName="Non-league" extra={`Fee ${fmtMoney(gem.result.player.gemFee)}`} />
              <p className="muted">{GRADE_BLURB[gem.result.grade]}</p>
              <button className="primary big-cta" onClick={() => act(() => signGem(game), 'gem')}>
                Sign him — {fmtMoney(gem.result.player.gemFee)}, {fmtMoney(gem.result.player.wage)}/w
              </button>
              {note?.id === 'gem' && <div className="buy-note">{note.text}</div>}
              <button className="ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => { gem.result.signed = true; commit(); }}>
                Pass
              </button>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h3>Scout the league</h3>
        <input
          className="search"
          type="search"
          placeholder="Search player or club…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="market-filters">
          {['ALL', 'GK', 'DEF', 'MID', 'ATT'].map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: '0 0 6px' }}>
          Showing {shown.length} of {filtered.length} players
        </p>
        {shown.map(({ player, club: seller }) => {
          const fee = feeFor(player, seller.squad);
          const agreed = game.pendingDeals.some((d) => d.playerId === player.id);
          return (
            <div key={player.id}>
              <PlayerLine p={player} clubName={seller.short} extra={fmtMoney(fee)} />
              <div className="row-actions" style={{ marginBottom: 8 }}>
                <button
                  className="primary"
                  style={{ flex: 1 }}
                  disabled={!mode || agreed}
                  onClick={() => act(() => agreeBuy(game, seller.id, player.id), player.id)}
                >
                  {agreed ? 'Deal agreed ✓' : !mode ? 'Window shut' : mode === 'now' ? `Buy — ${fmtMoney(fee)}` : `Agree January deal — ${fmtMoney(fee)}`}
                </button>
              </div>
              {note?.id === player.id && <div className="buy-note">{note.text}</div>}
            </div>
          );
        })}
        {shown.length === 0 && <p className="muted">No players match.</p>}
      </div>

      <div className="card">
        <h3>Sell from your squad</h3>
        <p className="muted">
          {mode === 'now'
            ? 'Sales complete immediately and free up wages.'
            : mode === 'january'
              ? 'Sales agreed now complete in January — he plays for you until then.'
              : 'Window shut — no sales until summer.'}{' '}
          Minimum squad: 16.
        </p>
        {club.squad
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((p) => {
            const agreed = game.pendingDeals.some((d) => d.playerId === p.id);
            return (
              <div key={p.id}>
                <PlayerLine p={p} clubName={agreed ? 'Sale agreed' : null} extra={fmtMoney(p.value)} />
                <div className="row-actions" style={{ marginBottom: 8 }}>
                  <button
                    className="danger"
                    style={{ flex: 1 }}
                    disabled={!mode || agreed || !!canSell(projectedSquadSize(game))}
                    onClick={() => act(() => agreeSell(game, p.id), p.id)}
                  >
                    {agreed ? 'Sale agreed ✓' : mode === 'now' ? `Sell — ${fmtMoney(p.value)}` : `Agree sale — ${fmtMoney(p.value)}`}
                  </button>
                </div>
                {note?.id === p.id && <div className="buy-note">{note.text}</div>}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function PlayerLine({ p, clubName, extra }) {
  return (
    <div className="player-row" style={{ cursor: 'default' }}>
      <span className="pos">{p.position}</span>
      <span className="name">
        {p.name}
        <span className="muted"> · {p.age}y{clubName ? ` · ${clubName}` : ''}</span>
      </span>
      <span className={`rating ${ratingClass(p.rating)}`}>{p.rating}</span>
      <span className="form" />
      <span className="wage">
        {extra}
        <br />
        {fmtMoney(p.wage)}/w
      </span>
    </div>
  );
}

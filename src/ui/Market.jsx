import React, { useState } from 'react';
import {
  myClub, buyPlayer, sellPlayer, useGemDraw, signGem, respondToBid,
  canBuy, canSell, wageBill, fmtMoney,
} from '../engine/game.js';
import { ratingClass } from './helpers.js';

const GRADE_BLURB = {
  wonderkid: '💎 The scouts are giddy. "Sign him before anyone else sees him play."',
  solid: '👍 "Honest pro. He\'ll do a job for us."',
  dud: '😬 "In fairness, the pitch was muddy when we watched him…"',
};

export default function Market({ game, commit }) {
  const club = myClub(game);
  const [filter, setFilter] = useState('ALL');
  const [note, setNote] = useState(null);

  if (!game.windowOpen) {
    return (
      <div className="screen">
        <div className="card">
          <h2>Transfer market</h2>
          <p className="muted">
            The window is closed. It reopens in January (after matchweek 19).
          </p>
          <SquadValue club={club} />
        </div>
      </div>
    );
  }

  const listed = game.market.filter((p) => filter === 'ALL' || p.position === filter);
  const bill = wageBill(club.squad);
  const gem = game.gem;

  function doBuy(p) {
    const err = buyPlayer(game, p);
    setNote(err ? { id: p.id, text: err } : null);
    commit();
  }

  function doSell(p) {
    const err = sellPlayer(game, p.id);
    setNote(err ? { id: p.id, text: err } : null);
    commit();
  }

  return (
    <div className="screen">
      <div className="card">
        <h2>Transfer window open</h2>
        <p className="muted" style={{ margin: 0 }}>
          Budget {fmtMoney(club.transferBudget)} · Wage bill {fmtMoney(bill)} / {fmtMoney(club.wageBudget)} per week
        </p>
      </div>

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
              <PlayerLine p={gem.result.player} extra={`Fee ${fmtMoney(gem.result.player.gemFee)}`} />
              <p className="muted">{GRADE_BLURB[gem.result.grade]}</p>
              <button
                className="primary big-cta"
                onClick={() => {
                  const err = signGem(game);
                  setNote(err ? { id: 'gem', text: err } : null);
                  commit();
                }}
              >
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
        <h3>Listed players</h3>
        <div className="market-filters">
          {['ALL', 'GK', 'DEF', 'MID', 'ATT'].map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        {listed.map((p) => {
          const blocked = canBuy(p, club, club.squad);
          return (
            <div key={p.id}>
              <PlayerLine p={p} extra={fmtMoney(p.value)} />
              <div className="row-actions" style={{ marginBottom: 8 }}>
                <button className="primary" style={{ flex: 1 }} disabled={!!blocked} onClick={() => doBuy(p)}>
                  {blocked ? 'Can\'t afford' : `Buy for ${fmtMoney(p.value)}`}
                </button>
              </div>
              {blocked && <div className="buy-note">{blocked}</div>}
              {note?.id === p.id && <div className="buy-note">{note.text}</div>}
            </div>
          );
        })}
        {listed.length === 0 && <p className="muted">No players match this filter.</p>}
      </div>

      <div className="card">
        <h3>Sell from your squad</h3>
        <p className="muted">Selling adds the fee to your budget and frees wages. Minimum squad: 16.</p>
        {club.squad
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((p) => (
            <div key={p.id}>
              <PlayerLine p={p} extra={fmtMoney(p.value)} />
              <div className="row-actions" style={{ marginBottom: 8 }}>
                <button className="danger" style={{ flex: 1 }} disabled={!!canSell(club.squad)} onClick={() => doSell(p)}>
                  Sell for {fmtMoney(p.value)}
                </button>
              </div>
              {note?.id === p.id && <div className="buy-note">{note.text}</div>}
            </div>
          ))}
      </div>
    </div>
  );
}

function PlayerLine({ p, extra }) {
  return (
    <div className="player-row" style={{ cursor: 'default' }}>
      <span className="pos">{p.position}</span>
      <span className="name">
        {p.name} <span className="muted">· {p.age}y</span>
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

function SquadValue({ club }) {
  return (
    <p className="muted">
      Squad: {club.squad.length} players · wage bill {fmtMoney(wageBill(club.squad))}/w of {fmtMoney(club.wageBudget)}/w
    </p>
  );
}

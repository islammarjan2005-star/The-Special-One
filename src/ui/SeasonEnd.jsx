import React from 'react';
import { myClub, seasonReview, fmtMoney } from '../engine/game.js';

const OUTCOME = {
  title: { emoji: '🏆', title: 'CHAMPIONS!', blurb: 'You won the league. The town will never forget this season.' },
  europe: { emoji: '✈️', title: 'Europe awaits', blurb: 'A top-five finish books European football next year.' },
  midtable: { emoji: '👏', title: 'Season complete', blurb: 'A respectable campaign.' },
  survived: { emoji: '😅', title: 'Safe!', blurb: 'You beat the drop. Given the budget, that\'s a triumph.' },
  relegated: { emoji: '📉', title: 'Relegated', blurb: 'Down you go. The board is "reviewing all options".' },
  sacked: { emoji: '🪓', title: 'Sacked', blurb: 'The board ran out of patience. Football is a results business.' },
};

export default function SeasonEnd({ game, onShowHeadline, onNewGame }) {
  const club = myClub(game);
  const review = seasonReview(game);
  const outcome = OUTCOME[review.outcome] ?? OUTCOME.midtable;
  const ord = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="screen">
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>{outcome.emoji}</div>
        <h1>{outcome.title}</h1>
        <p className="muted">{outcome.blurb}</p>
      </div>

      <div className="card">
        <h2>Season review — {club.name}</h2>
        <div className="review-grid">
          <div className="item">
            <div className="label">Final position</div>
            <div className="value">{ord(review.position)} (board expected {ord(review.expectation)})</div>
          </div>
          <div className="item">
            <div className="label">Board patience</div>
            <div className="value">{game.patience}/100</div>
          </div>
          <div className="item">
            <div className="label">Transfer spend</div>
            <div className="value">{fmtMoney(review.spent)}</div>
          </div>
          <div className="item">
            <div className="label">Sales income</div>
            <div className="value">{fmtMoney(review.earned)}</div>
          </div>
          <div className="item">
            <div className="label">Final wage bill</div>
            <div className="value">{fmtMoney(review.wageBill)}/w of {fmtMoney(review.wageBudget)}/w</div>
          </div>
          <div className="item">
            <div className="label">Budget remaining</div>
            <div className="value">{fmtMoney(review.transferBudget)}</div>
          </div>
          <div className="item">
            <div className="label">Your top scorer</div>
            <div className="value">{review.myTopScorer ? `${review.myTopScorer.name} (${review.myTopScorer.goals})` : '—'}</div>
          </div>
          <div className="item">
            <div className="label">League top scorer</div>
            <div className="value">{review.topScorer ? `${review.topScorer.name} (${review.topScorer.goals})` : '—'}</div>
          </div>
          <div className="item" style={{ gridColumn: '1 / -1' }}>
            <div className="label">Best signing</div>
            <div className="value">
              {review.bestSigning
                ? `${review.bestSigning.name} — ${fmtMoney(review.bestSigning.fee)}, now rated ${review.bestSigning.current.rating}`
                : 'No signings made'}
            </div>
          </div>
        </div>
      </div>

      {game.headlines.length > 0 && (
        <button className="warn big-cta" onClick={onShowHeadline}>
          📰 Final back page
        </button>
      )}
      <button className="primary big-cta" onClick={onNewGame}>
        Start a new career
      </button>
    </div>
  );
}

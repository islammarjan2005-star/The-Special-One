import React from 'react';
import { myClub, nextFixture, wageBill, fmtMoney, TOTAL_WEEKS } from '../engine/game.js';

export default function TopBar({ game }) {
  const club = myClub(game);
  const headroom = club.wageBudget - wageBill(club.squad);
  const fixture = nextFixture(game);
  const oppId = fixture ? (fixture.home === game.clubId ? fixture.away : fixture.home) : null;
  const opp = oppId ? game.clubs[oppId] : null;
  return (
    <div className="topbar">
      <div className="stat">
        <div className="label">Budget</div>
        <div className="value">{fmtMoney(club.transferBudget)}</div>
      </div>
      <div className="stat">
        <div className="label">Wage room</div>
        <div className={`value${headroom < 0 ? ' neg' : ''}`}>{fmtMoney(headroom)}/w</div>
      </div>
      <div className="stat">
        <div className="label">Next</div>
        <div className="value">{opp ? `${opp.short}${fixture.home === game.clubId ? ' (H)' : ' (A)'}` : '—'}</div>
      </div>
      <div className="stat">
        <div className="label">Matchweek</div>
        <div className="value">{Math.min(game.week + 1, TOTAL_WEEKS)}/{TOTAL_WEEKS}</div>
      </div>
    </div>
  );
}

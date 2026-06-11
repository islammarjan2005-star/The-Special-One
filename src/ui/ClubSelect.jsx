import React from 'react';
import { starterChoices, fmtMoney } from '../engine/game.js';
import { initials } from './helpers.js';

const TAGS = [
  { cls: 'rich', label: 'Rich · Easy', blurb: 'Big budget, big expectations. The board wants trophies.' },
  { cls: 'mid', label: 'Mid-table · Normal', blurb: 'Solid club, modest funds. Overachieve and become a legend.' },
  { cls: 'broke', label: 'Broke · Hard', blurb: 'No money, no stars. But your scouts know where the gems are…' },
];

export default function ClubSelect({ onPick }) {
  const choices = starterChoices();
  return (
    <div className="screen">
      <h1>Perfect Season</h1>
      <p className="muted">
        One league. One season. 38 matchweeks. Pick your club — the budget is the difficulty.
      </p>
      {choices.map((club, i) => (
        <div key={club.id} className="card club-choice" onClick={() => onPick(club.id)}>
          <div className="crest" style={{ background: club.color }}>{initials(club.short)}</div>
          <span className={`tag ${TAGS[i].cls}`}>{TAGS[i].label}</span>
          <h2>{club.name}</h2>
          <p className="muted" style={{ margin: 0 }}>{TAGS[i].blurb}</p>
          <div className="budgets">
            <div><span className="muted">Transfer budget</span><b>{fmtMoney(club.transferBudget)}</b></div>
            <div><span className="muted">Wage budget</span><b>{fmtMoney(club.wageBudget)}/w</b></div>
            <div><span className="muted">Board expects</span><b>{club.expectation === 1 ? '1st' : club.expectation <= 4 ? 'Top 4' : club.expectation >= 18 ? 'Survival' : `~${club.expectation}th`}</b></div>
          </div>
        </div>
      ))}
    </div>
  );
}

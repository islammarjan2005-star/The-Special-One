import React from 'react';
import { sortedTable } from '../engine/game.js';

export default function LeagueTable({ game }) {
  const rows = sortedTable(game.table);
  return (
    <div className="screen">
      <div className="card">
        <h2>League table</h2>
        <table className="league">
          <thead>
            <tr>
              <th>#</th>
              <th style={{ textAlign: 'left' }}>Club</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.clubId}
                className={[
                  r.clubId === game.clubId ? 'me' : '',
                  i < 5 ? 'cl' : '',
                  i >= 17 ? 'rel' : '',
                ].join(' ')}
              >
                <td>{i + 1}</td>
                <td className="club">{game.clubs[r.clubId].short}</td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td>{r.gf - r.ga}</td>
                <td>
                  <b>{r.points}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 8 }}>
          Green: European spots (top 5) · Red: relegation (bottom 3)
        </p>
      </div>
    </div>
  );
}

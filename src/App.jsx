import React, { useReducer, useRef, useState, useEffect } from 'react';
import { newGame, myClub, beginPlayerMatch, finishWeek } from './engine/game.js';
import { saveGame, loadGame, clearSave } from './engine/storage.js';
import TopBar from './ui/TopBar.jsx';
import ClubSelect from './ui/ClubSelect.jsx';
import Hub from './ui/Hub.jsx';
import MatchScreen from './ui/MatchScreen.jsx';
import Market from './ui/Market.jsx';
import LeagueTable from './ui/LeagueTable.jsx';
import HeadlineModal from './ui/HeadlineModal.jsx';
import SeasonEnd from './ui/SeasonEnd.jsx';

export default function App() {
  // The engine mutates the game object in place; commit() persists it and
  // bumps a counter so React re-renders against the new state.
  const gameRef = useRef(null);
  const [, bump] = useReducer((x) => x + 1, 0);
  const [screen, setScreen] = useState('loading');
  const [match, setMatch] = useState(null);
  const [headline, setHeadline] = useState(null);

  function commit() {
    if (gameRef.current) saveGame(gameRef.current);
    bump();
  }

  useEffect(() => {
    const saved = loadGame();
    if (saved) {
      gameRef.current = saved;
      setScreen(saved.ended ? 'end' : 'hub');
    } else {
      setScreen('select');
    }
  }, []);

  const game = gameRef.current;

  function pickClub(clubId) {
    gameRef.current = newGame(clubId);
    commit();
    setScreen('hub');
  }

  function kickOff(xi, mentality) {
    setMatch(beginPlayerMatch(game, xi, mentality));
    setScreen('match');
  }

  function matchFinished(finishedMatch) {
    finishWeek(game, finishedMatch);
    setMatch(null);
    if (game.pendingHeadline) {
      setHeadline(game.pendingHeadline);
      game.pendingHeadline = null;
    }
    commit();
    setScreen(game.ended ? 'end' : 'hub');
  }

  function startOver() {
    clearSave();
    gameRef.current = null;
    setHeadline(null);
    setScreen('select');
  }

  if (screen === 'loading') return null;
  if (screen === 'select') return <ClubSelect onPick={pickClub} />;

  const club = myClub(game);
  const showNav = screen === 'hub' || screen === 'market' || screen === 'table';

  return (
    <>
      <TopBar game={game} />
      {screen === 'hub' && <Hub game={game} onKickOff={kickOff} />}
      {screen === 'market' && <Market game={game} commit={commit} />}
      {screen === 'table' && <LeagueTable game={game} />}
      {screen === 'match' && match && <MatchScreen game={game} match={match} onFinish={matchFinished} />}
      {screen === 'end' && (
        <SeasonEnd
          game={game}
          onShowHeadline={() => setHeadline(game.headlines[game.headlines.length - 1])}
          onNewGame={startOver}
        />
      )}

      {showNav && (
        <nav className="nav">
          <button className={screen === 'hub' ? 'active' : ''} onClick={() => setScreen('hub')}>
            🏟️ Matchday
          </button>
          <button className={screen === 'market' ? 'active' : ''} onClick={() => setScreen('market')}>
            💸 Market{game.windowOpen ? <span className="badge">OPEN</span> : game.pendingDeals.length ? <span className="badge">{game.pendingDeals.length}</span> : null}
          </button>
          <button className={screen === 'table' ? 'active' : ''} onClick={() => setScreen('table')}>
            📊 Table
          </button>
        </nav>
      )}

      {headline && (
        <HeadlineModal
          headline={headline}
          clubColor={club.color}
          clubShort={club.short}
          onClose={() => setHeadline(null)}
        />
      )}
    </>
  );
}

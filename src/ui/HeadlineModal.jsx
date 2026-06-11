import React from 'react';
import { initials } from './helpers.js';

// Renders the tabloid back page as DOM for display, and re-draws it on a
// canvas for the PNG download — no html2canvas dependency needed.

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderHeadlinePng(headline, clubColor, clubShort) {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Aged newsprint background.
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(0, 0, size, size);

  // Masthead.
  ctx.fillStyle = '#111';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.fillText('THE BACK PAGE', 60, 90);
  ctx.font = '28px Georgia, serif';
  ctx.textAlign = 'right';
  ctx.fillText('PERFECT SEASON', size - 60, 90);
  ctx.textAlign = 'left';
  ctx.fillRect(60, 110, size - 120, 8);

  // Headline.
  ctx.font = '900 110px Georgia, serif';
  const lines = wrapText(ctx, headline.headline.toUpperCase(), size - 120);
  let y = 250;
  for (const line of lines.slice(0, 4)) {
    ctx.fillText(line, 60, y);
    y += 118;
  }

  // Subheadline.
  ctx.font = 'italic 42px Georgia, serif';
  ctx.fillStyle = '#333';
  for (const line of wrapText(ctx, headline.sub, size - 120).slice(0, 3)) {
    y += 14;
    ctx.fillText(line, 60, y);
    y += 50;
  }

  // Crest placeholder + score footer.
  const footY = size - 140;
  ctx.strokeStyle = '#999';
  ctx.beginPath();
  ctx.moveTo(60, footY - 60);
  ctx.lineTo(size - 60, footY - 60);
  ctx.stroke();
  ctx.fillStyle = clubColor || '#1B458F';
  ctx.beginPath();
  ctx.arc(110, footY, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(initials(clubShort || headline.ctx?.club || ''), 110, footY + 14);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#111';
  ctx.font = '800 64px Georgia, serif';
  const scoreText = headline.ctx?.score
    ? `${headline.ctx.club} ${headline.ctx.score} ${headline.ctx.opponent ?? ''}`
    : headline.ctx?.club ?? '';
  ctx.fillText(scoreText, 190, footY + 22);

  return canvas;
}

export default function HeadlineModal({ headline, clubColor, clubShort, onClose }) {
  function download() {
    const canvas = renderHeadlinePng(headline, clubColor, clubShort);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'perfect-season-headline.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="inner" onClick={(e) => e.stopPropagation()}>
        <div className="headline-card">
          <div className="masthead">
            <span>The Back Page</span>
            <span>Perfect Season</span>
          </div>
          <div className="head">{headline.headline}</div>
          <div className="sub">{headline.sub}</div>
          <div className="scoreline">
            <div className="crest-ph" style={{ background: clubColor }}>{initials(clubShort)}</div>
            {headline.ctx?.score && (
              <div className="s">
                {headline.ctx.club} {headline.ctx.score} {headline.ctx.opponent}
              </div>
            )}
            {!headline.ctx?.score && <div className="s">{headline.ctx?.club}</div>}
          </div>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={download}>
            Share 📤 (save PNG)
          </button>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

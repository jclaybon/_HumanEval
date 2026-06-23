const RANK_LABELS = ["🥇", "🥈", "🥉"];

export default function DoneScreen({ doneCopy, savedPath, stats, leaderboard = [] }) {
  return (
    <div className="screen active" id="done-screen">
      <div className="done-mark">✦</div>
      <div>
        <h2>Session complete.</h2>
        <p>{doneCopy}</p>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="sn">{stats.reviewedCount}</div>
          <div className="sl">checks</div>
        </div>
        <div className="stat-card good-card">
          <div className="sn">{stats.likes}</div>
          <div className="sl">likes</div>
        </div>
        <div className="stat-card good-card">
          <div className="sn">{stats.superLikes}</div>
          <div className="sl">super likes</div>
        </div>
        <div className="stat-card alert-card">
          <div className="sn">{stats.notLikes}</div>
          <div className="sl">not likes</div>
        </div>
        <div className="stat-card alert-card">
          <div className="sn">{stats.markedIssues}</div>
          <div className="sl">marked issues</div>
        </div>
      </div>

      {leaderboard.length > 0 && (
        <div className="leaderboard">
          <h3 className="leaderboard-title">Leaderboard</h3>
          {leaderboard.map((r) => (
            <div key={r.name} className={`lb-card ${r.rank === 1 ? "lb-card-first" : ""}`}>
              <div className="lb-card-top">
                <span className="lb-rank">{RANK_LABELS[r.rank - 1] ?? `#${r.rank}`}</span>
                <span className="lb-name">{r.name}</span>
                <span className="lb-score">{r.score}%</span>
              </div>
              <div className="lb-stats">
                {r.style !== null && <span className="lb-stat">Style {r.style}%</span>}
                {r.prompt !== null && <span className="lb-stat">Prompt {r.prompt}%</span>}
                {r.skin_tone !== null && <span className="lb-stat">Skin {r.skin_tone}%</span>}
                <span className="lb-stat">🍗 ×{r.cookout}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="info-card">
        <h2>Saved to</h2>
        <code>{savedPath}</code>
      </div>
    </div>
  );
}

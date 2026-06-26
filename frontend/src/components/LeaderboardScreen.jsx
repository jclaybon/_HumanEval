import sammy2Src from "../assets/SAMMY2.0_04-removebg-preview.png";

const RANK_LABELS = ["🥇", "🥈", "🥉"];

export default function LeaderboardScreen({ leaderboard = [], onBack }) {
  return (
    <div className="screen active" id="leaderboard-screen">
      <div className="leaderboard-screen-header">
        <button className="lb-back-btn" type="button" onClick={onBack}>← Back</button>
        <h2 className="leaderboard-screen-title">Leaderboard</h2>
      </div>

      {leaderboard.length === 0 ? (
        <p className="lb-empty">No reviews yet. Complete a session to appear here.</p>
      ) : (
        <div className="leaderboard">
          {leaderboard.map((r) => (
            <div key={r.name} className={`lb-card ${r.rank === 1 ? "lb-card-first" : ""}`}>
              <div className="lb-card-top">
                <span className="lb-rank">{RANK_LABELS[r.rank - 1] ?? `#${r.rank}`}</span>
                <span className="lb-name">{r.name}</span>
                <span className="lb-score">{r.score}%</span>
              </div>
              <div className="lb-stats">
                {r.style    !== null && <span className="lb-stat">Style {r.style}%</span>}
                {r.prompt   !== null && <span className="lb-stat">Prompt {r.prompt}%</span>}
                {r.skin_tone !== null && <span className="lb-stat">Skin {r.skin_tone}%</span>}
                <span className="lb-stat">🍗 ×{r.cookout}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="leaderboard-sammy" aria-hidden="true">
        <img src={sammy2Src} alt="" />
      </div>
    </div>
  );
}

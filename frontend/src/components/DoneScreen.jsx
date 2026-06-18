export default function DoneScreen({ doneCopy, savedPath, stats }) {
  return (
    <div className="screen active" id="done-screen">
      <div className="done-mark">OK</div>
      <div>
        <h2>Batch complete.</h2>
        <p>{doneCopy}</p>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="sn">{stats.reviewedCount}</div>
          <div className="sl">reviewed</div>
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
      <div className="info-card">
        <h2>Saved to</h2>
        <code>{savedPath}</code>
      </div>
    </div>
  );
}

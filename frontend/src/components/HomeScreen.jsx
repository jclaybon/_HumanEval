import logoSrc from "../assets/underscore-animation-logo.png";

export default function HomeScreen({ onStart }) {
  return (
    <div className="screen active" id="home-screen">
      <div className="home-hero">
        <div className="home-orb home-orb-left" aria-hidden="true" />
        <div className="home-orb home-orb-right" aria-hidden="true" />
        <div className="home-logo-card">
          <img
            className="home-logo"
            src={logoSrc}
            alt="Underscore Animation"
          />
        </div>
        <div className="home-copy">
          <span className="home-kicker">Underscore Animation</span>
          <h1>Human Eval</h1>
        </div>
      </div>

      <button className="btn-primary home-start-btn" type="button" onClick={onStart}>
        start
      </button>
    </div>
  );
}

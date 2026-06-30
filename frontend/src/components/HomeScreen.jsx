import { useState } from "react";
import logoSrc from "../assets/underscore-animation-logo.png";
import sammySrc from "../assets/sammy-head-no-light.png";

const THEMES = [
  { id: "light", label: "LIGHT", dot: "#9896a4" },
  { id: "dark",  label: "DARK",  dot: "#1e1b4b" },
  { id: "fun",   label: "FUN",   dot: "#7C3AED" },
  { id: "focus", label: "FOCUS", dot: "#111111" },
];

export default function HomeScreen({ onStart, onViewLeaderboard, theme, onThemeChange }) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <div className="screen active" id="home-screen">
      <div className="home-hero">
        <div className="home-orb home-orb-left" aria-hidden="true" />
        <div className="home-orb home-orb-right" aria-hidden="true" />

        <img className="home-logo" src={logoSrc} alt="Underscore Animation" />

        <div className="home-hero-rule" aria-hidden="true" />

        <div className="home-copy">
          <h1 aria-label="Human Eval">
            {"Human Eval".split("").map((char, i) => (
              <span
                key={i}
                className="title-letter"
                style={{ animationDelay: `${300 + i * 70}ms` }}
              >
                {char === " " ? " " : char}
              </span>
            ))}
          </h1>
          <p className="home-tagline">AI image evaluation</p>
        </div>
      </div>

      <div className="theme-picker">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-picker-btn ${theme === t.id ? "active" : ""}`}
            type="button"
            onClick={() => onThemeChange(t.id)}
          >
            <span className="theme-dot" style={{ background: t.dot }} />
            {t.label}
          </button>
        ))}
      </div>

      <input
        className="home-name-input"
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && trimmed) onStart(trimmed); }}
        autoComplete="off"
      />

      <button
        className="btn-primary home-start-btn"
        type="button"
        disabled={!trimmed}
        onClick={() => onStart(trimmed)}
      >
        start
      </button>

      <button
        className="home-leaderboard-btn"
        type="button"
        onClick={onViewLeaderboard}
      >
        View Leaderboard →
      </button>

      <div className="sammy-peek" aria-hidden="true">
        <img src={sammySrc} alt="" />
      </div>
    </div>
  );
}

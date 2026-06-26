import { useEffect, useRef, useState } from "react";
import sammySrc from "../assets/sammy-head-no-light.png";
import sammy2Src from "../assets/SAMMY2.0_04-removebg-preview.png";

export default function EvalScreen({
  title,
  image,
  contextChip,
  currentIndex,
  total,
  imageReady,
  imageError,
  reviewState,
  maskPathsCount,
  swipePreview,
  stageStyle,
  showSuperLike,
  imageStageRef,
  imageRef,
  maskCanvasRef,
  onImageLoad,
  onImageError,
  onStagePointerDown,
  onStagePointerMove,
  onStagePointerUp,
  onStagePointerCancel,
  onMaskPointerDown,
  onMaskPointerMove,
  onMaskPointerUp,
  onMaskPointerCancel,
  onNotesChange,
  canGoPreviousTask,
  onPreviousTask,
  onBack,
  onNext,
  onClearMarks,
  onSkip
}) {
  const [chipOpen, setChipOpen] = useState(true);
  const [tutorialHint, setTutorialHint] = useState(null);
  const imageCardRef = useRef(null);
  const tutorialTimersRef = useRef([]);

  const isMarking = reviewState.maskMode;
  const hasNotes = reviewState.notes.trim().length > 0;
  const hasMarks = maskPathsCount > 0;
  const canAdvanceFailure = isMarking && hasMarks && hasNotes;
  const canNavigateImages = imageReady && !isMarking;

  const progressPct = total ? Math.round(((currentIndex + 1) / total) * 100) : 0;
  const isTutorial = currentIndex === 0 && imageReady;

  useEffect(() => {
    if (!isTutorial) return;
    const card = imageCardRef.current;
    if (!card) return;

    tutorialTimersRef.current.forEach(clearTimeout);
    tutorialTimersRef.current = [];

    card.style.transition = "transform 0.55s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.4s ease";
    card.style.overflow = "visible";

    function at(ms, fn) {
      tutorialTimersRef.current.push(setTimeout(fn, ms));
    }

    at(800,  () => { card.style.transform = "scale(1.035)"; card.style.boxShadow = "0 24px 52px rgba(124,58,237,0.28)"; });
    at(1200, () => { card.style.transform = "none"; card.style.boxShadow = ""; });
    at(1700, () => { setTutorialHint("left");  card.style.transform = "translateX(-72px) rotate(-9deg)"; card.style.boxShadow = "0 16px 40px rgba(220,38,38,0.5),0 0 0 3px rgba(220,38,38,0.3)"; });
    at(2450, () => { setTutorialHint(null);   card.style.transform = "none"; card.style.boxShadow = ""; });
    at(3000, () => { setTutorialHint("right"); card.style.transform = "translateX(72px) rotate(9deg)";  card.style.boxShadow = "0 16px 40px rgba(22,163,74,0.5),0 0 0 3px rgba(22,163,74,0.3)"; });
    at(3750, () => { setTutorialHint(null);   card.style.transform = "none"; card.style.boxShadow = ""; });
    at(4300, () => { setTutorialHint("up");   card.style.transform = "translateY(-75px)"; card.style.boxShadow = "0 16px 40px rgba(217,119,6,0.5),0 0 0 3px rgba(217,119,6,0.3)"; });
    at(5050, () => { setTutorialHint(null);   card.style.transform = "none"; card.style.boxShadow = ""; });
    at(5600, () => { card.style.transition = ""; card.style.overflow = ""; });

    return () => {
      tutorialTimersRef.current.forEach(clearTimeout);
      if (card) { card.style.transform = ""; card.style.boxShadow = ""; card.style.transition = ""; card.style.overflow = ""; }
      setTutorialHint(null);
    };
  }, [isTutorial]);

  return (
    <div className="screen active" id="eval-screen">
      <div className="eval-progress-bar">
        <div className="eval-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="eval-header">
        <div className="eval-head-left">
          <span className="eval-title">{title}</span>
        </div>
        <div className="pill">{total ? `${currentIndex + 1} / ${total}` : "0 / 0"}</div>
      </div>

      <div className="image-wrap">
        <div className="image-card" ref={imageCardRef}>
          {!imageReady ? <div className="skeleton" /> : null}
          <div
            className="image-stage"
            ref={imageStageRef}
            style={{
              display: imageReady ? "inline-flex" : "none",
              transform: stageStyle.transform,
              opacity: stageStyle.opacity,
              transition: stageStyle.transition
            }}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerCancel}
          >
            <img
              ref={imageRef}
              src={image?.url ?? ""}
              alt={imageError ? "(preview unavailable)" : image?.name ?? ""}
              onLoad={onImageLoad}
              onError={onImageError}
            />
            <canvas
              ref={maskCanvasRef}
              className={`mask-canvas ${isMarking ? "active" : ""}`}
              onPointerDown={onMaskPointerDown}
              onPointerMove={onMaskPointerMove}
              onPointerUp={onMaskPointerUp}
              onPointerCancel={onMaskPointerCancel}
            />
            <div className="swipe-overlay">
              <div className={`swipe-badge nope ${swipePreview === "not_like" ? "visible" : ""}`}>
                Nope
              </div>
              <div className={`swipe-badge like ${swipePreview === "like" ? "visible" : ""}`}>
                Like
              </div>
              <div className={`swipe-badge super ${swipePreview === "super_like" ? "visible" : ""}`}>
                Super
              </div>
            </div>
          </div>
          {tutorialHint === "left"  && <div key="th-left"  className="tutorial-hint tutorial-hint-left">← Nope</div>}
          {tutorialHint === "right" && <div key="th-right" className="tutorial-hint tutorial-hint-right">Like →</div>}
          {tutorialHint === "up"    && <div key="th-up"    className="tutorial-hint tutorial-hint-up">↑ Super</div>}
        </div>
      </div>

      {!isMarking ? (
        <div className="swipe-legend">
          <span className="swipe-legend-item"><span className="swipe-legend-arrow">←</span> No</span>
          <span className="swipe-legend-item"><span className="swipe-legend-arrow">↑</span> Super like</span>
          <span className="swipe-legend-item"><span className="swipe-legend-arrow">→</span> Like</span>
        </div>
      ) : null}

      {contextChip ? (
        <div className="context-chip-wrap">
          <button
            className={`context-chip-btn ${chipOpen ? "open" : ""}`}
            type="button"
            onClick={() => setChipOpen((o) => !o)}
          >
            {contextChip.label}
            <span className="context-chip-arrow">{chipOpen ? "▲" : "▼"}</span>
          </button>
          {chipOpen ? (
            <p className="context-chip-text">{contextChip.text}</p>
          ) : null}
        </div>
      ) : null}

      <div className="swipe-panel">
        {!isMarking ? (
          <div className="desktop-nav-actions">
            <button
              className="desktop-nav-btn"
              type="button"
              disabled={!canGoPreviousTask || !canNavigateImages}
              onClick={onPreviousTask}
            >
              ← Back
            </button>
          </div>
        ) : null}
        <div className={`secondary-actions ${isMarking ? "active" : ""}`}>
          <button className="swipe-btn back" id="back-btn" type="button" onClick={onBack}>
            Back
          </button>
          <button
            className="swipe-btn next"
            id="next-btn"
            type="button"
            disabled={!canAdvanceFailure}
            onClick={onNext}
          >
            Next image
          </button>
          <button
            className="swipe-btn mark"
            id="clear-mark-btn"
            type="button"
            disabled={!hasMarks}
            onClick={onClearMarks}
          >
            Clear marks
          </button>
        </div>
      </div>

      <div className={`notes-area ${isMarking ? "active" : ""}`}>
        <label htmlFor="notes-input">Why is this an issue?</label>
        <textarea
          id="notes-input"
          rows="3"
          disabled={!isMarking}
          value={reviewState.notes}
          placeholder={isMarking ? "Describe the issue you marked." : ""}
          onChange={onNotesChange}
        />
      </div>

      <div className="submit-area">
        <button
          className="skip-btn"
          id="skip-btn"
          type="button"
          disabled={isMarking}
          onClick={onSkip}
        >
          Skip this image
        </button>
      </div>

      {!isMarking && (
        <div className="sammy-peek" aria-hidden="true">
          <img src={sammySrc} alt="" />
        </div>
      )}

      {showSuperLike && (
        <div className="superlike-flash" aria-hidden="true">
          <img src={sammy2Src} alt="" />
        </div>
      )}
    </div>
  );
}

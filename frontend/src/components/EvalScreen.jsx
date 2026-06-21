export default function EvalScreen({
  image,
  currentIndex,
  total,
  imageReady,
  imageError,
  reviewState,
  maskPathsCount,
  swipePreview,
  swipeHint,
  stageStyle,
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
  canGoPreviousImage,
  onPreviousImage,
  onBack,
  onNext,
  onClearMarks,
  onSkip
}) {
  const isMarking = reviewState.maskMode;
  const hasNotes = reviewState.notes.trim().length > 0;
  const hasMarks = maskPathsCount > 0;
  const canAdvanceFailure = isMarking && hasMarks && hasNotes;
  const canNavigateImages = imageReady && !isMarking;

  return (
    <div className="screen active" id="eval-screen">
      <div className="eval-header">
        <div className="eval-head-left">
          <span className="eval-title">Invited to the cookout? 🍗 👀</span>
        </div>
        <div className="pill">{total ? `${currentIndex + 1} / ${total}` : "0 / 0"}</div>
      </div>

      <div className="image-wrap">
        <div className="image-card">
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
              <div
                className={`swipe-badge nope ${
                  swipePreview === "not_like" ? "visible" : ""
                }`}
              >
                Nope
              </div>
              <div
                className={`swipe-badge like ${
                  swipePreview === "like" ? "visible" : ""
                }`}
              >
                Like
              </div>
              <div
                className={`swipe-badge super ${
                  swipePreview === "super_like" ? "visible" : ""
                }`}
              >
                Super
              </div>
              <div className="swipe-hint">{swipeHint}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="swipe-panel">
        {!isMarking ? (
          <div className="desktop-nav-actions">
            <button
              className="desktop-nav-btn"
              type="button"
              disabled={!canGoPreviousImage || !canNavigateImages}
              onClick={onPreviousImage}
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
    </div>
  );
}

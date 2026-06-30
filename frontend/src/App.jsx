import { startTransition, useEffect, useRef, useState } from "react";
import DoneScreen from "./components/DoneScreen";
import EmptyScreen from "./components/EmptyScreen";
import EvalScreen from "./components/EvalScreen";
import HomeScreen from "./components/HomeScreen";
import LeaderboardScreen from "./components/LeaderboardScreen";
import LoadingScreen from "./components/LoadingScreen";

const initialReviewState = {
  verdict: null,
  maskMode: false,
  notes: ""
};

const emptyStats = {
  reviewedCount: 0,
  likes: 0,
  superLikes: 0,
  notLikes: 0,
  markedIssues: 0
};

const defaultStageStyle = {
  transition: "transform .2s ease, opacity .2s ease",
  transform: "translate3d(0, 0, 0) rotate(0deg)",
  opacity: 1
};

const baseEvalTypes = [
  "prompt_faithfulness",
  "style_faithfulness",
  "overall_vibe_check"
];

const evalCopyByType = {
  prompt_faithfulness: {
    title: "Prompt faithful?"
  },
  style_faithfulness: {
    title: "Style faithful?"
  },
  monk_skin_tone: {
    title: "Monk skin tone right?"
  },
  overall_vibe_check: {
    title: "Invited to the cookout? 🍗 👀"
  }
};

function detectSwipeDecision(dx, dy) {
  if (-dy > 110 && Math.abs(dy) > Math.abs(dx) + 20) {
    return "super_like";
  }
  if (dx > 95) {
    return "like";
  }
  if (dx < -95) {
    return "not_like";
  }
  return null;
}

function normalizeHasPerson(value) {
  return value === 1 || value === "1" || value === true ? 1 : 0;
}

function resolveApiBaseUrl() {
  const runtimeBaseUrl =
    typeof globalThis.__VIBE_CHECK_API_BASE_URL__ === "string"
      ? globalThis.__VIBE_CHECK_API_BASE_URL__.trim()
      : "";

  if (runtimeBaseUrl) {
    return runtimeBaseUrl.replace(/\/$/, "");
  }

  const envBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "");
  }

  return "";
}

function shuffleItems(items) {
  const nextItems = items.slice();

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

function buildEvalTasks(images) {
  const tasks = images.flatMap((image) => {
    const nextTasks = baseEvalTypes.map((evalType) => ({
      id: `${image.id}:${evalType}`,
      evalType,
      image
    }));

    if (normalizeHasPerson(image.has_person)) {
      nextTasks.push({
        id: `${image.id}:monk_skin_tone`,
        evalType: "monk_skin_tone",
        image
      });
    }

    return nextTasks;
  });

  return shuffleItems(tasks);
}

function getEvalCopy(evalType) {
  return evalCopyByType[evalType] ?? evalCopyByType.overall_vibe_check;
}

function shouldIgnoreKeyboardShortcut(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}

function computeSummary(results) {
  const completed = results.filter(Boolean);
  const rated = completed.filter((item) => item.verdict !== "skip");
  const likes = rated.filter(
    (item) => item.verdict === "like" || item.verdict === "super_like"
  );
  const superLikes = rated.filter((item) => item.verdict === "super_like");
  const notLikes = rated.filter((item) => item.verdict === "not_like");
  const markedIssues = rated.filter((item) => item.failure_points === "mark");

  return {
    reviewedCount: rated.length,
    likes: likes.length,
    superLikes: superLikes.length,
    notLikes: notLikes.length,
    markedIssues: markedIssues.length
  };
}

function buildTaskResult(task, reviewState, maskPaths, canvas, skipped) {
  if (skipped) {
    return {
      id: task.image.id,
      name: task.image.name,
      eval_type: task.evalType,
      verdict: "skip",
      failure_points: null,
      mask_binary: "no",
      masked_areas: 0,
      mask_data_url: null,
      notes: ""
    };
  }

  return {
    id: task.image.id,
    name: task.image.name,
    eval_type: task.evalType,
    verdict: reviewState.verdict,
    failure_points: maskPaths.length ? "mark" : "clear",
    mask_binary: maskPaths.length ? "yes" : "no",
    masked_areas: maskPaths.length,
    mask_data_url: maskPaths.length && canvas ? canvas.toDataURL("image/png") : null,
    notes: reviewState.notes.trim()
  };
}

function friendlyLoadMessage(error) {
  if (error instanceof Error && error.message === "Failed to fetch") {
    return "Review API not reachable. Start the local server or point the UI at the deployed worker.";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not load images.";
}

export default function App() {
  const apiBaseUrl = resolveApiBaseUrl();
  const [screen, setScreen] = useState("loading");
  const [loadingCopy, setLoadingCopy] = useState({
    title: "Loading images",
    description: "Looking for files in the configured review source."
  });
  const [emptyView, setEmptyView] = useState({
    title: "No images found",
    description: "Add images to the configured review source, then refresh this page.",
    detailLabel: "Review source",
    detail: "-"
  });
  const [batchInfo, setBatchInfo] = useState({
    batchName: "",
    reviewSource: "",
    outputPath: ""
  });
  const [images, setImages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [reviewState, setReviewState] = useState(initialReviewState);
  const [maskPaths, setMaskPaths] = useState([]);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [swipePreview, setSwipePreview] = useState(null);
  const [stageStyle, setStageStyle] = useState(defaultStageStyle);
  const [showSuperLike, setShowSuperLike] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("humaneval-theme") || "fun");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("humaneval-theme", theme);
  }, [theme]);

  const [doneView, setDoneView] = useState({
    doneCopy: "Results were saved.",
    savedPath: "-",
    stats: emptyStats,
    leaderboard: []
  });

  const imageStageRef = useRef(null);
  const imageRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const swipeGestureRef = useRef(null);
  const swipeDeltaRef = useRef({ x: 0, y: 0 });
  const drawingPointerIdRef = useRef(null);
  const activePathRef = useRef(null);
  const isDrawingRef = useRef(false);
  const advanceTimerRef = useRef(null);
  const resetAnimationFrameRef = useRef(null);

  const batchInfoRef = useRef(batchInfo);
  const imagesRef = useRef(images);
  const tasksRef = useRef(tasks);
  const currentIndexRef = useRef(currentIndex);
  const resultsRef = useRef(results);
  const reviewStateRef = useRef(reviewState);
  const maskPathsRef = useRef(maskPaths);

  const currentTask = tasks[currentIndex] ?? null;
  const currentImage = currentTask?.image ?? null;
  const currentEvalCopy = getEvalCopy(currentTask?.evalType);

  function setBatchInfoValue(nextValue) {
    batchInfoRef.current = nextValue;
    setBatchInfo(nextValue);
  }

  function setImagesValue(nextValue) {
    imagesRef.current = nextValue;
    setImages(nextValue);
  }

  function setTasksValue(nextValue) {
    tasksRef.current = nextValue;
    setTasks(nextValue);
  }

  function setCurrentIndexValue(nextValue) {
    currentIndexRef.current = nextValue;
    setCurrentIndex(nextValue);
  }

  function setResultsValue(nextValue) {
    resultsRef.current = nextValue;
    setResults(nextValue);
  }

  function setReviewStateValue(nextValue) {
    reviewStateRef.current = nextValue;
    setReviewState(nextValue);
  }

  function patchReviewState(patch) {
    const nextValue = {
      ...reviewStateRef.current,
      ...patch
    };
    setReviewStateValue(nextValue);
    return nextValue;
  }

  function setMaskPathsValue(nextValue) {
    maskPathsRef.current = nextValue;
    setMaskPaths(nextValue);
  }

  function redrawMaskCanvas(paths = maskPathsRef.current, activePath = activePathRef.current) {
    const canvas = maskCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 6;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "rgba(193, 68, 14, 0.95)";

    for (const path of paths) {
      if (!path.length) {
        continue;
      }
      context.beginPath();
      context.moveTo(path[0].x, path[0].y);
      for (const point of path.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.stroke();
    }

    if (activePath && activePath.length) {
      context.beginPath();
      context.moveTo(activePath[0].x, activePath[0].y);
      for (const point of activePath.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
  }

  function resizeMaskCanvas() {
    const imageElement = imageRef.current;
    const canvas = maskCanvasRef.current;
    if (!imageElement || !canvas || !imageElement.clientWidth || !imageElement.clientHeight) {
      return;
    }

    canvas.width = imageElement.clientWidth;
    canvas.height = imageElement.clientHeight;
    canvas.style.width = `${imageElement.clientWidth}px`;
    canvas.style.height = `${imageElement.clientHeight}px`;
    redrawMaskCanvas();
  }

  function resetSwipeCard(immediate = false) {
    swipeGestureRef.current = null;
    swipeDeltaRef.current = { x: 0, y: 0 };
    setSwipePreview(null);

    if (resetAnimationFrameRef.current) {
      cancelAnimationFrame(resetAnimationFrameRef.current);
      resetAnimationFrameRef.current = null;
    }

    setStageStyle({
      transition: immediate ? "none" : defaultStageStyle.transition,
      transform: defaultStageStyle.transform,
      opacity: defaultStageStyle.opacity
    });

    if (immediate) {
      resetAnimationFrameRef.current = requestAnimationFrame(() => {
        setStageStyle((currentValue) => ({
          ...currentValue,
          transition: defaultStageStyle.transition
        }));
      });
    }
  }

  function clearMaskDrawing() {
    activePathRef.current = null;
    isDrawingRef.current = false;
    drawingPointerIdRef.current = null;
    setMaskPathsValue([]);
    redrawMaskCanvas([], null);
  }

  function getCanvasPoint(event) {
    const canvas = maskCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function startMaskStroke(event) {
    if (!reviewStateRef.current.maskMode) {
      return;
    }

    event.preventDefault();
    drawingPointerIdRef.current = event.pointerId;
    isDrawingRef.current = true;
    activePathRef.current = [getCanvasPoint(event)];
    maskCanvasRef.current?.setPointerCapture?.(event.pointerId);
    redrawMaskCanvas(maskPathsRef.current, activePathRef.current);
  }

  function extendMaskStroke(event) {
    if (
      !isDrawingRef.current ||
      !reviewStateRef.current.maskMode ||
      event.pointerId !== drawingPointerIdRef.current ||
      !activePathRef.current
    ) {
      return;
    }

    event.preventDefault();
    activePathRef.current = activePathRef.current.concat(getCanvasPoint(event));
    redrawMaskCanvas(maskPathsRef.current, activePathRef.current);
  }

  function endMaskStroke(event) {
    if (!isDrawingRef.current || event.pointerId !== drawingPointerIdRef.current) {
      return;
    }

    event.preventDefault();

    if (maskCanvasRef.current?.hasPointerCapture?.(event.pointerId)) {
      maskCanvasRef.current.releasePointerCapture(event.pointerId);
    }

    const completedPath = activePathRef.current;
    activePathRef.current = null;
    isDrawingRef.current = false;
    drawingPointerIdRef.current = null;

    if (completedPath && completedPath.length > 1) {
      const nextPaths = maskPathsRef.current.concat([completedPath]);
      setMaskPathsValue(nextPaths);
      redrawMaskCanvas(nextPaths, null);
      return;
    }

    redrawMaskCanvas(maskPathsRef.current, null);
  }

  function beginFailureReview() {
    patchReviewState({
      verdict: "not_like",
      maskMode: true
    });
    navigator.vibrate?.(10);
    setSwipePreview(null);
    setStageStyle({
      transition: "transform .18s ease, opacity .18s ease",
      transform: defaultStageStyle.transform,
      opacity: 1
    });
  }

  function applySwipeVisual(dx, dy) {
    const rotation = Math.max(-16, Math.min(16, dx / 14));
    const lift = dy < 0 ? dy : dy * 0.2;
    setStageStyle((currentValue) => ({
      ...currentValue,
      transition: "none",
      transform: `translate3d(${dx}px, ${lift}px, 0) rotate(${rotation}deg)`,
      opacity: 1
    }));
    setSwipePreview(detectSwipeDecision(dx, dy));
  }

  function beginSwipe(event) {
    if (reviewStateRef.current.maskMode || isDrawingRef.current) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    swipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    swipeDeltaRef.current = { x: 0, y: 0 };
    setStageStyle((currentValue) => ({
      ...currentValue,
      transition: "none"
    }));
    imageStageRef.current?.setPointerCapture?.(event.pointerId);
  }

  function moveSwipe(event) {
    if (!swipeGestureRef.current || event.pointerId !== swipeGestureRef.current.pointerId) {
      return;
    }

    event.preventDefault();
    swipeDeltaRef.current = {
      x: event.clientX - swipeGestureRef.current.startX,
      y: event.clientY - swipeGestureRef.current.startY
    };
    applySwipeVisual(swipeDeltaRef.current.x, swipeDeltaRef.current.y);
  }

  async function advance(skipped) {
    const task = tasksRef.current[currentIndexRef.current];
    if (!task) {
      return;
    }

    if (!skipped && reviewStateRef.current.verdict === "not_like") {
      const hasNotes = reviewStateRef.current.notes.trim().length > 0;
      if (!maskPathsRef.current.length || !hasNotes) {
        return;
      }
    }

    const nextResult = buildTaskResult(
      task,
      reviewStateRef.current,
      maskPathsRef.current,
      maskCanvasRef.current,
      skipped
    );
    const nextResults = resultsRef.current.slice();
    nextResults[currentIndexRef.current] = nextResult;
    setResultsValue(nextResults);

    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex < tasksRef.current.length) {
      setCurrentIndexValue(nextIndex);
      return;
    }

    const pendingIndex = nextResults.findIndex((item) => item === null);
    if (pendingIndex === -1) {
      await finishEval(nextResults);
      return;
    }

    setCurrentIndexValue(pendingIndex);
  }

  function completeSwipeDecision(decision) {
    patchReviewState({ verdict: decision });

    if (decision === "super_like") {
      navigator.vibrate?.([15, 60, 15]);
      setShowSuperLike(true);
      setSwipePreview(decision);
      setStageStyle({
        transition: "transform .24s ease, opacity .24s ease",
        transform: "translate3d(0, -140px, 0) scale(.96)",
        opacity: 0.08
      });
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        advance(false);
        window.setTimeout(() => setShowSuperLike(false), 680);
      }, 220);
    } else {
      navigator.vibrate?.(10);
      setSwipePreview(decision);
      setStageStyle({
        transition: "transform .24s ease, opacity .24s ease",
        transform:
          decision === "like"
            ? "translate3d(140px, -10px, 0) rotate(14deg)"
            : "translate3d(-140px, -10px, 0) rotate(-14deg)",
        opacity: 0.08
      });
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        advance(false);
      }, 220);
    }
  }

  function goToImage(nextIndex) {
    if (nextIndex < 0 || nextIndex >= tasksRef.current.length) {
      return;
    }

    window.clearTimeout(advanceTimerRef.current);
    setCurrentIndexValue(nextIndex);
  }

  function handlePreviousImage() {
    if (!imageReady || reviewStateRef.current.maskMode) {
      return;
    }

    goToImage(currentIndexRef.current - 1);
  }

  function endSwipe(event) {
    if (!swipeGestureRef.current || event.pointerId !== swipeGestureRef.current.pointerId) {
      return;
    }

    if (imageStageRef.current?.hasPointerCapture?.(event.pointerId)) {
      imageStageRef.current.releasePointerCapture(event.pointerId);
    }

    const decision = detectSwipeDecision(swipeDeltaRef.current.x, swipeDeltaRef.current.y);
    swipeGestureRef.current = null;

    if (decision === "not_like") {
      beginFailureReview();
      return;
    }

    if (decision) {
      completeSwipeDecision(decision);
      return;
    }

    resetSwipeCard();
  }

  function cancelSwipe(event) {
    if (!swipeGestureRef.current || event.pointerId !== swipeGestureRef.current.pointerId) {
      return;
    }

    if (imageStageRef.current?.hasPointerCapture?.(event.pointerId)) {
      imageStageRef.current.releasePointerCapture(event.pointerId);
    }

    swipeGestureRef.current = null;
    resetSwipeCard();
  }

  function returnToSwipeMode() {
    window.clearTimeout(advanceTimerRef.current);
    setReviewStateValue(initialReviewState);
    clearMaskDrawing();
    setImageError(false);
    resetSwipeCard(true);
  }

  async function finishEval(finalResults) {
    const normalizedResults = finalResults.filter(Boolean);
    const summary = computeSummary(normalizedResults);

    setLoadingCopy({
      title: "Saving results",
      description: "Saving this batch."
    });
    setScreen("saving");

    try {
      const response = await fetch(`${apiBaseUrl}/api/save-results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          batch_name: batchInfoRef.current.batchName,
          image_dir: batchInfoRef.current.reviewSource,
          reviewer_name: reviewerName,
          results: normalizedResults
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not save results.");
      }

      let leaderboard = [];
      try {
        const lbRes = await fetch(`${apiBaseUrl}/api/leaderboard?batch=${batchInfoRef.current.batchName}`);
        const lbPayload = await lbRes.json();
        leaderboard = lbPayload.reviewers || [];
      } catch (_) {}

      setDoneView({
        doneCopy: `Saved ${payload.reviewed_count} checks.`,
        savedPath: payload.output_path,
        stats: {
          reviewedCount: payload.reviewed_count,
          likes: payload.likes,
          superLikes: payload.super_likes,
          notLikes: payload.not_likes,
          markedIssues: payload.marked_issues
        },
        leaderboard
      });
    } catch (error) {
      setDoneView({
        doneCopy: error instanceof Error ? error.message : "Could not save results.",
        savedPath: "Save failed",
        stats: summary
      });
    }

    setScreen("done");
  }

  function handleNotesChange(event) {
    patchReviewState({ notes: event.target.value });
  }

  function handleImageLoad() {
    setImageReady(true);
    setImageError(false);
    resizeMaskCanvas();
    resetSwipeCard(true);
  }

  function handleImageError() {
    setImageReady(true);
    setImageError(true);
    resizeMaskCanvas();
    resetSwipeCard(true);
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/bootstrap`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Could not load images.");
        }

        const nextBatchInfo = {
          batchName: payload.batch_name,
          reviewSource: payload.image_dir,
          outputPath: payload.output_path
        };
        const nextImages = payload.images || [];

        startTransition(() => {
          setBatchInfoValue(nextBatchInfo);
          const nextTasks = buildEvalTasks(nextImages);

          setImagesValue(nextImages);
          setTasksValue(nextTasks);
          setResultsValue(nextTasks.map(() => null));
          setCurrentIndexValue(0);

          if (nextTasks.length) {
            setScreen("home");
            return;
          }

          setEmptyView({
            title: "No images found",
            description:
              "Add images to the configured review source, then refresh this page.",
            detailLabel: "Review source",
            detail: nextBatchInfo.reviewSource
          });
          setScreen("empty");
        });
      } catch (error) {
        setEmptyView({
          title: "Could not load images",
          description: "The frontend could not load the review batch.",
          detailLabel: "Details",
          detail: friendlyLoadMessage(error)
        });
        setScreen("empty");
      }
    }

    bootstrap();

    return () => {
      window.clearTimeout(advanceTimerRef.current);
      if (resetAnimationFrameRef.current) {
        cancelAnimationFrame(resetAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      resizeMaskCanvas();
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (screen !== "eval" || !currentTask) {
      return;
    }

    window.clearTimeout(advanceTimerRef.current);
    setReviewStateValue(initialReviewState);
    setMaskPathsValue([]);
    activePathRef.current = null;
    isDrawingRef.current = false;
    drawingPointerIdRef.current = null;
    setImageReady(false);
    setImageError(false);
    redrawMaskCanvas([], null);
    resetSwipeCard(true);
  }, [screen, currentTask]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (screen !== "eval" || !currentTask || !imageReady) {
        return;
      }
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (shouldIgnoreKeyboardShortcut(event.target)) {
        return;
      }
      if (
        reviewStateRef.current.maskMode ||
        isDrawingRef.current ||
        swipeGestureRef.current ||
        reviewStateRef.current.verdict
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        beginFailureReview();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        completeSwipeDecision("like");
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        completeSwipeDecision("super_like");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [screen, currentTask, imageReady]);

  if (screen === "loading" || screen === "saving") {
    return (
      <LoadingScreen
        title={loadingCopy.title}
        description={loadingCopy.description}
      />
    );
  }

  if (screen === "empty") {
    return (
      <EmptyScreen
        title={emptyView.title}
        description={emptyView.description}
        detailLabel={emptyView.detailLabel}
        detail={emptyView.detail}
      />
    );
  }

  if (screen === "home") {
    return (
      <HomeScreen
        onStart={(name) => { setReviewerName(name); setScreen("eval"); }}
        onViewLeaderboard={async () => {
          try {
            const res = await fetch(`${apiBaseUrl}/api/leaderboard?batch=underscorehumaneval`);
            const payload = await res.json();
            setDoneView((prev) => ({ ...prev, leaderboard: payload.reviewers || [] }));
          } catch (_) {}
          setScreen("leaderboard");
        }}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }

  if (screen === "leaderboard") {
    return (
      <LeaderboardScreen
        leaderboard={doneView.leaderboard}
        onBack={() => setScreen("home")}
      />
    );
  }

  if (screen === "done") {
    return (
      <DoneScreen
        doneCopy={doneView.doneCopy}
        savedPath={doneView.savedPath}
        stats={doneView.stats}
        leaderboard={doneView.leaderboard}
      />
    );
  }

  const contextChip = (() => {
    if (!currentTask || !currentImage) return null;
    if (currentTask.evalType === "prompt_faithfulness" && currentImage.created_from_prompt) {
      return { label: "Prompt", text: currentImage.created_from_prompt };
    }
    if (currentTask.evalType === "style_faithfulness") {
      const parts = [currentImage.style_name, currentImage.style_description_keyword].filter(Boolean);
      if (parts.length) return { label: "Style", text: parts.join(" — ") };
    }
    return null;
  })();

  // style_reference_url will come from image_metadata once added to the DB schema
  const styleReferenceUrl = currentTask?.evalType === "style_faithfulness"
    ? (currentImage?.style_reference_url ?? null)
    : null;

  return (
    <EvalScreen
      title={currentEvalCopy.title}
      image={currentImage}
      contextChip={contextChip}
      styleReferenceUrl={styleReferenceUrl}
      isStyleEval={currentTask?.evalType === "style_faithfulness"}
      currentIndex={currentIndex}
      total={tasks.length}
      imageReady={imageReady}
      imageError={imageError}
      reviewState={reviewState}
      maskPathsCount={maskPaths.length}
      swipePreview={swipePreview}
      stageStyle={stageStyle}
      showSuperLike={showSuperLike}
      imageStageRef={imageStageRef}
      imageRef={imageRef}
      maskCanvasRef={maskCanvasRef}
      onImageLoad={handleImageLoad}
      onImageError={handleImageError}
      onStagePointerDown={beginSwipe}
      onStagePointerMove={moveSwipe}
      onStagePointerUp={endSwipe}
      onStagePointerCancel={cancelSwipe}
      onMaskPointerDown={startMaskStroke}
      onMaskPointerMove={extendMaskStroke}
      onMaskPointerUp={endMaskStroke}
      onMaskPointerCancel={endMaskStroke}
      onNotesChange={handleNotesChange}
      canGoPreviousTask={currentIndex > 0}
      onPreviousTask={handlePreviousImage}
      onBack={returnToSwipeMode}
      onNext={() => advance(false)}
      onClearMarks={clearMaskDrawing}
      onSkip={() => advance(true)}
    />
  );
}

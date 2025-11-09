import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const BOARD_STATE_STORAGE_KEY = "aidata.board-state.v1";
export const BOARD_WIDTH = 3600;
export const BOARD_HEIGHT = 2400;
const BOARD_MIN_SCALE = 0.35;
const BOARD_MAX_SCALE = 1.75;
const BOARD_SCROLL_PADDING = 320;

export type BoardState = { x: number; y: number; scale: number };

export function useBoardViewport() {
  const boardViewportRef = useRef<HTMLDivElement | null>(null);
  const boardSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [boardState, setBoardState] = useState<BoardState>({ x: 0, y: 0, scale: 1 });
  const [boardInitialized, setBoardInitialized] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isBoardDragging, setIsBoardDragging] = useState(false);
  const panSession = useRef<{
    active: boolean;
    pointerId: number | null;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  }>({
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    startX: 0,
    startY: 0,
  });

  const clampBoardState = useCallback(
    (state: BoardState): BoardState => {
      const viewport = boardViewportRef.current;
      const vw =
        viewport?.clientWidth ??
        (typeof window !== "undefined" ? window.innerWidth : BOARD_WIDTH);
      const vh =
        viewport?.clientHeight ??
        (typeof window !== "undefined" ? window.innerHeight : BOARD_HEIGHT);
      const clampedScale = Math.min(Math.max(state.scale, BOARD_MIN_SCALE), BOARD_MAX_SCALE);
      const scaledWidth = BOARD_WIDTH * clampedScale;
      const scaledHeight = BOARD_HEIGHT * clampedScale;
      const computeBounds = (view: number, content: number) => {
        if (content <= view) {
          const center = (view - content) / 2;
          return {
            min: center - BOARD_SCROLL_PADDING,
            max: center + BOARD_SCROLL_PADDING,
          };
        }
        return {
          min: view - content - BOARD_SCROLL_PADDING,
          max: BOARD_SCROLL_PADDING,
        };
      };
      const { min: minX, max: maxX } = computeBounds(vw, scaledWidth);
      const { min: minY, max: maxY } = computeBounds(vh, scaledHeight);
      return {
        x: Math.min(Math.max(state.x, minX), maxX),
        y: Math.min(Math.max(state.y, minY), maxY),
        scale: clampedScale,
      };
    },
    [],
  );

  const updateBoardState = useCallback(
    (updater: BoardState | ((prev: BoardState) => BoardState)) => {
      setBoardState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: BoardState) => BoardState)(prev)
            : updater;
        return clampBoardState(next);
      });
    },
    [clampBoardState],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(BOARD_STATE_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<BoardState>;
        updateBoardState({
          x: typeof parsed.x === "number" ? parsed.x : 0,
          y: typeof parsed.y === "number" ? parsed.y : 0,
          scale: typeof parsed.scale === "number" ? parsed.scale : 1,
        });
      } catch {
        updateBoardState({ x: 0, y: 0, scale: 1 });
      }
    } else {
      const viewport = boardViewportRef.current;
      const vw = viewport?.clientWidth ?? window.innerWidth;
      const vh = viewport?.clientHeight ?? window.innerHeight;
      updateBoardState({
        x: (vw - BOARD_WIDTH) / 2,
        y: (vh - BOARD_HEIGHT) / 2,
        scale: 1,
      });
    }
    setBoardInitialized(true);
  }, [updateBoardState]);

  useEffect(() => {
    if (!boardInitialized || typeof window === "undefined") return;
    window.localStorage.setItem(
      BOARD_STATE_STORAGE_KEY,
      JSON.stringify(boardState),
    );
  }, [boardInitialized, boardState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      updateBoardState((prev) => ({ ...prev }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateBoardState]);

  useEffect(() => {
    const isTypingElement = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target.isContentEditable ||
        target.getAttribute("role") === "textbox"
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (isTypingElement(event.target)) return;
      event.preventDefault();
      setSpacePressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setSpacePressed(false);
      setIsBoardDragging(false);
      if (panSession.current.active && panSession.current.pointerId !== null) {
        const surface = boardSurfaceRef.current;
        if (surface && surface.hasPointerCapture(panSession.current.pointerId)) {
          surface.releasePointerCapture(panSession.current.pointerId);
        }
        panSession.current.active = false;
        panSession.current.pointerId = null;
      }
    };
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const wheelSnapshotRef = useRef<{
    ctrlKey: boolean;
    deltaX: number;
    deltaY: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);

  const flushWheelEvent = useCallback(() => {
    wheelFrameRef.current = null;
    const snapshot = wheelSnapshotRef.current;
    wheelSnapshotRef.current = null;
    if (!snapshot) return;

    if (snapshot.ctrlKey) {
      updateBoardState((prev) => {
        const viewport = boardViewportRef.current?.getBoundingClientRect();
        if (!viewport) return prev;
        const scaleDelta = Math.exp(-snapshot.deltaY * 0.0015);
        const nextScale = Math.min(
          Math.max(prev.scale * scaleDelta, BOARD_MIN_SCALE),
          BOARD_MAX_SCALE,
        );
        const pointerX = snapshot.clientX - viewport.left;
        const pointerY = snapshot.clientY - viewport.top;
        const originX = (pointerX - prev.x) / prev.scale;
        const originY = (pointerY - prev.y) / prev.scale;
        const x = pointerX - originX * nextScale;
        const y = pointerY - originY * nextScale;
        return { x, y, scale: nextScale };
      });
    } else {
      updateBoardState((prev) => ({
        ...prev,
        x: prev.x - snapshot.deltaX,
        y: prev.y - snapshot.deltaY,
      }));
    }
  }, [updateBoardState]);

  const handleBoardWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      wheelSnapshotRef.current = {
        ctrlKey: event.ctrlKey,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (wheelFrameRef.current === null) {
        wheelFrameRef.current = requestAnimationFrame(flushWheelEvent);
      }
    },
    [flushWheelEvent],
  );

  useEffect(() => {
    const viewport = boardViewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleBoardWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleBoardWheel);
  }, [handleBoardWheel]);

  useEffect(() => {
    return () => {
      if (wheelFrameRef.current !== null) {
        cancelAnimationFrame(wheelFrameRef.current);
      }
    };
  }, []);

  const handleBoardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!spacePressed || event.button !== 0) return;
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      event.stopPropagation();
      panSession.current = {
        active: true,
        pointerId: event.pointerId,
        originX: boardState.x,
        originY: boardState.y,
        startX: event.clientX,
        startY: event.clientY,
      };
      setIsBoardDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [boardState.x, boardState.y, spacePressed],
  );

  const handleBoardPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !panSession.current.active ||
        (panSession.current.pointerId !== null &&
          event.pointerId !== panSession.current.pointerId)
      ) {
        return;
      }
      event.preventDefault();
      const dx = event.clientX - panSession.current.startX;
      const dy = event.clientY - panSession.current.startY;
      updateBoardState((prev) => ({
        ...prev,
        x: panSession.current.originX + dx,
        y: panSession.current.originY + dy,
      }));
    },
    [updateBoardState],
  );

  const handleBoardPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !panSession.current.active ||
        (panSession.current.pointerId !== null &&
          event.pointerId !== panSession.current.pointerId)
      ) {
        return;
      }
      if (
        panSession.current.pointerId !== null &&
        event.currentTarget.hasPointerCapture(panSession.current.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(panSession.current.pointerId);
      }
      panSession.current.active = false;
      panSession.current.pointerId = null;
      setIsBoardDragging(false);
    },
    [],
  );

  const adjustZoom = useCallback(
    (direction: "in" | "out") => {
      const viewport = boardViewportRef.current?.getBoundingClientRect();
      const vw =
        viewport?.width ??
        (typeof window !== "undefined" ? window.innerWidth : BOARD_WIDTH);
      const vh =
        viewport?.height ??
        (typeof window !== "undefined" ? window.innerHeight : BOARD_HEIGHT);
      const pointerX = vw / 2;
      const pointerY = vh / 2;
      const factor = direction === "in" ? 1.1 : 1 / 1.1;
      updateBoardState((prev) => {
        const nextScale = Math.min(
          Math.max(prev.scale * factor, BOARD_MIN_SCALE),
          BOARD_MAX_SCALE,
        );
        const originX = (pointerX - prev.x) / prev.scale;
        const originY = (pointerY - prev.y) / prev.scale;
        const x = pointerX - originX * nextScale;
        const y = pointerY - originY * nextScale;
        return { x, y, scale: nextScale };
      });
    },
    [updateBoardState],
  );

  const handleZoomIn = useCallback(() => adjustZoom("in"), [adjustZoom]);
  const handleZoomOut = useCallback(() => adjustZoom("out"), [adjustZoom]);

  const zoomPercent = useMemo(
    () => Math.round(boardState.scale * 100),
    [boardState.scale],
  );

  return {
    boardViewportRef,
    boardSurfaceRef,
    boardState,
    spacePressed,
    isBoardDragging,
    handleBoardPointerDown,
    handleBoardPointerMove,
    handleBoardPointerUp,
    handleZoomIn,
    handleZoomOut,
    zoomPercent,
  };
}

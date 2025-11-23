import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

const SPLITTER_SIZE = 1;
const SPLITTER_HIT_AREA = 8;

type DockSide = "left" | "right" | "top" | "bottom";

type DragState = {
  active: boolean;
  dock: DockSide | null;
  collapsedDrag: boolean;
};

type QuadDockProps = {
  left: ReactNode;
  right: ReactNode;
  top: ReactNode;
  bottom: ReactNode;
  center: ReactNode;
  leftInitialSize?: number;
  rightInitialSize?: number;
  topInitialSize?: number;
  bottomInitialSize?: number;
  leftMinSize?: number;
  rightMinSize?: number;
  topMinSize?: number;
  bottomMinSize?: number;
  centerMinWidth?: number;
  centerMinHeight?: number;
  className?: string;
};

/**
 * A quad dock component that allows you to split the screen into four panels.
 * @param left - The left panel content
 * @param right - The right panel content
 * @param top - The top panel content
 * @param bottom - The bottom panel content
 * @param center - The center panel content
 * @param leftInitialSize - The initial size of the left panel (in percentage)
 * @param rightInitialSize - The initial size of the right panel (in percentage)
 * @param topInitialSize - The initial size of the top panel (in percentage)
 * @param bottomInitialSize - The initial size of the bottom panel (in percentage)
 */
export function QuadDock({
  left,
  right,
  top,
  bottom,
  center,
  leftInitialSize = 20,
  rightInitialSize = 20,
  topInitialSize = 25,
  bottomInitialSize = 25,
  leftMinSize = 10,
  rightMinSize = 10,
  topMinSize = 15,
  bottomMinSize = 15,
  centerMinWidth = 30,
  centerMinHeight = 30,
  className = "",
}: QuadDockProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [collapsed, setCollapsed] = useState<Record<DockSide, boolean>>({
    left: false,
    right: false,
    top: false,
    bottom: false,
  });

  const dragRef = useRef<DragState>({
    active: false,
    dock: null,
    collapsedDrag: false,
  });

  const solveHorizontal = useCallback(
    (l: number, r: number) => {
      const minC = centerMinWidth;
      const total = l + r;
      const available = 100 - minC;

      if (total <= available) {
        return {
          left: Math.max(l, leftMinSize),
          right: Math.max(r, rightMinSize),
        };
      }

      let overflow = total - available;
      let nl = l;
      let nr = r;

      while (overflow > 0.1) {
        const rl = nl - leftMinSize;
        const rr = nr - rightMinSize;
        if (rl <= 0 && rr <= 0) break;

        const totalRoom = rl + rr;
        if (totalRoom <= 0) break;

        const redL = Math.min((rl / totalRoom) * overflow, rl);
        const redR = Math.min((rr / totalRoom) * overflow, rr);

        nl -= redL;
        nr -= redR;
        overflow -= redL + redR;
      }

      return {
        left: Math.max(nl, leftMinSize),
        right: Math.max(nr, rightMinSize),
      };
    },
    [centerMinWidth, leftMinSize, rightMinSize],
  );

  const solveVertical = useCallback(
    (t: number, b: number) => {
      const minC = centerMinHeight;
      const total = t + b;
      const available = 100 - minC;

      if (total <= available) {
        return {
          top: Math.max(t, topMinSize),
          bottom: Math.max(b, bottomMinSize),
        };
      }

      let overflow = total - available;
      let nt = t;
      let nb = b;

      while (overflow > 0.1) {
        const rt = nt - topMinSize;
        const rb = nb - bottomMinSize;
        if (rt <= 0 && rb <= 0) break;

        const totalRoom = rt + rb;
        if (totalRoom <= 0) break;

        const redT = Math.min((rt / totalRoom) * overflow, rt);
        const redB = Math.min((rb / totalRoom) * overflow, rb);

        nt -= redT;
        nb -= redB;
        overflow -= redT + redB;
      }

      return {
        top: Math.max(nt, topMinSize),
        bottom: Math.max(nb, bottomMinSize),
      };
    },
    [centerMinHeight, topMinSize, bottomMinSize],
  );

  const [sizes, setSizes] = useState(() => {
    const solveHoriz = (l: number, r: number) => {
      const minC = centerMinWidth;
      const total = l + r;
      const available = 100 - minC;

      if (total <= available) {
        return {
          left: Math.max(l, leftMinSize),
          right: Math.max(r, rightMinSize),
        };
      }

      let overflow = total - available;
      let nl = l;
      let nr = r;

      while (overflow > 0.1) {
        const rl = nl - leftMinSize;
        const rr = nr - rightMinSize;
        if (rl <= 0 && rr <= 0) break;

        const totalRoom = rl + rr;
        if (totalRoom <= 0) break;

        const redL = Math.min((rl / totalRoom) * overflow, rl);
        const redR = Math.min((rr / totalRoom) * overflow, rr);

        nl -= redL;
        nr -= redR;
        overflow -= redL + redR;
      }

      return {
        left: Math.max(nl, leftMinSize),
        right: Math.max(nr, rightMinSize),
      };
    };

    const solveVert = (t: number, b: number) => {
      const minC = centerMinHeight;
      const total = t + b;
      const available = 100 - minC;

      if (total <= available) {
        return {
          top: Math.max(t, topMinSize),
          bottom: Math.max(b, bottomMinSize),
        };
      }

      let overflow = total - available;
      let nt = t;
      let nb = b;

      while (overflow > 0.1) {
        const rt = nt - topMinSize;
        const rb = nb - bottomMinSize;
        if (rt <= 0 && rb <= 0) break;

        const totalRoom = rt + rb;
        if (totalRoom <= 0) break;

        const redT = Math.min((rt / totalRoom) * overflow, rt);
        const redB = Math.min((rb / totalRoom) * overflow, rb);

        nt -= redT;
        nb -= redB;
        overflow -= redT + redB;
      }

      return {
        top: Math.max(nt, topMinSize),
        bottom: Math.max(nb, bottomMinSize),
      };
    };

    const horiz = solveHoriz(leftInitialSize, rightInitialSize);
    const vert = solveVert(topInitialSize, bottomInitialSize);

    return {
      left: horiz.left,
      right: horiz.right,
      top: vert.top,
      bottom: vert.bottom,
    };
  });

  const toggleCollapse = (side: DockSide) => {
    setCollapsed((c) => ({ ...c, [side]: !c[side] }));
  };

  const startDrag =
    (side: DockSide) => (e: ReactMouseEvent | ReactTouchEvent) => {
      dragRef.current = {
        active: true,
        dock: side,
        collapsedDrag: collapsed[side],
      };
      e.preventDefault();
      e.stopPropagation();
    };

  useEffect(() => {
    const moveListener = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current.active || !dragRef.current.dock) return;

      e.preventDefault();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pt = "touches" in e ? e.touches[0] : e;
      if (!pt) return;

      const x = pt.clientX - rect.left;
      const y = pt.clientY - rect.top;

      const xPercent = (x / rect.width) * 100;
      const yPercent = (y / rect.height) * 100;

      let { left, right, top, bottom } = sizes;
      const side = dragRef.current.dock;

      const collapseIfSmall = (dist: number, min: number, side: DockSide) => {
        if (dist <= min * 0.4) {
          dragRef.current.collapsedDrag = true;
          setCollapsed((c) => ({ ...c, [side]: true }));
        }
      };

      const expandIfLarge = (dist: number, min: number, side: DockSide) => {
        if (dragRef.current.collapsedDrag && dist > min) {
          dragRef.current.collapsedDrag = false;
          setCollapsed((c) => ({ ...c, [side]: false }));
        }
      };

      if (side === "left") {
        collapseIfSmall(xPercent, leftMinSize, "left");
        expandIfLarge(xPercent, leftMinSize, "left");
        if (!dragRef.current.collapsedDrag) left = xPercent;
      }

      if (side === "right") {
        const d = 100 - xPercent;
        collapseIfSmall(d, rightMinSize, "right");
        expandIfLarge(d, rightMinSize, "right");
        if (!dragRef.current.collapsedDrag) right = d;
      }

      if (side === "top") {
        collapseIfSmall(yPercent, topMinSize, "top");
        expandIfLarge(yPercent, topMinSize, "top");
        if (!dragRef.current.collapsedDrag) top = yPercent;
      }

      if (side === "bottom") {
        const d = 100 - yPercent;
        collapseIfSmall(d, bottomMinSize, "bottom");
        expandIfLarge(d, bottomMinSize, "bottom");
        if (!dragRef.current.collapsedDrag) bottom = d;
      }

      if (!dragRef.current.collapsedDrag) {
        const horiz = solveHorizontal(left, right);
        const vert = solveVertical(top, bottom);

        setSizes({
          left: horiz.left,
          right: horiz.right,
          top: vert.top,
          bottom: vert.bottom,
        });
      }
    };

    const endListener = () => {
      dragRef.current.active = false;
      dragRef.current.collapsedDrag = false;
    };

    window.addEventListener("mousemove", moveListener);
    window.addEventListener("mouseup", endListener);
    window.addEventListener("touchmove", moveListener, { passive: false });
    window.addEventListener("touchend", endListener);
    window.addEventListener("touchcancel", endListener);

    return () => {
      window.removeEventListener("mousemove", moveListener);
      window.removeEventListener("mouseup", endListener);
      window.removeEventListener("touchmove", moveListener);
      window.removeEventListener("touchend", endListener);
      window.removeEventListener("touchcancel", endListener);
    };
  }, [
    sizes,
    collapsed,
    leftMinSize,
    rightMinSize,
    topMinSize,
    bottomMinSize,
    solveHorizontal,
    solveVertical,
  ]);

  const Splitter = ({
    side,
    horizontal,
  }: {
    side: DockSide;
    horizontal: boolean;
  }) => {
    const cursor = horizontal ? "ns-resize" : "ew-resize";
    return (
      <div
        onMouseDown={startDrag(side)}
        onTouchStart={startDrag(side)}
        onDoubleClick={() => toggleCollapse(side)}
        className="relative flex items-center justify-center touch-none select-none"
        style={{
          width: horizontal ? "100%" : `${SPLITTER_SIZE}px`,
          height: horizontal ? `${SPLITTER_SIZE}px` : "100%",
          cursor,
          touchAction: "none",
        }}
      >
        <div
          className="absolute inset-0 bg-border transition-colors duration-150"
          style={{
            width: horizontal ? "100%" : `${SPLITTER_SIZE}px`,
            height: horizontal ? `${SPLITTER_SIZE}px` : "100%",
          }}
        />
        <div
          className="absolute hover:bg-border active:bg-border transition-colors duration-150"
          style={{
            width: horizontal ? "100%" : `${SPLITTER_HIT_AREA}px`,
            height: horizontal ? `${SPLITTER_HIT_AREA}px` : "100%",
            cursor,
            touchAction: "none",
          }}
        />
      </div>
    );
  };

  const panelClass = "h-full bg-background text-card-foreground overflow-auto";

  const showLeft = !collapsed.left;
  const showRight = !collapsed.right;
  const showTop = !collapsed.top;
  const showBottom = !collapsed.bottom;

  return (
    <div
      ref={containerRef}
      className={`h-full w-full min-h-0 overflow-hidden bg-background backdrop-blur ${className}`}
    >
      <div
        className="grid h-full min-h-0 w-full"
        style={{
          gridTemplateColumns: `
            ${showLeft ? `${sizes.left}fr` : "0px"}
            ${SPLITTER_SIZE}px
            ${100 - (showLeft ? sizes.left : 0) - (showRight ? sizes.right : 0)}fr
            ${SPLITTER_SIZE}px
            ${showRight ? `${sizes.right}fr` : "0px"}
          `,
        }}
      >
        <div className="h-full min-h-0 w-full overflow-hidden">
          {showLeft && left && <div className={panelClass}>{left}</div>}
        </div>

        <Splitter side="left" horizontal={false} />

        <div className="h-full min-h-0 w-full overflow-hidden">
          <div
            className="grid h-full min-h-0 w-full"
            style={{
              gridTemplateRows: `
                ${showTop ? `${sizes.top}fr` : "0px"}
                ${SPLITTER_SIZE}px
                ${100 - (showTop ? sizes.top : 0) - (showBottom ? sizes.bottom : 0)}fr
                ${SPLITTER_SIZE}px
                ${showBottom ? `${sizes.bottom}fr` : "0px"}
              `,
            }}
          >
            <div className="h-full min-h-0 w-full overflow-hidden">
              {showTop && top && <div className={panelClass}>{top}</div>}
            </div>

            <Splitter side="top" horizontal />

            <div className="h-full min-h-0 w-full overflow-hidden">
              <div className={`${panelClass} h-full overflow-auto`}>
                {center}
              </div>
            </div>

            <Splitter side="bottom" horizontal />

            <div className="h-full min-h-0 w-full overflow-hidden">
              {showBottom && bottom && (
                <div className={panelClass}>{bottom}</div>
              )}
            </div>
          </div>
        </div>

        <Splitter side="right" horizontal={false} />

        <div className="h-full min-h-0 w-full overflow-hidden">
          {showRight && right && <div className={panelClass}>{right}</div>}
        </div>
      </div>
    </div>
  );
}

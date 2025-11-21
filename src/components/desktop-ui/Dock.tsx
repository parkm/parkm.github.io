import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

const SPLITTER_SIZE = 4;

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

export function QuadDock({
  left,
  right,
  top,
  bottom,
  center,
  leftInitialSize = 260,
  rightInitialSize = 260,
  topInitialSize = 180,
  bottomInitialSize = 180,
  leftMinSize = 140,
  rightMinSize = 140,
  topMinSize = 120,
  bottomMinSize = 120,
  centerMinWidth = 360,
  centerMinHeight = 260,
  className = "",
}: QuadDockProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [sizes, setSizes] = useState({
    left: leftInitialSize,
    right: rightInitialSize,
    top: topInitialSize,
    bottom: bottomInitialSize,
  });

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
    (l: number, r: number, width: number) => {
      const minC = centerMinWidth + SPLITTER_SIZE * 2;
      const required = l + r + minC;

      if (required <= width) {
        return {
          left: Math.max(l, leftMinSize),
          right: Math.max(r, rightMinSize),
        };
      }

      let overflow = required - width;
      let nl = l;
      let nr = r;

      while (overflow > 0) {
        const rl = nl - leftMinSize;
        const rr = nr - rightMinSize;
        if (rl <= 0 && rr <= 0) break;

        const total = rl + rr;
        if (total <= 0) break;

        const redL = Math.min((rl / total) * overflow, rl);
        const redR = Math.min((rr / total) * overflow, rr);

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
    (t: number, b: number, height: number) => {
      const minC = centerMinHeight + SPLITTER_SIZE * 2;
      const required = t + b + minC;

      if (required <= height) {
        return {
          top: Math.max(t, topMinSize),
          bottom: Math.max(b, bottomMinSize),
        };
      }

      let overflow = required - height;
      let nt = t;
      let nb = b;

      while (overflow > 0) {
        const rt = nt - topMinSize;
        const rb = nb - bottomMinSize;
        if (rt <= 0 && rb <= 0) break;

        const total = rt + rb;
        if (total <= 0) break;

        const redT = Math.min((rt / total) * overflow, rt);
        const redB = Math.min((rb / total) * overflow, rb);

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
    };

  useEffect(() => {
    const moveListener = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current.active || !dragRef.current.dock) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pt = "touches" in e ? e.touches[0] : e;
      const x = pt.clientX - rect.left;
      const y = pt.clientY - rect.top;

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
        collapseIfSmall(x, leftMinSize, "left");
        expandIfLarge(x, leftMinSize, "left");
        if (!dragRef.current.collapsedDrag) left = x;
      }

      if (side === "right") {
        const d = rect.width - x;
        collapseIfSmall(d, rightMinSize, "right");
        expandIfLarge(d, rightMinSize, "right");
        if (!dragRef.current.collapsedDrag) right = d;
      }

      if (side === "top") {
        collapseIfSmall(y, topMinSize, "top");
        expandIfLarge(y, topMinSize, "top");
        if (!dragRef.current.collapsedDrag) top = y;
      }

      if (side === "bottom") {
        const d = rect.height - y;
        collapseIfSmall(d, bottomMinSize, "bottom");
        expandIfLarge(d, bottomMinSize, "bottom");
        if (!dragRef.current.collapsedDrag) bottom = d;
      }

      if (!dragRef.current.collapsedDrag) {
        const horiz = solveHorizontal(left, right, rect.width);
        const vert = solveVertical(top, bottom, rect.height);

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

    return () => {
      window.removeEventListener("mousemove", moveListener);
      window.removeEventListener("mouseup", endListener);
      window.removeEventListener("touchmove", moveListener);
      window.removeEventListener("touchend", endListener);
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
        className={`
          ${horizontal ? `h-[${SPLITTER_SIZE}px]` : `w-[${SPLITTER_SIZE}px]`}
          bg-border backdrop-blur flex items-center justify-center
          transition-all duration-200 ease-out
          hover:bg-border/70 hover:brightness-110
        `}
        style={{ cursor }}
      >
        <div
          className={`flex ${horizontal ? "flex-row" : "flex-col"} gap-[2px] transition-opacity duration-200`}
        >
          <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full" />
          <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full" />
          <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full" />
        </div>
      </div>
    );
  };

  const panelClass =
    "h-full bg-card text-card-foreground backdrop-blur shadow-inner";

  const showLeft = !collapsed.left;
  const showRight = !collapsed.right;
  const showTop = !collapsed.top;
  const showBottom = !collapsed.bottom;

  return (
    <div
      ref={containerRef}
      className={`h-full w-full overflow-hidden bg-background backdrop-blur ${className}`}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `
            ${showLeft ? sizes.left + "px" : "0px"}
            ${SPLITTER_SIZE}px
            1fr
            ${SPLITTER_SIZE}px
            ${showRight ? sizes.right + "px" : "0px"}
          `,
        }}
      >
        <div className="h-full">
          {showLeft && left && <div className={panelClass}>{left}</div>}
        </div>

        <Splitter side="left" horizontal={false} />

        <div className="h-full">
          <div
            className="grid h-full"
            style={{
              gridTemplateRows: `
                ${showTop ? sizes.top + "px" : "0px"}
                ${SPLITTER_SIZE}px
                1fr
                ${SPLITTER_SIZE}px
                ${showBottom ? sizes.bottom + "px" : "0px"}
              `,
            }}
          >
            <div className="h-full">
              {showTop && top && <div className={panelClass}>{top}</div>}
            </div>

            <Splitter side="top" horizontal />

            <div className="h-full overflow-hidden">
              <div className={`${panelClass} h-full overflow-auto`}>
                {center}
              </div>
            </div>

            <Splitter side="bottom" horizontal />

            <div className="h-full">
              {showBottom && bottom && (
                <div className={panelClass}>{bottom}</div>
              )}
            </div>
          </div>
        </div>

        <Splitter side="right" horizontal={false} />

        <div className="h-full">
          {showRight && right && <div className={panelClass}>{right}</div>}
        </div>
      </div>
    </div>
  );
}

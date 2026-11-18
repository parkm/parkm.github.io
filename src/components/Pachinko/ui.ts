import { BOARDS } from "./boards";
import { type Progress, levelInfo, pointsFree } from "./progress";
import {
  TALENTS,
  TALENT_BY_ID,
  TIERS,
  TREES,
  type TalentId,
  canUnlearn,
  lockReason,
  rankOf,
  spentIn,
} from "./talents";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void) {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** The single modal used for talents, the board list and results. */
export class Overlay {
  open = false;
  private onEscape: (() => void) | null = null;

  constructor(
    private root: HTMLElement,
    private panel: HTMLElement,
    private onToggle: (open: boolean) => void,
  ) {
    root.addEventListener("pointerdown", (e) => {
      if (e.target === root) this.onEscape?.();
    });
  }

  /** `onDismiss` runs for Esc, the close button and backdrop clicks; omit it to make the panel modal. */
  show(title: string, body: HTMLElement, onDismiss: (() => void) | null) {
    const head = el("div", "pk-panel-head");
    head.append(el("h2", "", title));
    if (onDismiss) {
      const close = button("✕", "pk-icon-btn", onDismiss);
      close.setAttribute("aria-label", "Close");
      head.append(close);
    }
    this.panel.replaceChildren(head, body);
    this.onEscape = onDismiss;
    this.root.hidden = false;
    if (!this.open) {
      this.open = true;
      this.onToggle(true);
    }
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.panel.replaceChildren();
    this.onToggle(false);
  }

  escape() {
    this.onEscape?.();
  }
}

// ---- talents ----------------------------------------------------------------

const NODE = 42;
const PITCH_X = 50;
const PITCH_Y = 62;

export type TalentApi = {
  progress: () => Progress;
  learn: (id: TalentId) => void;
  unlearn: (id: TalentId) => void;
  reset: () => void;
};

export function talentPanel(api: TalentApi): HTMLElement {
  const body = el("div", "pk-talents");
  let selected: TalentId = "longSight";
  let preview: TalentId | null = null;

  const nodeX = (col: number) => col * PITCH_X;
  const nodeY = (tier: number) => tier * PITCH_Y;

  function render() {
    const progress = api.progress();
    const { ranks } = progress;
    const free = pointsFree(progress);
    const { level } = levelInfo(progress.xp);

    const head = el("div", "pk-talent-head");
    const summary = el("div");
    summary.append(
      `Level ${level} · `,
      el("b", free > 0 ? "pk-gold" : "", String(free)),
      ` point${free === 1 ? "" : "s"} to spend`,
    );
    head.append(
      summary,
      button("Reset", "pk-btn pk-btn-quiet", () => {
        api.reset();
        render();
      }),
    );

    const trees = el("div", "pk-trees");
    TREES.forEach((name, tree) => {
      const section = el("section", "pk-tree");
      const title = el("h3");
      title.append(name, el("span", "", String(spentIn(ranks, tree))));
      const grid = el("div", "pk-tree-grid");
      grid.style.width = `${PITCH_X + NODE}px`;
      grid.style.height = `${(TIERS - 1) * PITCH_Y + NODE}px`;

      for (const t of TALENTS.filter((t) => t.tree === tree)) {
        const rank = rankOf(ranks, t.id);
        const reason = lockReason(ranks, t.id);
        const state =
          rank >= t.max
            ? "max"
            : reason
              ? rank > 0
                ? "learned"
                : "locked"
              : free > 0
                ? "open"
                : rank > 0
                  ? "learned"
                  : "idle";

        if (t.requires) {
          const req = TALENT_BY_ID[t.requires];
          const arrow = el("div", "pk-arrow");
          arrow.dataset.met = String(rankOf(ranks, req.id) >= req.max);
          arrow.style.left = `${nodeX(t.col) + NODE / 2 - 1.5}px`;
          arrow.style.top = `${nodeY(req.tier) + NODE}px`;
          arrow.style.height = `${nodeY(t.tier) - nodeY(req.tier) - NODE - 5}px`;
          grid.append(arrow);
        }

        const node = el("button", "pk-node");
        node.type = "button";
        node.dataset.state = state;
        if (t.id === selected) node.dataset.selected = "true";
        node.style.left = `${nodeX(t.col)}px`;
        node.style.top = `${nodeY(t.tier)}px`;
        node.setAttribute("aria-label", `${t.name}, rank ${rank} of ${t.max}`);
        node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>`;
        node.append(el("span", "pk-rank", `${rank}/${t.max}`));
        node.addEventListener("click", () => {
          selected = t.id;
          api.learn(t.id);
          render();
        });
        node.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          selected = t.id;
          api.unlearn(t.id);
          render();
        });
        // Hovering only previews a talent. The selection (and so the +/-
        // buttons) stays put until a click, so the mouse can cross other
        // talents on its way to the buttons.
        node.addEventListener("pointerenter", (e) => {
          if (e.pointerType !== "mouse") return;
          preview = t.id;
          renderTip();
        });
        node.addEventListener("pointerleave", () => {
          if (preview !== t.id) return;
          preview = null;
          renderTip();
        });
        grid.append(node);
      }
      section.append(title, grid);
      trees.append(section);
    });

    body.replaceChildren(head, trees, el("div", "pk-tip"));
    renderTip();
  }

  function renderTip() {
    const tip = body.querySelector<HTMLElement>(".pk-tip");
    if (!tip) return;
    const progress = api.progress();
    const { ranks } = progress;
    const t = TALENT_BY_ID[preview ?? selected];
    const rank = rankOf(ranks, t.id);
    const reason = lockReason(ranks, t.id);
    const free = pointsFree(progress);
    const target = TALENT_BY_ID[selected];

    const text = el("div", "pk-tip-text");
    const title = el("div", "pk-tip-title");
    title.append(t.name, el("span", "", `Rank ${rank}/${t.max}`));
    text.append(title);
    if (rank > 0) text.append(el("p", "", t.describe(rank)));
    if (rank < t.max) {
      const next = el("p", rank > 0 ? "pk-dim" : "");
      next.textContent = `${rank > 0 ? "Next rank: " : ""}${t.describe(rank + 1)}`;
      text.append(next);
      if (reason) text.append(el("p", "pk-warn", reason));
    }

    const actions = el("div", "pk-tip-actions");
    const minus = button("−", "pk-btn", () => {
      api.unlearn(target.id);
      render();
    });
    minus.setAttribute("aria-label", `Remove a point from ${target.name}`);
    minus.disabled = !canUnlearn(ranks, target.id);
    const plus = button("+", "pk-btn pk-btn-main", () => {
      api.learn(target.id);
      render();
    });
    plus.setAttribute("aria-label", `Add a point to ${target.name}`);
    plus.disabled = !!lockReason(ranks, target.id) || free <= 0;
    actions.append(minus, plus);

    tip.replaceChildren(text, actions);
  }

  render();
  return body;
}

// ---- boards and results -----------------------------------------------------

export function boardPanel(
  progress: Progress,
  current: number,
  onPick: (index: number) => void,
  onReset: () => void,
): HTMLElement {
  const list = el("div", "pk-boards");
  BOARDS.forEach((board, i) => {
    const locked = i >= progress.unlocked;
    const row = button("", "pk-board-row", () => onPick(i));
    row.disabled = locked;
    if (i === current) row.dataset.current = "true";
    const best = progress.best[i];
    row.append(
      el("span", "pk-board-num", String(i + 1)),
      el("span", "pk-board-name", board.name),
      el(
        "span",
        "pk-dim",
        locked ? "Locked" : best ? best.toLocaleString() : "Not cleared",
      ),
    );
    list.append(row);
  });

  // Destructive, so it takes a second, explicit click.
  const footer = el("div", "pk-boards-footer");
  const ask = () =>
    footer.replaceChildren(
      button("Reset progress", "pk-btn pk-btn-quiet", () => {
        const cancel = button("Keep it", "pk-btn", ask);
        footer.replaceChildren(
          el(
            "p",
            "pk-warn",
            "Erase your level, talents, unlocked boards and best scores?",
          ),
          cancel,
          button("Erase everything", "pk-btn pk-btn-danger", onReset),
        );
        cancel.focus();
      }),
    );
  ask();
  list.append(footer);
  return list;
}

export type Results = {
  won: boolean;
  score: number;
  ballBonus: number;
  best: number;
  newBest: boolean;
  levelsGained: number;
  level: number;
  hasNext: boolean;
};

export function resultsPanel(
  r: Results,
  actions: { retry: () => void; next: () => void; talents: () => void },
): HTMLElement {
  const body = el("div", "pk-results");
  body.append(el("div", "pk-results-score", r.score.toLocaleString()));

  const rows = el("dl", "pk-results-rows");
  const row = (label: string, value: string) =>
    rows.append(el("dt", "", label), el("dd", "", value));
  if (r.ballBonus) row("Unused balls", `+${r.ballBonus.toLocaleString()}`);
  if (r.best)
    row("Best", `${r.best.toLocaleString()}${r.newBest ? " (new)" : ""}`);
  row("Level", String(r.level));
  body.append(rows);

  if (r.levelsGained > 0)
    body.append(
      el(
        "p",
        "pk-gold",
        `Level up. ${r.levelsGained} talent point${r.levelsGained > 1 ? "s" : ""} to spend.`,
      ),
    );

  const buttons = el("div", "pk-results-actions");
  if (r.levelsGained > 0)
    buttons.append(button("Talents", "pk-btn", actions.talents));
  buttons.append(
    button(r.won ? "Play again" : "Retry", "pk-btn", actions.retry),
  );
  if (r.won && r.hasNext)
    buttons.append(button("Next board", "pk-btn pk-btn-main", actions.next));
  body.append(buttons);
  return body;
}

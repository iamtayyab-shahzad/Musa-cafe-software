/** Shared helpers for POS cashier keyboard mode. */

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type || "text";
    return ![
      "button",
      "checkbox",
      "radio",
      "submit",
      "reset",
      "file",
      "image",
      "range",
      "color",
    ].includes(type);
  }
  return false;
}

export function isDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-pos-dialog-open="true"]',
    ),
  );
}

/** Move index on a CSS grid by arrow keys. */
export function moveGridIndex(
  index: number,
  key: string,
  total: number,
  cols: number,
): number {
  if (total <= 0) return -1;
  if (index < 0) return 0;
  const safeCols = Math.max(1, cols);
  let next = index;
  if (key === "ArrowRight") next = Math.min(total - 1, next + 1);
  else if (key === "ArrowLeft") next = Math.max(0, next - 1);
  else if (key === "ArrowDown") next = Math.min(total - 1, next + safeCols);
  else if (key === "ArrowUp") next = Math.max(0, next - safeCols);
  return next;
}

export function countGridColumns(el: HTMLElement | null): number {
  if (!el) return 2;
  const style = getComputedStyle(el);
  const parts = style.gridTemplateColumns.split(" ").filter(Boolean);
  return Math.max(1, parts.length || 2);
}

/**
 * After arrow-key navigation, scrolling moves tiles under a stationary mouse
 * and fires mouseenter — which would steal the highlight. Only allow hover
 * selection after the pointer actually moves.
 */
export function createHoverSelectGate() {
  let mode: "keyboard" | "mouse" = "mouse";
  let lastX = Number.NaN;
  let lastY = Number.NaN;

  return {
    markKeyboard() {
      mode = "keyboard";
    },
    onPointerMove(clientX: number, clientY: number) {
      if (
        Number.isFinite(lastX) &&
        (Math.abs(clientX - lastX) > 2 || Math.abs(clientY - lastY) > 2)
      ) {
        mode = "mouse";
      }
      lastX = clientX;
      lastY = clientY;
    },
    allowHover() {
      return mode === "mouse";
    },
  };
}

/** Scroll `el` inside `scroller` so it is fully visible (no scrollIntoView). */
export function scrollChildIntoScroller(
  scroller: HTMLElement,
  el: HTMLElement,
  pad = 12,
) {
  const elRect = el.getBoundingClientRect();
  const scRect = scroller.getBoundingClientRect();
  if (elRect.top < scRect.top + pad) {
    scroller.scrollTop -= scRect.top + pad - elRect.top;
  } else if (elRect.bottom > scRect.bottom - pad) {
    scroller.scrollTop += elRect.bottom - (scRect.bottom - pad);
  }
}

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

function applyWindowScroll(scrollX: number, scrollY: number) {
  window.scrollTo(scrollX, scrollY);
  const root = document.scrollingElement ?? document.documentElement;
  root.scrollLeft = scrollX;
  root.scrollTop = scrollY;
  if (document.body) {
    document.body.scrollLeft = scrollX;
    document.body.scrollTop = scrollY;
  }
}

/** Run after Solid flushes reactive DOM so scroll anchors aren't reset on the next paint. */
export function restoreWindowScrollAfterPaint(scrollX: number, scrollY: number): void {
  const restore = () => applyWindowScroll(scrollX, scrollY);
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
        setTimeout(restore, 0);
      });
    });
  });
}

/** Restore `scrollTop` on element after list-rebuild paint (Solid `batch` + reconcile). */
export function restoreElementScrollAfterPaint(scrollTop: number, getEl: () => HTMLElement | undefined): void {
  const restore = () => {
    const el = getEl();
    if (el) el.scrollTop = scrollTop;
  };
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
        setTimeout(restore, 0);
      });
    });
  });
}

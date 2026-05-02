/** Reorder list after removing `fromIdx`, then inserting at visual slot index (same rules as Solid HTML5 drops). */
export function reorderDraggableIds(ids: readonly string[], fromIdx: number, slotBeforeRemoval: number): string[] {
  const arr = [...ids];
  const [moved] = arr.splice(fromIdx, 1);
  if (!moved) return [...ids];
  const slot = Math.max(0, Math.min(slotBeforeRemoval, arr.length));
  arr.splice(slot, 0, moved);
  return arr;
}

export function dropSlotFromPointer(clientY: number, listRoot: HTMLElement | undefined): number {
  if (!listRoot) return 0;
  const els = [...listRoot.querySelectorAll("[data-task-card]")] as HTMLElement[];
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (clientY < mid) return i;
  }
  return els.length;
}

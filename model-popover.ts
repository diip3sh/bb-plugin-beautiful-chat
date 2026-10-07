// Closing BB's model popover with a click outside made the prompt box collapse and
// re-expand: the click moved focus to the page, so BB collapsed the composer
// (89 → 65px), then the popover handed focus back to the model button inside it and
// BB expanded it again. While the popover is open, an outside mousedown doesn't move
// focus; the popover still closes on that press (Radix listens to pointerdown), and
// links, buttons and fields keep their normal click and focus.
const POPOVER = '[data-radix-popper-content-wrapper] > [role="dialog"]:has([aria-label="Search models"])';
const KEEPS_FOCUS = 'input, textarea, select, [contenteditable="true"]';

export function mountModelPopoverFocus(): () => void {
  const onMouseDown = (event: MouseEvent) => {
    const popover = document.querySelector(POPOVER);
    const target = event.target as Element | null;
    if (!popover || !target || popover.contains(target) || target.closest(KEEPS_FOCUS)) return;
    event.preventDefault();
  };
  document.addEventListener("mousedown", onMouseDown, true);
  return () => document.removeEventListener("mousedown", onMouseDown, true);
}

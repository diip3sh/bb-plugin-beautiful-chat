// Tray composer (composer: tray). app.css turns the stack above the prompt box into a
// tray fused onto the card; this adds what CSS can't do on its own:
//  - the SVG goo filter the tray melts out of the card through (app.css applies it
//    only while the tray is rising, so typing never pays for the blur),
//  - `data-bui-tray-initial` on a stack whose items arrive with the composer, so
//    opening a thread shows the tray in place instead of animating it, like
//    AnimatePresence's initial={false}. BB loads the git/PR context a moment after
//    the composer mounts, so "with the composer" means within SETTLE_MS of it.
//    A tray that appears later (a background command starts) animates,
//  - the changed-files summary as a static label on the tray's right: app.css hides
//    BB's "Uncommitted · 61 files · +4,730 -157" text except the counts, and draws
//    the file count from `data-bui-files`, read from the toggle's aria-label. The
//    toggle leaves the tab order, since it no longer opens anything. When the
//    summary is all the tray holds, the stack gets `data-bui-git-only` and the
//    label spans the row with BB's word for the state ("Uncommitted") on the left,
//    from `data-bui-git-state`. A context card holding only the summary (and
//    worktrees' merge-base picker, which app.css hides) gets `data-bui-git-alone`
//    so it can dissolve, and
//  - `data-bui-tray-card` on the follow-up composer anchor, so app.css can lift the
//    card over the tray without naming BB's footer/anchor hooks (app-css.test.ts
//    keeps those out of the stylesheet so BB's phone footer stays in charge), and
//  - queued-row tooltips only when the row is cut off: BB titles every row with its
//    full text, so the browser otherwise repeats what is already on screen.
const SVG_NS = "http://www.w3.org/2000/svg";
const STACKS = "[data-app-composer] > div.grid";
const INITIAL = "data-bui-tray-initial";
const ITEMS = "data-bui-tray-items";
const SETTLE_MS = 1500;
const GIT_TOGGLE = "#thread-prompt-banner-git-toggle";
const FILES = "data-bui-files";
const STATE = "data-bui-git-state";
const GIT_ONLY = "data-bui-git-only";
const CONTEXT = 'section[aria-label="Thread context before sending"]';
const GIT_ALONE = "data-bui-git-alone";
const MERGE_BASE = ':has(> svg[data-icon="GitMerge"])';
const QUEUED_ROW = "[data-queued-message-row]";
const HELD_TITLE = "data-bui-title";
const ANCHOR = "[data-follow-up-composer-anchor]";
const CARD = "data-bui-tray-card";

function gooFilter(): SVGSVGElement {
  // Blur the alpha, re-threshold it so the tray and card fuse, then draw the crisp
  // source back on top. Same values as the follow-up prompt component.
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("style", "position:absolute;width:0;height:0");
  svg.innerHTML = `<filter id="bui-goo" color-interpolation-filters="sRGB" x="-20%" y="-100%" width="140%" height="300%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="10"/>
    <feColorMatrix result="goo" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9"/>
    <feBlend in="SourceGraphic" in2="goo"/>
  </filter>`;
  return svg;
}

export function mountComposerTray(): () => void {
  const svg = gooFilter();
  document.body.append(svg);
  const born = new WeakMap<Element, number>();
  // Cards sit directly in the stack or one level down in BB's group wrapper.
  const hasItems = (stack: Element) => stack.querySelector(":scope > section, :scope > div > section") !== null;
  // MutationObserver callbacks run before the next style pass, so the marker is in
  // place before the tray's animation could start.
  const scan = () => {
    const now = performance.now();
    document.querySelectorAll(STACKS).forEach((stack) => {
      if (!born.has(stack)) born.set(stack, now);
      const items = hasItems(stack);
      if (items) stack.setAttribute(ITEMS, "");
      else stack.removeAttribute(ITEMS);
      // Nothing but the changed-files summary: every card is a context card whose
      // header holds the toggle and at most the hidden merge-base picker.
      const sections = Array.from(stack.querySelectorAll(":scope > section, :scope > div > section"));
      sections.forEach((section) => {
        const header = section.matches(CONTEXT) ? section.firstElementChild : null;
        const kids = header ? Array.from(header.children) : [];
        const alone = kids.some((kid) => kid.matches(GIT_TOGGLE)) && kids.every((kid) => kid.matches(GIT_TOGGLE) || kid.matches(MERGE_BASE));
        if (alone) section.setAttribute(GIT_ALONE, "");
        else section.removeAttribute(GIT_ALONE);
      });
      const gitOnly = sections.length > 0 && sections.every((section) => section.hasAttribute(GIT_ALONE));
      if (gitOnly) stack.setAttribute(GIT_ONLY, "");
      else stack.removeAttribute(GIT_ONLY);
      if (!items) stack.removeAttribute(INITIAL);
      else if (now - (born.get(stack) ?? now) < SETTLE_MS) stack.setAttribute(INITIAL, "");
    });
    document.querySelectorAll(ANCHOR).forEach((anchor) => {
      if (!anchor.hasAttribute(CARD)) anchor.setAttribute(CARD, "");
    });
    document.querySelectorAll<HTMLElement>(GIT_TOGGLE).forEach((toggle) => {
      toggle.tabIndex = -1;
      const label = toggle.getAttribute("aria-label") ?? "";  // "Changed files: Uncommitted, 1 file, +25 -0"
      toggle.setAttribute(STATE, label.replace(/^[^:]*:\s*/, "").split(",")[0] ?? "");
      const files = label.match(/\d[\d,]* files?/)?.[0] ?? "";
      toggle.querySelector(":scope > span")?.setAttribute(FILES, files);
    });
  };
  scan();
  const observer = new MutationObserver(scan);
  // aria-label too: BB updates the counts in place when files change.
  observer.observe(document.body, { childList: true, subtree: true, attributeFilter: ["aria-label"] });
  // Decided on hover, before the browser's tooltip delay runs out; the title is
  // parked in HELD_TITLE while the text fits. If BB changes the text it sets a
  // fresh title, which the next hover judges again.
  const onPointerOver = (event: PointerEvent) => {
    const row = (event.target as Element | null)?.closest?.(QUEUED_ROW);
    row?.querySelectorAll(`[title], [${HELD_TITLE}]`).forEach((el) => {
      const text = el.matches(".truncate") ? el : el.querySelector(".truncate");
      const title = el.getAttribute("title") ?? el.getAttribute(HELD_TITLE) ?? "";
      const cut = text !== null && text.scrollWidth > text.clientWidth;
      el.setAttribute(cut ? "title" : HELD_TITLE, title);
      el.removeAttribute(cut ? HELD_TITLE : "title");
    });
  };
  document.addEventListener("pointerover", onPointerOver, true);
  return () => {
    observer.disconnect();
    document.removeEventListener("pointerover", onPointerOver, true);
    svg.remove();
    document.querySelectorAll(`[${INITIAL}]`).forEach((stack) => stack.removeAttribute(INITIAL));
    document.querySelectorAll(`[${ITEMS}]`).forEach((stack) => stack.removeAttribute(ITEMS));
    document.querySelectorAll(`[${CARD}]`).forEach((anchor) => anchor.removeAttribute(CARD));
    document.querySelectorAll(`[${FILES}]`).forEach((label) => label.removeAttribute(FILES));
    document.querySelectorAll(GIT_TOGGLE).forEach((toggle) => {
      toggle.removeAttribute("tabindex");
      toggle.removeAttribute(STATE);
    });
    document.querySelectorAll(`[${GIT_ONLY}]`).forEach((stack) => stack.removeAttribute(GIT_ONLY));
    document.querySelectorAll(`[${GIT_ALONE}]`).forEach((section) => section.removeAttribute(GIT_ALONE));
    document.querySelectorAll(`[${HELD_TITLE}]`).forEach((el) => {
      el.setAttribute("title", el.getAttribute(HELD_TITLE) ?? "");
      el.removeAttribute(HELD_TITLE);
    });
  };
}

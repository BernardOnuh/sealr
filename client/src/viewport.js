// Keeps the app exactly as tall as the screen, and only as tall as the area above the keyboard while typing
// (iOS does not resize the page for the keyboard). Outside typing we use the full layout height, because in a
// home-screen app iOS reports a visual viewport that leaves out the status bar, which left a gap at the bottom.
export function trackViewport() {
  const vv = window.visualViewport;
  const typing = () => {
    const el = document.activeElement;
    return !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "file"].includes(el.type)) || el.isContentEditable);
  };
  const set = () => {
    const full = Math.max(window.innerHeight, document.documentElement.clientHeight);
    const h = vv && typing() && vv.height < full - 80 ? vv.height : full;
    document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
    if (vv && typing() && vv.offsetTop) scrollTo(0, 0);
  };
  set();
  addEventListener("resize", set);
  vv?.addEventListener("resize", set);
  vv?.addEventListener("scroll", set);
  addEventListener("focusin", () => setTimeout(set, 50));
  addEventListener("focusout", () => setTimeout(set, 50));
  addEventListener("orientationchange", () => setTimeout(set, 300));
}

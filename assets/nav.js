/**
 * Client-side navigation, as progressive enhancement.
 *
 * The sky is a fixed canvas outside the sheet. Reloading the document restarts
 * it, which reads as a flash of bare paper between pages. Swapping only
 * <main> keeps the same canvas running, so the sky carries across internal
 * links without a repaint. Every link is a real link: without this file, or
 * when a fetch fails, the browser navigates normally.
 *
 * The swap is intentionally narrow. Head, styles, header, footer and scripts
 * all stay put; only the page body, the title and the history entry change.
 */

const sheet = document.querySelector("main");
const viewTransitions = typeof document.startViewTransition === "function";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let controller = null;

function isPageLink(link, event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  if (link.target && link.target !== "_self") return false;
  if (link.hasAttribute("download")) return false;

  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return false;
  if (url.pathname.startsWith("/assets/")) return false;
  if (url.pathname === location.pathname && url.search === location.search) return false;
  // A path that is not a page keeps its ordinary download/open behaviour.
  // Routes are either "/" or end in a slash.
  if (url.pathname !== "/" && !url.pathname.endsWith("/")) return false;

  return true;
}

function focusMain() {
  sheet.setAttribute("tabindex", "-1");
  sheet.focus({ preventScroll: true });
}

async function navigate(url, { push = true, scrollY = 0 } = {}) {
  controller?.abort();
  const request = new AbortController();
  controller = request;

  try {
    const response = await fetch(url, {
      signal: request.signal,
      headers: { Accept: "text/html" },
    });
    if (!response.ok) throw new Error(`navigation failed: ${response.status}`);

    const html = await response.text();
    const nextDocument = new DOMParser().parseFromString(html, "text/html");
    const next = nextDocument.querySelector("main");
    if (!next) throw new Error("navigation failed: no main element");

    const swap = () => {
      document.title = nextDocument.title;
      sheet.innerHTML = next.innerHTML;
      focusMain();
    };

    if (push) history.pushState({ scrollY }, "", url);

    if (viewTransitions && !reducedMotion.matches) {
      await document.startViewTransition(swap).finished;
    } else {
      swap();
    }

    window.scrollTo(0, scrollY);
  } catch (error) {
    if (error.name !== "AbortError") location.href = url;
  } finally {
    if (controller === request) controller = null;
  }
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented) return;
  const link = event.target.closest?.("a[href]");
  if (!link || !isPageLink(link, event)) return;

  event.preventDefault();
  navigate(link.href);
});

window.addEventListener("popstate", (event) => {
  navigate(location.href, { push: false, scrollY: event.state?.scrollY ?? 0 });
});

// Remember where the reader was so Back can return them there.
history.replaceState({ scrollY: window.scrollY }, "");

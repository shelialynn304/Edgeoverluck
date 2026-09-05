// App-shell chrome for the scanner page: keeps the step indicator and bottom
// tab bar in sync with the tool's panel visibility. Purely additive — the
// scanner logic in js/app.js owns showing/hiding panels via the .hidden
// class; this script only observes those changes, so the two never couple.
(function () {
  const PANELS = ["upload-panel", "review-panel", "results-panel", "exotics-panel"];

  const steps = Array.from(document.querySelectorAll(".app-step"));
  const tabs = Array.from(document.querySelectorAll(".app-tab"));
  if (steps.length === 0 && tabs.length === 0) return;

  const panelEl = (id) => document.getElementById(id);
  const isVisible = (id) => {
    const el = panelEl(id);
    return Boolean(el) && !el.classList.contains("hidden");
  };

  function syncChrome() {
    // Current step = last visible panel in flow order; earlier ones are done.
    let currentIdx = 0;
    PANELS.forEach((id, i) => {
      if (isVisible(id)) currentIdx = i;
    });

    steps.forEach((step) => {
      const idx = PANELS.indexOf(step.dataset.stepFor);
      step.classList.toggle("is-current", idx === currentIdx);
      step.classList.toggle("is-done", idx < currentIdx);
      step.classList.toggle("is-upcoming", idx > currentIdx);
    });

    tabs.forEach((tab) => {
      tab.disabled = !isVisible(tab.dataset.target);
    });
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const el = panelEl(tab.dataset.target);
      if (!el || el.classList.contains("hidden")) return;
      el.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    });
  });

  // Highlight the tab for whichever section is on screen.
  if ("IntersectionObserver" in window) {
    const watched = PANELS.filter((id) => tabs.some((t) => t.dataset.target === id));
    const io = new IntersectionObserver(
      (entries) => {
        const onScreen = entries.filter((e) => e.isIntersecting);
        if (onScreen.length === 0) return;
        const top = onScreen.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        tabs.forEach((tab) => {
          tab.classList.toggle("is-active", tab.dataset.target === top.target.id);
        });
      },
      { rootMargin: "-30% 0px -40% 0px", threshold: [0, 0.25, 0.5] },
    );
    watched.forEach((id) => {
      const el = panelEl(id);
      if (el) io.observe(el);
    });
  }

  // React whenever app.js toggles a panel's .hidden class.
  const mo = new MutationObserver(syncChrome);
  PANELS.forEach((id) => {
    const el = panelEl(id);
    if (el) mo.observe(el, { attributes: true, attributeFilter: ["class"] });
  });

  syncChrome();
})();

import { useEffect, useRef, useState } from "react";

/** Reveal element when it enters viewport (one-shot). */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("is-visible");
            obs.disconnect();
          }
        });
      },
      { threshold, rootMargin: "0px 0px -10% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

/** Track whether window has scrolled past threshold. */
export function useScrolled(threshold = 200) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/** Lenis smooth scroll bootstrap. */
export function useLenisScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const mod = await import("lenis");
      if (cancelled) return;
      const Lenis = mod.default;
      lenis = new Lenis({ duration: 1.1, easing: (t: number) => 1 - Math.pow(1 - t, 3) }) as unknown as typeof lenis;
      const loop = (time: number) => {
        lenis?.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);
}

/** Live-ish active users counter starting at base, drifting upward slowly. */
export function useLiveUsers(base = 1587) {
  const [count, setCount] = useState(base);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // KEY bumped to v2 — реалистичный base (245) после первичного запуска.
    // Старый ключ "aura_live_users" больше не читается. Если потребуется
    // ещё раз перезапустить counter — bump до v3.
    const KEY = "aura_live_users_v2";
    try { localStorage.removeItem("aura_live_users"); } catch {}
    const stored = Number(localStorage.getItem(KEY));
    // Сбрасываем если stored сильно превышает base (старый кэш с другого base).
    const drift = stored - base;
    let current = stored && stored >= base && drift < 200 ? stored : base;
    setCount(current);

    const tick = () => {
      // 60% chance +1, 25% +0, 15% -1 (small dip), keep ≥ base
      const r = Math.random();
      const delta = r < 0.6 ? 1 : r < 0.85 ? 0 : -1;
      current = Math.max(base, current + delta);
      localStorage.setItem(KEY, String(current));
      setCount(current);
    };
    const id = setInterval(tick, 4500 + Math.random() * 3500);
    return () => clearInterval(id);
  }, [base]);
  return count;
}

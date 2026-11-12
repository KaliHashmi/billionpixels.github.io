// Motion: GSAP (animation), ScrollTrigger and SplitText (scroll and text effects), Lenis (smooth scrolling).
// Everything here switches off for visitors who ask their device to reduce motion.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let lenis = null;

export function startSmoothScroll() {
  if (prefersReducedMotion()) return () => {};
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time) => lenis?.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    lenis?.destroy();
    lenis = null;
  };
}

const HEADER_OFFSET = -76;

/** Scrolls to a section and moves keyboard focus there, without changing the address. */
export function goTo(id) {
  const el = id === 'top' ? document.body : document.getElementById(id);
  if (!el) return;
  // On phones the service drawing stays pinned under the header, so a service has to land below it.
  const pinned = el.classList?.contains('layer') && window.innerWidth <= 960 ? (document.querySelector('.layers-visual')?.offsetHeight ?? 0) : 0;
  const offset = HEADER_OFFSET - pinned;
  if (lenis) lenis.scrollTo(id === 'top' ? 0 : el, { offset, duration: 1.4 });
  else {
    const top = id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
  if (id !== 'top') el.focus?.({ preventScroll: true });
}

/**
 * Reveals inside `root`: [data-split] headings rise line by line, [data-reveal] blocks fade up.
 * Content is laid out and readable without this; the animation only plays when a block first scrolls in.
 */
export function revealIn(root) {
  if (prefersReducedMotion() || !root) return () => {};
  const ctx = gsap.context(() => {
    root.querySelectorAll('[data-split]').forEach((el) => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 105,
            duration: 1.1,
            ease: 'expo.out',
            stagger: 0.08,
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          }),
      });
    });
    root.querySelectorAll('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 32,
        autoAlpha: 0,
        duration: 1,
        ease: 'power3.out',
        delay: Number(el.dataset.reveal) || 0,
        // Hand the element back to the stylesheet afterwards, so hover effects on cards still work.
        clearProps: 'transform,opacity,visibility',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    });
  }, root);
  return () => ctx.revert();
}

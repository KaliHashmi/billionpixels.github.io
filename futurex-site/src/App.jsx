import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CONTENT, CONTACT } from './i18n/content.js';
import { gsap, ScrollTrigger, SplitText, goTo, prefersReducedMotion, revealIn, startSmoothScroll } from './motion.js';
import Threads from './components/Threads.jsx';
import SpotlightCard from './components/SpotlightCard.jsx';
import LayerStack from './components/LayerStack.jsx';
import LayerIcon from './components/LayerIcon.jsx';
import logo from './assets/logo.svg';
import hisabIcon from './assets/hisab.webp';
import atndIcon from './assets/atnd.webp';

const ICONS = { hisab: hisabIcon, atnd: atndIcon };
const STORE_KEY = 'futurex-lang';
const SECTIONS = ['layers', 'products', 'approach', 'company', 'contact'];

function initialLang() {
  const hash = typeof location !== 'undefined' ? location.hash.slice(1) : '';
  if (hash === 'ar' || hash === 'en') return hash;
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* storage can be blocked; fall through */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** Runs `read` once now, then at most once per frame while the page scrolls or resizes. */
function useScrollRead(read) {
  useEffect(() => {
    let raf = 0;
    const run = () => {
      raf = 0;
      read();
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    run();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    // `read` only touches refs and state setters, so one subscription for the life of the component is enough.
  }, []);
}

/** Arrow that points the way the text reads (it flips on the Arabic page). */
function Arrow() {
  return (
    <svg className="arrow" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="chat-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z" />
    </svg>
  );
}

/** Section links scroll smoothly instead of jumping, and never change the page address. */
function NavLink({ to, children, className, onClick, ...rest }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
        goTo(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

const whatsappLink = (message) => (message ? `${CONTACT.whatsapp}?text=${encodeURIComponent(message)}` : CONTACT.whatsapp);

function Header({ t, onToggleLang }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const bar = useRef(null);
  useScrollRead(() => {
    const y = window.scrollY;
    setScrolled(y > 24);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.current?.style.setProperty('--progress', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
    // The section being read is the last one whose top has passed 40% of the screen.
    const line = window.innerHeight * 0.4;
    let current = null;
    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= line) current = id;
    }
    setActive(current);
  });
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <header className={`site-header${scrolled || open ? ' is-solid' : ''}`}>
      <div className="wrap header-row">
        <NavLink to="top" className="brand" onClick={() => setOpen(false)}>
          <img src={logo} alt="FutureX Technical Solutions" width="200" height="27" />
        </NavLink>
        <nav className={`nav${open ? ' is-open' : ''}`} aria-label={t.nav.menu} id="site-nav">
          {SECTIONS.map((id) => (
            <NavLink key={id} to={id} className="nav-link" aria-current={active === id ? 'true' : undefined} onClick={() => setOpen(false)}>
              {t.nav[id]}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <button type="button" className="lang" onClick={onToggleLang} aria-label={t.nav.langLabel} lang={t.dir === 'rtl' ? 'en' : 'ar'}>
            {t.nav.lang}
          </button>
          <NavLink to="contact" className="btn btn-small">
            {t.nav.cta}
          </NavLink>
          <button type="button" className="menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((v) => !v)}>
            <span className="sr-only">{open ? t.nav.close : t.nav.menu}</span>
            <span className="bars" aria-hidden="true" />
          </button>
        </div>
      </div>
      <span className="scroll-progress" ref={bar} aria-hidden="true" />
    </header>
  );
}

function Hero({ t, lang }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => {
      const title = ref.current.querySelector('.hero-title');
      // Arabic letters join, so Arabic is animated word by word; English letter by letter.
      const split = SplitText.create(title, { type: lang === 'ar' ? 'words,lines' : 'chars,lines', mask: 'lines' });
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
      tl.from(lang === 'ar' ? split.words : split.chars, { yPercent: 110, duration: 1.2, stagger: lang === 'ar' ? 0.07 : 0.022 }, 0.1)
        .from('.hero-lead', { y: 24, autoAlpha: 0, duration: 1 }, '-=0.8')
        .from('.hero-ctas > *', { y: 18, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, '-=0.75')
        .from('.hero-index', { autoAlpha: 0, duration: 0.8 }, '-=0.7')
        .from('.hero-index > li', { y: 16, autoAlpha: 0, duration: 0.8, stagger: 0.07 }, '<')
        .from('.hero-bg-in', { opacity: 0, duration: 2.4, ease: 'power2.out' }, 0);
      // The threads drift up and dim a little as the hero leaves the screen. The load fade-in runs on the inner
      // layer and this on the outer one, so the two never fight over the same opacity.
      gsap.fromTo('.hero-bg', { yPercent: 0, opacity: 1 }, { yPercent: -12, opacity: 0.4, ease: 'none', immediateRender: false, scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true } });
    }, ref);
    return () => ctx.revert();
  }, [lang]);
  return (
    <section className="hero dark" ref={ref} id="top-hero" aria-labelledby="hero-title">
      <div className="stars" aria-hidden="true" />
      <div className="horizon" aria-hidden="true" />
      <div className="hero-bg" aria-hidden="true">
        <div className="hero-bg-in">
          <Threads color={[0.62, 0.66, 0.72]} amplitude={1.25} distance={0.25} lineCount={64} thickness={0.55} speed={0.45} brightness={1.1} angle={lang === 'ar' ? -18 : 18} />
        </div>
      </div>
      <div className="wrap hero-inner">
        <h1 className="hero-title" id="hero-title">
          {t.hero.title[0]}
          <br />
          <span className="dim">{t.hero.title[1]}</span>
        </h1>
        <p className="hero-lead">{t.hero.lead}</p>
        <div className="hero-ctas">
          <NavLink to="contact" className="btn">
            {t.hero.primary}
            <Arrow />
          </NavLink>
          <NavLink to="layers" className="btn btn-ghost">
            {t.hero.secondary}
          </NavLink>
        </div>
        <ul className="hero-index" aria-label={t.nav.layers}>
          {t.layers.items.map((item) => (
            <li key={item.id}>
              <NavLink to={`service-${item.id}`}>
                <LayerIcon id={item.id} />
                <span>{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, intro, id }) {
  return (
    <div className="section-head">
      <p className="kicker" data-reveal>
        {eyebrow}
      </p>
      <h2 id={id} data-split>
        {title}
      </h2>
      <div className="rule" aria-hidden="true" data-reveal="0.05">
        <i />
        <i />
      </div>
      {intro && (
        <p className="intro" data-reveal="0.1">
          {intro}
        </p>
      )}
    </div>
  );
}

function Layers({ t }) {
  const ref = useRef(null);
  const [active, setActive] = useState(0);
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      ref.current.querySelectorAll('.layer').forEach((el, i) => {
        // On phones the pinned drawing covers the top of the screen, so a layer counts as "being read" lower down.
        const line = () => (window.innerWidth <= 960 ? '78%' : '55%');
        ScrollTrigger.create({ trigger: el, start: () => `top ${line()}`, end: () => `bottom ${line()}`, invalidateOnRefresh: true, onToggle: (self) => self.isActive && setActive(i) });
      });
    }, ref);
    return () => ctx.revert();
  }, []);
  const { layers } = t;
  return (
    <section className="section layers" id="layers" tabIndex={-1} aria-labelledby="layers-title" ref={ref}>
      <div className="wrap">
        <SectionHead eyebrow={layers.eyebrow} title={layers.title} intro={layers.intro} id="layers-title" />
        <div className="layers-grid">
          <div className="layers-visual">
            <div className="layers-sticky">
              <LayerStack items={layers.items} active={active} label={layers.stackLabel} />
            </div>
          </div>
          <ol className="layers-list">
            {layers.items.map((item, i) => (
              <li key={item.id} id={`service-${item.id}`} className={`layer${i === active ? ' is-active' : ''}`}>
                <div className="layer-top">
                  <LayerIcon id={item.id} />
                </div>
                <h3>{item.name}</h3>
                <p className="tagline">{item.tagline}</p>
                <ul className="services">
                  {item.services.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <a className="ask" href={whatsappLink(layers.askMessage.replace('{service}', item.name))} target="_blank" rel="noopener noreferrer">
                  {layers.ask}
                  <Arrow />
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Products({ t }) {
  const { products } = t;
  return (
    <section className="section products soft" id="products" tabIndex={-1} aria-labelledby="products-title">
      <div className="wrap">
        <SectionHead eyebrow={products.eyebrow} title={products.title} intro={products.intro} id="products-title" />
        <div className="product-grid">
          {products.items.map((p, i) => (
            <SpotlightCard key={p.id} className="product" theme="dark" spotlightColor="#C9D0DA" intensity={0.14} borderGlow={0.6} data-reveal={i * 0.1}>
              <div className="product-top">
                <img src={ICONS[p.id]} alt="" width="64" height="64" className="product-icon" />
                <span className="chip">{products.status}</span>
              </div>
              <h3>
                {p.name} {p.native !== p.name && <span className="native">{p.native}</span>}
              </h3>
              <p>{p.text}</p>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 01, 02… in English; ٠١، ٠٢… on the Arabic page, like every other number there. */
function stepNumber(n, arabic) {
  const s = String(n).padStart(2, '0');
  return arabic ? s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : s;
}

function Approach({ t }) {
  const { approach } = t;
  return (
    <section className="section approach" id="approach" tabIndex={-1} aria-labelledby="approach-title">
      <div className="wrap">
        <SectionHead eyebrow={approach.eyebrow} title={approach.title} id="approach-title" />
        <ol className="steps">
          {approach.steps.map((s, i) => (
            <li key={s.name} className="card" data-reveal={i * 0.08}>
              <span className="step-no mono" aria-hidden="true">
                {stepNumber(i + 1, t.dir === 'rtl')}
              </span>
              <h3>{s.name}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Company({ t }) {
  const { company } = t;
  return (
    <section className="section company soft" id="company" tabIndex={-1} aria-labelledby="company-title">
      <div className="wrap company-grid">
        <div>
          <SectionHead eyebrow={company.eyebrow} title={company.title} id="company-title" />
          <p className="company-text" data-reveal>
            {company.text}
          </p>
        </div>
        <ul className="why">
          {company.points.map(([title, text], i) => (
            <li key={title} className="card" data-reveal={i * 0.07}>
              <span className="tick" aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CopyButton({ text, t }) {
  const [done, setDone] = useState(false);
  const ref = useRef(null);
  return (
    <button
      type="button"
      className="copy"
      onClick={() => {
        const ok = () => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        };
        try {
          navigator.clipboard.writeText(text).then(ok, () => selectNext(ref.current));
        } catch {
          selectNext(ref.current);
        }
      }}
      ref={ref}
      aria-live="polite"
    >
      {done ? t.contact.copied : t.contact.copy}
    </button>
  );
}

function selectNext(button) {
  const target = button?.closest('.contact-item')?.querySelector('.value');
  if (!target) return;
  const range = document.createRange();
  range.selectNodeContents(target);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function Contact({ t }) {
  const { contact } = t;
  return (
    <section className="section contact dark" id="contact" tabIndex={-1} aria-labelledby="contact-title">
      <div className="stars" aria-hidden="true" />
      <div className="horizon" aria-hidden="true" />
      <div className="wrap">
        <SectionHead eyebrow={contact.eyebrow} title={contact.title} intro={contact.text} id="contact-title" />
        <div className="contact-ctas" data-reveal="0.15">
          <a className="btn" href={whatsappLink()} target="_blank" rel="noopener noreferrer">
            <ChatIcon />
            {contact.whatsapp}
          </a>
          <a className="btn btn-ghost" href={`mailto:${CONTACT.email}`}>
            {contact.ctaEmail}
          </a>
        </div>
        <div className="contact-grid">
          <div className="contact-item" data-reveal>
            <p className="label">{contact.email}</p>
            <a className="value" href={`mailto:${CONTACT.email}`} dir="ltr">
              {CONTACT.email}
            </a>
            <CopyButton text={CONTACT.email} t={t} />
          </div>
          <div className="contact-item" data-reveal="0.08">
            <p className="label">{contact.phone}</p>
            <a className="value" href={`tel:${CONTACT.phone.replace(/\s/g, '')}`} dir="ltr">
              {CONTACT.phone}
            </a>
            <CopyButton text={CONTACT.phone} t={t} />
          </div>
          <div className="contact-item" data-reveal="0.16">
            <p className="label">{contact.office}</p>
            <address className="value small">
              {contact.address.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          </div>
          <div className="contact-item" data-reveal="0.24">
            <p className="label">{contact.hours}</p>
            <p className="value small">{contact.hoursText}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ t }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-top">
          <img src={logo} alt="FutureX Technical Solutions" width="170" height="23" className="footer-logo" />
          <nav className="footer-nav" aria-label={t.nav.menu}>
            {SECTIONS.map((id) => (
              <NavLink key={id} to={id}>
                {t.nav[id]}
              </NavLink>
            ))}
          </nav>
          <NavLink to="top" className="to-top">
            {t.footer.top}
          </NavLink>
        </div>
        <ul className="footer-meta">
          <li>{t.footer.rights}</li>
          <li>{t.footer.place}</li>
          <li>{t.footer.privacy}</li>
        </ul>
      </div>
    </footer>
  );
}

/** On phones the header has no room for "Talk to us", so a small WhatsApp button follows the reader instead. */
function FloatingContact({ t }) {
  const [show, setShow] = useState(false);
  useScrollRead(() => {
    const contact = document.getElementById('contact');
    const beforeContact = !contact || contact.getBoundingClientRect().top > window.innerHeight * 0.9;
    setShow(window.scrollY > window.innerHeight * 0.6 && beforeContact);
  });
  return (
    <a className={`float-contact${show ? ' is-shown' : ''}`} href={whatsappLink()} target="_blank" rel="noopener noreferrer" tabIndex={show ? 0 : -1} aria-hidden={!show} aria-label={t.contact.whatsapp}>
      <ChatIcon />
      <span>{t.contact.floating}</span>
    </a>
  );
}

function Page({ t, lang }) {
  const ref = useRef(null);
  useLayoutEffect(() => revealIn(ref.current), []);
  return (
    <main ref={ref} lang={lang}>
      <Hero t={t} lang={lang} />
      <Layers t={t} />
      <Products t={t} />
      <Approach t={t} />
      <Company t={t} />
      <Contact t={t} />
    </main>
  );
}

export default function App() {
  const [lang, setLang] = useState(initialLang);
  const t = CONTENT[lang];

  useEffect(() => startSmoothScroll(), []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = t.dir;
    document.title = t.meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description);
    try {
      localStorage.setItem(STORE_KEY, lang);
    } catch {
      /* ignore */
    }
    // Fonts change line breaks; let the scroll positions catch up.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, [lang, t]);

  const toggle = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    try {
      history.replaceState(null, '', `#${next}`);
    } catch {
      /* ignore */
    }
    window.scrollTo(0, 0);
    setLang(next);
  };

  return (
    <>
      <Header t={t} onToggleLang={toggle} />
      <Page key={lang} t={t} lang={lang} />
      <Footer t={t} />
      <FloatingContact t={t} />
    </>
  );
}

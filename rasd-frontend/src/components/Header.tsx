'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useI18n } from '@/i18n/I18nProvider';
import LanguageSwitcher from './LanguageSwitcher';

const NAV_ITEMS = [
  { key: 'home', id: 'hero' },
  { key: 'features', id: 'features' },
  { key: 'engine', id: 'audits' },
] as const;

type SectionId = (typeof NAV_ITEMS)[number]['id'];

const HEADER_HEIGHT = 64; 

function scrollToSection(id: string) {
  if (id === 'hero') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT - 12;
  window.scrollTo({ top: y, behavior: 'smooth' });
}

/* ─── component ─── */
export default function Header() {
  const { locale, dir, dict } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState<SectionId>('hero');
  const [scrolled, setScrolled] = useState(false);
  const ticking = useRef(false);

  const isHome = pathname === '/' || pathname === `/${locale}`;

  const goToSection = (id: string) => {
    if (isHome) {
      scrollToSection(id);
      return;
    }
    router.push(id === 'hero' ? `/${locale}` : `/${locale}#${id}`);
  };

  
  const progress = useMotionValue(0);
  const scaleX = useSpring(progress, { stiffness: 200, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.set(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [progress]);

  /* header shadow on scroll */
  useEffect(() => {
    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 8);
          ticking.current = false;
        });
        ticking.current = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sectionIds = NAV_ITEMS.map((n) => n.id);

    const observers: IntersectionObserver[] = [];

    const visibilityMap = new Map<SectionId, number>();

    const pick = () => {
      let bestId: SectionId = 'hero';
      let bestRatio = -1;
      visibilityMap.forEach((ratio, id) => {
        if (ratio > bestRatio) { bestRatio = ratio; bestId = id; }
      });
      setActive(bestId);
    };

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const obs = new IntersectionObserver(
        ([entry]) => {
          visibilityMap.set(id as SectionId, entry.intersectionRatio);
          pick();
        },
        { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1], rootMargin: `-${HEADER_HEIGHT}px 0px 0px 0px` }
      );

      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <header
      style={{
        position: 'fixed', top: 0, width: '100%', zIndex: 50,
        backgroundColor: scrolled ? 'rgba(249,249,255,0.92)' : 'rgba(249,249,255,0.75)',
        backdropFilter: 'blur(14px)',
        borderBottom: scrolled
          ? '1px solid color-mix(in srgb, var(--color-outline-variant) 55%, transparent)'
          : '1px solid transparent',
        transition: 'background-color 0.3s, border-color 0.3s, box-shadow 0.3s',
        boxShadow: scrolled ? '0 1px 8px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      <style>{`
        @media (max-width: 960px) {
          .site-header-nav { display: none !important; }
        }
        @media (max-width: 560px) {
          .site-header-inner { padding-inline: 16px !important; gap: 8px !important; }
          .site-header-login-label { display: none !important; }
          .site-header-login { padding: 6px !important; }
        }
      `}</style>

      <motion.div
        style={{
          scaleX,
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 2,
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-container))',
          transformOrigin: dir === 'rtl' ? '100% 50%' : '0% 50%',
        }}
      />

      <div
        className="site-header-inner"
        style={{
          height: HEADER_HEIGHT, maxWidth: 1280, margin: '0 auto',
          padding: '0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}
      >
        {/* ── Logo ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <button
            onClick={() => goToSection('hero')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{
              fontSize: 22, lineHeight: '32px', fontWeight: 700,
              color: 'var(--color-on-background)', letterSpacing: '-0.02em',
              fontFamily: 'var(--font-cairo), Cairo, sans-serif',
            }}>
              {dict.common.brand}
            </span>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              backgroundColor: 'var(--color-surface-container)',
              padding: '2px 6px', borderRadius: 999,
            }}>
              <span
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  backgroundColor: 'var(--color-primary-container)',
                  display: 'inline-block',
                  animation: 'ping 2.5s cubic-bezier(0,0,0.2,1) infinite',
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', lineHeight: '16px' }}>AI</span>
            </div>
          </button>

          {/* ── Animated Nav ── */}
          <nav className="site-header-nav" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
              {NAV_ITEMS.map((item) => {
                const isActive = isHome && active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => goToSection(item.id)}
                    style={{
                      position: 'relative',
                      padding: '6px 14px',
                      borderRadius: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: isActive ? 700 : 400,
                      color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                      transition: 'color 0.2s',
                      fontFamily: 'var(--font-cairo), Cairo, sans-serif',
                      zIndex: 1,
                    }}
                  >
                    {/* Framer Motion sliding background pill */}
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        style={{
                          position: 'absolute', inset: 0,
                          borderRadius: 8,
                          backgroundColor: 'color-mix(in srgb, var(--color-primary) 9%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)',
                          zIndex: -1,
                        }}
                      />
                    )}
                    {dict.nav[item.key]}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>

        {/* ── Auth ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LanguageSwitcher />
          <button
            className="site-header-login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              backgroundColor: 'var(--color-surface-container-lowest)',
              border: '1px solid color-mix(in srgb, var(--color-outline-variant) 70%, transparent)',
              color: 'var(--color-on-surface)',
              padding: '6px 12px', borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'var(--font-cairo), Cairo, sans-serif',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
            </svg>
            <span className="site-header-login-label">{dict.nav.login}</span>
          </button>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            backgroundColor: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-primary)' }}>person</span>
          </div>
        </div>
      </div>
    </header>
  );
}

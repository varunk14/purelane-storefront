/*
  Hero product rotator as a custom element, so the theme editor's add / remove /
  reorder maps cleanly onto connect / disconnect and nothing leaks. It drives the
  slide crossfade and the dots, and reads the shared motion engine for scroll and
  mouse parallax rather than adding its own scroll listener.

  Behaviour reproduced from the prototype:
    - autoplay every 3800ms, only while >= 20% of the stage is in view
    - pause on hover, resume on leave
    - dots are buttons with aria-current; arrow keys move between slides
    - scroll parallax f = min(scrollY/700, 1): translateY(-f*54), scale(1-f*0.06),
      opacity(1-f*0.55); mouse parallax only above 1024px
    - prefers-reduced-motion: no autoplay, no parallax; every slide still reachable
*/
(function () {
  'use strict';
  if (customElements.get('pl-hero-stage')) return;

  const AUTOPLAY_MS = 3800;
  const motion = () => window.PurelaneMotion;

  class HeroStage extends HTMLElement {
    connectedCallback() {
      this.slides = Array.from(this.querySelectorAll('.hslide'));
      this.dots = Array.from(this.querySelectorAll('.hdots button'));
      this.dotsBar = this.querySelector('.hdots');
      this.index = 0;
      this.timer = null;
      this.inView = false;
      this.mx = 0;
      this.my = 0;
      this._unsub = null;
      this._io = null;
      this._onMouse = null;

      if (!this.slides.length) return;
      this.go(0);

      const reduced = motion() ? motion().reduce : false;

      // dots
      this.dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
          this.stop();
          this.go(i);
          this.play();
        });
      });
      if (this.dotsBar) {
        this.dotsBar.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            this.stop();
            this.go(this.index + (e.key === 'ArrowRight' ? 1 : -1));
            const active = this.dots[this.index];
            if (active) active.focus();
            this.play();
          }
        });
      }

      // hover pause
      this.addEventListener('mouseenter', () => this.stop());
      this.addEventListener('mouseleave', () => this.play());

      // in-view gating for autoplay
      if (this.dots.length > 1 && 'IntersectionObserver' in window) {
        this._io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            this.inView = entry.isIntersecting;
            if (entry.isIntersecting) this.play();
            else this.stop();
          });
        }, { threshold: 0.2 });
        this._io.observe(this);
        if (motion()) motion().addObserver(this._io);
      } else {
        this.inView = true;
      }

      // parallax through the shared frame
      if (motion()) {
        this._unsub = motion().subscribe((state) => this.parallax(state));
        if (!reduced && window.matchMedia('(min-width: 1024px)').matches) {
          this._onMouse = (e) => {
            this.mx = (e.clientX / window.innerWidth - 0.5) * 2;
            this.my = (e.clientY / window.innerHeight - 0.5) * 2;
            motion().requestFrame();
          };
          window.addEventListener('mousemove', this._onMouse, { passive: true });
        }
      }
    }

    disconnectedCallback() {
      this.stop();
      if (this._unsub) this._unsub();
      if (this._io && motion()) motion().removeObserver(this._io);
      else if (this._io) this._io.disconnect();
      if (this._onMouse) window.removeEventListener('mousemove', this._onMouse);
      this._unsub = this._io = this._onMouse = null;
    }

    go(n) {
      const count = this.slides.length;
      this.index = ((n % count) + count) % count;
      this.slides.forEach((s, i) => s.classList.toggle('on', i === this.index));
      this.dots.forEach((d, i) => {
        const active = i === this.index;
        d.classList.toggle('on', active);
        if (active) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
    }

    play() {
      const reduced = motion() ? motion().reduce : false;
      if (reduced || this.timer || this.dots.length < 2 || !this.inView) return;
      if (motion()) this.timer = motion().managedInterval(() => this.go(this.index + 1), AUTOPLAY_MS);
    }

    stop() {
      if (this.timer && motion()) motion().clearManagedInterval(this.timer);
      this.timer = null;
    }

    parallax(state) {
      if (state.reduce) return;
      const f = Math.min(state.scrollY / 700, 1);
      const x = (this.mx * -16).toFixed(2);
      const y = (-f * 54 + this.my * -10).toFixed(2);
      this.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${(1 - f * 0.06).toFixed(3)})`;
      this.style.opacity = (1 - f * 0.55).toFixed(3);
    }
  }

  customElements.define('pl-hero-stage', HeroStage);
})();

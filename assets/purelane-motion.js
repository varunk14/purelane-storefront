/*
  Purelane motion — one shared engine for the whole storefront.

  It owns a single coalesced requestAnimationFrame loop, one IntersectionObserver
  for scroll reveals, the scene crossfade and a registry of section subscribers.
  Sections register on shopify:section:load and deregister on unload, so two loads
  never leave two loops or two timers running.

  Design rules honoured here:
    - Content is never trapped invisible. The hidden .rv state in CSS only applies
      under html.pl-js, which this file adds; and reveals also run from the rAF
      loop, so a missing or broken IntersectionObserver still shows every element.
    - No DOM queries inside the scroll handler. Node lists are cached on load and
      on each section lifecycle event; the frame only reads scrollY and writes.
    - prefers-reduced-motion removes the transform, the parallax and any autoplay;
      content stays fully visible.

  window.PurelaneMotion.debug exposes { observerCount, rafLoops, subscriberCount,
  timerCount } so behaviour can be asserted rather than eyeballed.
*/
(function () {
  'use strict';

  if (window.PurelaneMotion) return;

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = reduceQuery.matches;

  // Signal to CSS that JavaScript is live so the reveal hidden-state can apply.
  document.documentElement.classList.add('pl-js');

  var subscribers = [];        // frame subscribers: fn({ scrollY, width })
  var revealItems = new Set(); // elements waiting to reveal
  var ownedObservers = new Set();
  var managedTimers = new Set();

  var sceneLayers = [];        // .scene nodes
  var sceneZones = [];         // [data-scene] nodes
  var sceneStage = null;       // #scenes
  var waterLayers = [];        // #scenes .wl nodes
  var currentScene = 0;

  var rafId = null;

  /* ---------- reveal ---------- */
  var revealObserver = null;
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) reveal(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    ownedObservers.add(revealObserver);
  }

  function reveal(el) {
    if (!revealItems.has(el)) return;
    el.classList.add('in');
    revealItems.delete(el);
    if (revealObserver) revealObserver.unobserve(el);
  }

  function observeReveal(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    var nodes = root.querySelectorAll ? root.querySelectorAll('.rv') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains('in') || revealItems.has(el)) continue;
      // Reduced motion or the theme editor: show immediately, no animation.
      if (reduce || window.Shopify && window.Shopify.designMode) {
        el.classList.add('in');
        continue;
      }
      revealItems.add(el);
      if (revealObserver) revealObserver.observe(el);
    }
    if (revealItems.size) requestFrame();
  }

  // Fallback used when the observer is absent or does not fire: reveal anything
  // already within the viewport during a frame. Reads are batched before writes.
  function sweepReveals(viewportH) {
    if (!revealItems.size) return;
    var toReveal = [];
    revealItems.forEach(function (el) {
      var top = el.getBoundingClientRect().top;
      if (top < viewportH * 0.88) toReveal.push(el);
    });
    toReveal.forEach(reveal);
  }

  /* ---------- scenes ---------- */
  function scanScenes() {
    sceneStage = document.getElementById('scenes');
    sceneLayers = slice(document.querySelectorAll('.scene'));
    sceneZones = slice(document.querySelectorAll('[data-scene]'));
    waterLayers = sceneStage ? slice(sceneStage.querySelectorAll('.wl')) : [];
  }

  function setScene(n) {
    if (n === currentScene) return;
    currentScene = n;
    for (var i = 0; i < sceneLayers.length; i++) {
      sceneLayers[i].classList.toggle('on', i + 1 === n);
    }
    if (sceneStage) sceneStage.setAttribute('data-d', String(n));
  }

  function pickScene(scrollY, viewportH) {
    if (!sceneZones.length) return;
    var focus = scrollY + viewportH * 0.5;
    var n = 1;
    for (var i = 0; i < sceneZones.length; i++) {
      var z = sceneZones[i];
      var top = 0;
      var el = z;
      while (el) { top += el.offsetTop; el = el.offsetParent; }
      if (top <= focus) n = parseInt(z.getAttribute('data-scene'), 10) || n;
    }
    setScene(n);
  }

  /* ---------- the single frame ---------- */
  function frame() {
    rafId = null;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var viewportH = window.innerHeight;
    var width = window.innerWidth;

    if (!reduce) {
      for (var i = 0; i < waterLayers.length; i++) {
        var depth = [0.05, 0.09, 0.03, 0.02][i] || 0.05;
        waterLayers[i].style.setProperty('--py', (-scrollY * depth).toFixed(1) + 'px');
      }
    }

    pickScene(scrollY, viewportH);
    sweepReveals(viewportH);

    var state = { scrollY: scrollY, viewportH: viewportH, width: width, reduce: reduce };
    for (var s = 0; s < subscribers.length; s++) {
      try { subscribers[s](state); } catch (e) { /* a section fault must not kill the loop */ }
    }
  }

  function requestFrame() {
    if (rafId == null) rafId = requestAnimationFrame(frame);
  }

  /* ---------- subscriber registry ---------- */
  function subscribe(fn) {
    if (typeof fn === 'function' && subscribers.indexOf(fn) === -1) {
      subscribers.push(fn);
      requestFrame();
    }
    return function () { unsubscribe(fn); };
  }
  function unsubscribe(fn) {
    var i = subscribers.indexOf(fn);
    if (i !== -1) subscribers.splice(i, 1);
  }

  /* ---------- helpers sections can use ---------- */
  function addObserver(io) { if (io) ownedObservers.add(io); return io; }
  function removeObserver(io) {
    if (io) { try { io.disconnect(); } catch (e) {} ownedObservers.delete(io); }
  }
  function managedInterval(fn, ms) {
    if (reduce) return null;
    var id = setInterval(fn, ms);
    managedTimers.add(id);
    return id;
  }
  function clearManagedInterval(id) {
    if (id != null && managedTimers.has(id)) { clearInterval(id); managedTimers.delete(id); }
  }

  function slice(nodeList) { return Array.prototype.slice.call(nodeList); }

  /* ---------- global listeners: one each, forever ---------- */
  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', requestFrame);

  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', function (e) {
      reduce = e.matches;
      if (reduce) revealItems.forEach(function (el) { reveal(el); });
      requestFrame();
    });
  }

  /* ---------- theme editor + section lifecycle ---------- */
  function onSectionLoad(evt) {
    scanScenes();
    var target = evt && evt.target ? evt.target : document;
    observeReveal(target);
    requestFrame();
  }
  function onSectionUnload() {
    scanScenes();
    requestFrame();
  }
  function onBlockSelect(evt) {
    if (evt && evt.target) observeReveal(evt.target);
  }
  document.addEventListener('shopify:section:load', onSectionLoad);
  document.addEventListener('shopify:section:unload', onSectionUnload);
  document.addEventListener('shopify:section:select', onSectionLoad);
  document.addEventListener('shopify:section:deselect', onSectionUnload);
  document.addEventListener('shopify:block:select', onBlockSelect);
  document.addEventListener('shopify:block:deselect', onBlockSelect);

  /* ---------- public surface ---------- */
  window.PurelaneMotion = {
    get reduce() { return reduce; },
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    observeReveal: observeReveal,
    reveal: reveal,
    scanScenes: scanScenes,
    addObserver: addObserver,
    removeObserver: removeObserver,
    managedInterval: managedInterval,
    clearManagedInterval: clearManagedInterval,
    requestFrame: requestFrame,
    get debug() {
      return {
        observerCount: ownedObservers.size,
        rafLoops: rafId != null ? 1 : 0,
        subscriberCount: subscribers.length,
        timerCount: managedTimers.size
      };
    }
  };

  /* ---------- boot ---------- */
  function boot() {
    scanScenes();
    observeReveal(document);
    requestFrame();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

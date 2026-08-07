/*
  Progressive enhancement for the card's add-to-cart form. Without this script
  the form posts to /cart/add and the browser navigates to the cart, so adding
  works with no JavaScript. With it, the submit is intercepted, the item is
  added over fetch, the cart count updates and the change is announced in a
  polite live region — no page reload.
*/
(function () {
  'use strict';
  if (customElements.get('product-add')) return;

  let liveRegion = null;
  function announce(message) {
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('role', 'status');
      liveRegion.style.cssText =
        'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
      document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = '';
    // a fresh assignment on the next frame guarantees the change is announced
    requestAnimationFrame(() => { liveRegion.textContent = message; });
  }

  function updateCartCount(count) {
    document.querySelectorAll('.cart-count-bubble span[aria-hidden="true"], [data-cart-count]').forEach((el) => {
      el.textContent = count;
    });
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { count } }));
  }

  class ProductAdd extends HTMLElement {
    connectedCallback() {
      this.form = this.querySelector('form');
      this.button = this.querySelector('button');
      this._onSubmit = this.onSubmit.bind(this);
      if (this.form) this.form.addEventListener('submit', this._onSubmit);
    }
    disconnectedCallback() {
      if (this.form) this.form.removeEventListener('submit', this._onSubmit);
    }
    async onSubmit(event) {
      if (!window.fetch || !window.FormData) return; // fall back to a normal post
      event.preventDefault();
      const addUrl = (window.routes && window.routes.cart_add_url) || '/cart/add';
      const addedLabel = this.dataset.addedLabel || 'Added to cart';
      if (this.button) { this.button.setAttribute('aria-busy', 'true'); this.button.disabled = true; }
      try {
        const res = await fetch(addUrl, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(this.form),
        });
        if (!res.ok) throw new Error('add failed');
        const cart = await fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json());
        updateCartCount(cart.item_count);
        announce(addedLabel);
      } catch (e) {
        // network or validation error: let the browser do the plain post instead
        this.form.submit();
      } finally {
        if (this.button) { this.button.removeAttribute('aria-busy'); this.button.disabled = false; }
      }
    }
  }

  customElements.define('product-add', ProductAdd);
})();

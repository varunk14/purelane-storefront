# Purelane storefront

A custom Shopify theme for Purelane, a plant-based homecare brand. It is built on
a clean Dawn base and adds a bespoke, merchant-editable homepage that renders over
a fixed, animated water scene.

The homepage is composed of independent sections a marketing team can add, remove
and reorder from the theme editor without touching code. Every price, rating,
badge and piece of copy comes from the platform or from section settings — nothing
is hardcoded.

## Running it locally

Requires the [Shopify CLI](https://shopify.dev/docs/themes/tools/cli).

```bash
shopify theme dev --store <your-store>.myshopify.com
```

This serves the theme with hot reload against your development store. To upload a
copy without publishing:

```bash
shopify theme push --unpublished
```

## Foundations

These are shared by every section and load once.

| File | Purpose |
|------|---------|
| `assets/purelane-base.css` | Design tokens on `:root`, the type scale (Outfit for display, Inter for body) and the shared primitives: `.wrap`, `.glass`, `.glass-2`, the `.btn` family, `.rule`, `.panel-head`, `.sec`, and the `.rv` scroll-reveal system. |
| `assets/scene-backdrop.css` | The fixed water backdrop: layered caustics, rising bubbles and a vignette, with a depth response driven by the active scene. |
| `snippets/scene-backdrop.liquid` | The backdrop markup, rendered once from the layout so it is never duplicated inside a section. Fully decorative and hidden from assistive technology. |
| `assets/purelane-motion.js` | One shared motion engine: a single animation-frame loop, one reveal observer, a subscriber registry and the scene crossfade. Sections subscribe on load and clean up on unload, so the theme editor can add and remove them freely. |

Fonts (Outfit and Inter) are self-hosted as woff2 in `assets/` and preloaded, so no
third-party font host is contacted on any page.

### Accessibility and motion

- The reveal system keeps content fully visible when JavaScript is unavailable; the
  hidden state only applies once the motion engine confirms it is running.
- `prefers-reduced-motion: reduce` disables the water animation, the parallax and
  the reveal transform. Content stays readable and in place.
- The backdrop is `aria-hidden` and its SVG layers are `focusable="false"`, so it
  never enters the tab order or the accessibility tree.

## Data model

Merchant-facing content is driven by product metafields and by metaobjects for
constructs Shopify has no native field for (bundle tiers, reviews). The full list of
definitions ships alongside the store. In short:

- **Product metafields** supply badge text, ratings, per-item benefits and size
  labels, so a reviews app or a merchant can populate them without a code change.
- **Metaobjects** model bundle tiers and reviews as first-class, reorderable entries.

Sections read every field through a fallback, so an empty field yields a sensible
layout rather than a hole.

## Structure

```
assets/      styles, scripts and self-hosted fonts
layout/      theme.liquid renders the backdrop and loads the foundations
sections/    the homepage sections, each with its own schema and scoped CSS
snippets/    reusable building blocks (product card, price, rating, backdrop)
templates/   JSON templates; index.json composes the homepage
locales/     translated strings, including schema labels
```

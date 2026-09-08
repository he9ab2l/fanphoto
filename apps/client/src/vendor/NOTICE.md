# Application-only component adaptations

Source: the user's local `ui-libraries/components/react-bits`, commit `0e69e73`.
Masonry is adapted into globally balanced, proportional justified rows and stable pagination.
DomeGallery's perspective / tangent-plane and gesture concepts are used by SurroundGallery:
one horizontally curved, infinitely recycled surface without image mesh deformation.

The previous GlassSurface adaptation was rewritten from scratch into FanPhoto's own Glass Engine
(`src/glass/`, see `docs/glass-engine-architecture.md`): material system, environment tint,
dynamic light, spring motion, SDF lens field and SVG/WebGL refraction renderers. No react-bits
glass code remains in `vendor/`.

Adaptations are used only as part of FanPhoto, not distributed as a component library.
The original license is included beside this notice.

All general interaction primitives are Base UI 1.8.0 (MIT); icons are the official
MingCute React 3.0.2 package (Apache-2.0). No icon paths are authored by this application.

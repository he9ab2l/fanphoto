# Application-only component adaptations

Source: the user's local `ui-libraries/components/react-bits`, commit `0e69e73`.
Masonry's shortest-column placement is extended for true aspect ratios and panorama spans.
DomeGallery's perspective / tangent-plane and gesture concepts support separate cylinder
and sphere surfaces, with recycled visible columns and no built-in full-screen enlargement.
GlassSurface uses the documented cross-browser CSS fallback with monochrome theme tokens.

Adaptations are used only as part of FanPhoto, not distributed as a component library.
The original license is included beside this notice.

All general interaction primitives are Base UI 1.8.0 (MIT); icons are the official
MingCute React 3.0.2 package (Apache-2.0). No icon paths are authored by this application.

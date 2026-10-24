# Asset credits

## Current vector artwork

`assets/village-flat.svg` and `assets/cottage-flat.svg` are original, code-authored illustrations for the current flat cartoon village. They share a restrained outline, flat colors and simple shapes with the Canvas characters. SVG terrain and cottages are rasterized once into local renderer caches.

## Earlier artwork

`assets/village-terrain.webp` and `assets/cottage.webp` were generated for Lantern Hollow using OpenAI image generation and optimized as WebP for delivery. Character shapes, accessories, particles, interface icons, lighting, and animations are rendered by this project's Canvas/SVG code. The game does not distribute Feign screenshots, sprites, audio, or other extracted game assets.

## Fonts

- **Nunito**, weights 600 and 800, from `@fontsource/nunito@5.2.7`. SIL Open Font License 1.1: `assets/fonts/nunito-OFL.txt`.
- **Baloo Bhaijaan 2**, Arabic weight 600, from `@fontsource/baloo-bhaijaan-2@5.2.7`. SIL Open Font License 1.1: `assets/fonts/arabic-OFL.txt`.

Fonts are served locally. Full copyright notices are retained in the included licenses.

## Networking dependency

The optional direct transport vendors the official PeerJS 1.5.5 browser build. Its MIT license is in `vendor/peerjs.LICENSE`. The default HTTPS transport has no browser library dependency.

## Illustrated edition (v6)

`assets/village-illustrated.webp` and `assets/cottage-illustrated.webp` are original images created using the built-in image-generation tool for this project. No Feign artwork is distributed. Their combined download is approximately 293 KB. The cottage retains alpha transparency. Original PNG masters remain in the working session; optimized WebP production assets are committed here.

Terrain prompt: a polished hand-illustrated cartoon woodland clearing viewed from an elevated orthographic camera, open grass for interactive homes, central golden oval clearing, lush foliage only at the edges, turquoise waterfall and bridge on the right, lily pond left, warm light, dark olive outlines, gouache texture, no buildings, people, text or UI.

Cottage prompt: a single transparent hand-illustrated cartoon cottage, elevated three-quarter view, cream plaster, terracotta shingle roof, short chimney, cyan left window, arched wooden door and steps, flowers, dark brown outlines, gouache shading, warm highlights, no scenery, text or characters.

Characters, public color pennants, smoke, motes, night impacts, recovery sparks, and interface are drawn in code. Public art never reads role or faction metadata.

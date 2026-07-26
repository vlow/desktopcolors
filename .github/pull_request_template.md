<!--
Thanks for contributing! See CONTRIBUTING.md for the full guide.
Delete any section that does not apply.
-->

## What this adds

<!-- e.g. "BeOS (1995) with its four desktop colors" -->

## Source

<!--
Required. Where did the color(s) come from? A sentence is enough.
A screenshot of a real or emulated install, a constant in a source/theme/resource
file, official documentation, or a reputable archive all count. If you sampled a
pixel, say which screenshot. If you read a constant, link the file.
-->

## Screenshots

<!-- Required only for a new or changed desktop chrome style: the preview on
     both a light and a dark color. -->

## Checklist

- [ ] The file is `src/content/os/<slug>.json`, `hex` values are lowercase `#rrggbb`, and at most one color is `default`.
- [ ] `family` and `type` reuse existing values unless genuinely new.
- [ ] Any dithered desktop has its blended entry(ies) plus partials, with **recomputed** averages and the collapse rule applied.
- [ ] `npm run build` passes.
- [ ] The description above names the source of every color.

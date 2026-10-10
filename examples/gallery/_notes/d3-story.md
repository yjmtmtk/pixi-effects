# d3-story — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 5 check runs   Result: works
poster: sonnet (Claude Sonnet 5.5, self-reported) (poster time 18.5 s in `movie.init`)
Made on 2026-10-10 in the main working session, NOT by a fresh subagent from the brief: the author knew the library. Read this as a field test of "d3 does the numbers, pixi-effects does the motion", not of the documentation.

## What d3 does here (the page imports `d3` and `topojson-client` through the import map, nothing else is new)
1. Bars: `scaleBand` (x, padding), `scaleLinear` (height, `.nice()`, `.ticks(4)` for the grid) and `scaleSequential(interpolateRgb)` for the colour of each bar; the bar's `height` and its counter are keyframed with the same ease.
2. Line: `d3.line().curve(curveCatmullRom)` and `d3.area()` give path strings for `shape: 'path'`; the line is drawn on with `trimEnd`. `d3.randomNormal.source(d3.randomLcg(7))` makes the sample data, so a render is the same every time. `d3.maxIndex` finds the peak.
3. Donut: `d3.pie().padAngle()` and `d3.arc().cornerRadius()` drawn into a small "context" that turns every arc into points, so a slice is a `polygon`. `arc.centroid` of a bigger arc places the labels.
4. Map: `geoNaturalEarth1().fitExtent`, `geoPath` for the sphere, graticule, land and borders (world-atlas `countries-110m` via topojson-client), and a great-circle route is a `LineString` through `geoPath`, drawn on with `trimEnd`.

## Stumbles
### 1. The donut slices collapsed onto the centre   [DOC-GAP, not fully isolated]
- tried: one `shape: 'path'` per slice with `d: arc(slice)` and `initial: { x: CX, y: CY }`. All the slices sat on top of each other around the middle, as small wedges.
- what worked: a `polygon` whose points are measured from the CENTRE OF ITS OWN BOUNDS, placed with `x`, `y` at that centre on the canvas (`[px - mx, py - my]`, `x: CX + mx`). A polygon is positioned by its bounds' centre; I did not check whether a path with an offset behaves the same, nor whether the first failure came from the SVG arc commands `d3.arc` writes. A sentence in the dsl on how a shape's origin is chosen would have saved the round.
### 2. The map's data is fetched, not imported   [NOTE]
- `world-atlas` is a JSON file, so it cannot go in the import map. The page `fetch`es it from jsDelivr, the same CDN as the import map. The brief says "no network except the import map CDNs"; this is the one place it is stretched.
### 3. Small ones   [MY-MISTAKE]
- A line drawn by `trimEnd` is trimmed by its LENGTH, not by x: dots timed by x showed up before the line reached them. Timing them by the cumulative length of the polyline fixed it.
- Labels outside a donut need the donut's radius plus a margin of about 36 px to stay clear of the caption line (first try overlapped it); a "peak" label at the right edge needs `anchorX: 1`.

## Went smoothly
- `check`: no warnings, no layout problems, 23 s, audio -21 LUFS.
- `trimEnd` on a `path` that is thousands of points long (the borders, the land) and on a `LineString` route worked first time; luma wipes between the five scenes, the grain filter on the whole composition and the multiply vignette all worked as the recipes say.

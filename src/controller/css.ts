/** The bar's default stylesheet. Its colours and sizes are CSS custom properties (`--mc-accent`, `--mc-fg`, `--mc-track`, `--mc-bar-bg`, `--mc-track-height`, `--mc-font`): set them in your page CSS, or with the `theme` option. */
export const CONTROLLER_CSS = `
.movie-controller-wrap { position: relative; display: inline-block; line-height: 0; }
.movie-controller {
  position: absolute;
  pointer-events: none;
  font-family: var(--mc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  opacity: 1;
  transition: opacity 200ms ease;
}
.movie-controller[data-state="hidden"] { opacity: 0; }
.movie-controller > * { pointer-events: auto; }

.mc-progress {
  position: relative;
  width: 100%;
  height: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  outline: none;
}
.mc-progress:focus-visible {
  outline: 2px solid var(--mc-accent, #007AFF);
  outline-offset: 2px;
}
.mc-progress::before {
  content: ""; position: absolute; left: 12px; right: 12px;
  height: var(--mc-track-height, 3px); background: var(--mc-track, rgba(255,255,255,0.25));
  transition: height 120ms ease;
}
.mc-progress:hover::before, .mc-progress.mc-scrubbing::before { height: calc(var(--mc-track-height, 3px) + 2px); }
.mc-stops { position: absolute; left: 12px; right: 12px; top: 0; bottom: 0; pointer-events: none; }
.mc-stop-tick { position: absolute; top: 50%; width: 7px; height: 7px; transform: translate(-50%, -50%); border-radius: 50%; background: var(--mc-fg, #fff); box-shadow: 0 0 0 1.5px rgba(0,0,0,0.5); }
.mc-stop-page { width: 11px; height: 11px; box-shadow: 0 0 0 2.5px var(--mc-accent, #007AFF), 0 0 0 4px rgba(0,0,0,0.35); }
.mc-progress-fill {
  position: absolute; left: 12px; top: 50%;
  height: var(--mc-track-height, 3px);
  width: calc((100% - 24px) * var(--mc-fill, 0));
  background: var(--mc-accent, #007AFF);
  transform: translateY(-50%);
  transition: height 120ms ease;
  pointer-events: none;
}
.mc-progress:hover .mc-progress-fill,
.mc-progress.mc-scrubbing .mc-progress-fill { height: calc(var(--mc-track-height, 3px) + 2px); }
.mc-progress-thumb {
  position: absolute; top: 50%;
  left: calc(12px + (100% - 24px) * var(--mc-fill, 0));
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--mc-accent, #007AFF);
  transform: translate(-50%, -50%) scale(0);
  transition: transform 120ms ease;
  pointer-events: none;
}
.mc-progress:hover .mc-progress-thumb,
.mc-progress.mc-scrubbing .mc-progress-thumb { transform: translate(-50%, -50%) scale(1); }

.movie-controller > .mc-preview {
  position: absolute; bottom: 74px; left: 0;
  transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 3px; border-radius: 4px;
  background: rgba(0,0,0,0.75);
  pointer-events: none;
  opacity: 0; transition: opacity 100ms ease;
}
.mc-preview[data-show="1"] { opacity: 1; }
.mc-preview canvas { display: block; width: 160px; height: auto; border-radius: 2px; }
.mc-preview-time { font-size: 12px; line-height: 1; color: var(--mc-fg, #fff); font-variant-numeric: tabular-nums; }

.mc-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px 8px 12px;
  background: var(--mc-bar-bg, linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%));
  color: var(--mc-fg, #fff);
  line-height: 1;
}
.mc-btn {
  background: none; border: 0; padding: 0; margin: 0;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--mc-fg, #fff); opacity: 0.85; cursor: pointer;
  transition: opacity 120ms ease;
}
.mc-btn:hover { opacity: 1; }
.mc-loop[aria-pressed="true"] { opacity: 1; color: var(--mc-accent); }
.mc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mc-time {
  font-size: 12px; font-family: Menlo, Monaco, monospace;
  color: var(--mc-fg, #fff); opacity: 0.85;
  min-width: 90px;
}
.mc-spacer { flex: 1; }

.mc-volume { display: flex; align-items: center; }
.mc-vol-slider {
  position: relative;
  width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-left: 0;
  outline: none;
  transition: width 200ms ease, margin-left 200ms ease;
  overflow: hidden;
}
.mc-volume:hover .mc-vol-slider,
.mc-volume:focus-within .mc-vol-slider,
.mc-vol-slider.mc-scrubbing {
  width: 70px;
  margin-left: 6px;
}
.mc-vol-slider:focus-visible { outline: 2px solid var(--mc-accent, #007AFF); outline-offset: 2px; }
.mc-vol-slider::before {
  content: ""; position: absolute; left: 4px; right: 4px;
  height: 3px; background: var(--mc-track, rgba(255,255,255,0.25)); border-radius: 2px;
}
.mc-vol-fill {
  position: absolute; left: 4px; top: 50%;
  height: 3px;
  width: calc((100% - 8px) * var(--mc-volume, 1));
  background: var(--mc-fg, #fff);
  transform: translateY(-50%);
  border-radius: 2px;
  pointer-events: none;
}
.mc-vol-thumb {
  position: absolute; top: 50%;
  left: calc(4px + (100% - 8px) * var(--mc-volume, 1));
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--mc-fg, #fff);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

[data-mc-wrap]:fullscreen {
  width: 100vw; height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: #000;
}
[data-mc-wrap]:fullscreen > canvas {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: contain;
  border-radius: 0;
}

.mc-settings-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 12px;
  background: rgba(20, 20, 20, 0.96);
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 180px;
  color: #fff;
  font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mc-settings-popover[data-open="false"] { display: none; }
.mc-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.mc-settings-row > span { color: rgba(255,255,255,0.85); }
.mc-settings-row > select {
  font: inherit;
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
}
.mc-export-confirm {
  margin-top: 4px;
  width: 100%;
  background: var(--mc-accent, #007AFF);
  color: #fff;
  border: 0;
  border-radius: 4px;
  padding: 6px 10px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease;
}
.mc-export-confirm:hover { background: #0066d6; }
.mc-export-confirm:disabled { background: rgba(255,255,255,0.18); cursor: not-allowed; }

.mc-export-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; justify-content: center; align-items: center;
  z-index: 2;
}
.mc-export-panel {
  background: rgba(20,20,20,0.96); color: #fff;
  border-radius: 8px; padding: 16px 20px;
  text-align: center; min-width: 200px; max-width: 80%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.mc-export-title { font-size: 13px; margin-bottom: 10px; opacity: 0.9; }
.mc-export-track {
  width: 100%; height: 6px;
  background: rgba(255,255,255,0.15); border-radius: 3px;
  margin-bottom: 8px; overflow: hidden;
}
.mc-export-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--mc-accent, #007AFF), var(--mc-accent, #0056CC));
  transition: width 0.3s ease; border-radius: 3px;
}
.mc-export-text {
  color: rgba(255,255,255,0.7); font-size: 11px;
  font-family: Menlo, Monaco, monospace;
}
`;

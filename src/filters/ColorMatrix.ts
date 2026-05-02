import { ColorMatrixFilter } from 'pixi.js';

export interface ColorMatrixOptions {
  brightness?: number;
  saturate?: number;
  contrast?: number;
  hue?: number;
  alpha?: number;
}

export class ColorMatrix extends ColorMatrixFilter {
  private _values: Required<ColorMatrixOptions>;

  constructor(options: ColorMatrixOptions = {}) {
    super();
    this._values = {
      brightness: options.brightness ?? 1,
      saturate: options.saturate ?? 1,
      contrast: options.contrast ?? 1,
      hue: options.hue ?? 0,
      alpha: options.alpha ?? 1,
    };
    this._apply();
  }

  private _apply(): void {
    this.reset();
    this.brightness(this._values.brightness, true);
    this.saturate(this._values.saturate, true);
    this.contrast(this._values.contrast, true);
    this.hue(this._values.hue, true);
    this.alpha = this._values.alpha;
  }

  get brightness_(): number { return this._values.brightness; }
  set brightness_(v: number) { this._values.brightness = v; this._apply(); }
  get saturate_(): number { return this._values.saturate; }
  set saturate_(v: number) { this._values.saturate = v; this._apply(); }
  get contrast_(): number { return this._values.contrast; }
  set contrast_(v: number) { this._values.contrast = v; this._apply(); }
  get hue_(): number { return this._values.hue; }
  set hue_(v: number) { this._values.hue = v; this._apply(); }
}

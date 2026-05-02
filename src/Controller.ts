import type { Movie } from './core/Movie';

export interface ControllerOptions {
  canvas: HTMLCanvasElement;
  showExportButton?: boolean;
  enableKeyboardShortcuts?: boolean;
  className?: string;
}

interface ResolvedOptions {
  canvas: HTMLCanvasElement;
  showExportButton: boolean;
  enableKeyboardShortcuts: boolean;
  className: string;
}

export class Controller {
  movie: Movie;
  options: ResolvedOptions;

  private root: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private wrappedHere = false;
  private destroyed = false;

  constructor(movie: Movie, options: ControllerOptions) {
    if (!options || !options.canvas) {
      throw new Error('Controller requires options.canvas (HTMLCanvasElement).');
    }
    this.movie = movie;
    this.options = {
      canvas: options.canvas,
      showExportButton: options.showExportButton ?? true,
      enableKeyboardShortcuts: options.enableKeyboardShortcuts ?? true,
      className: options.className ?? 'movie-controller',
    };

    this.wrapper = this.ensurePositioningContext(this.options.canvas);
    this.root = document.createElement('div');
    this.root.className = this.options.className;
    this.wrapper.appendChild(this.root);
  }

  private ensurePositioningContext(canvas: HTMLCanvasElement): HTMLDivElement {
    const parent = canvas.parentElement;
    if (!parent) {
      throw new Error('Controller: canvas must be attached to the DOM before constructing.');
    }
    const pos = getComputedStyle(parent).position;
    if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') {
      return parent as HTMLDivElement;
    }
    const wrap = document.createElement('div');
    wrap.className = 'movie-controller-wrap';
    wrap.style.position = 'relative';
    wrap.style.display = 'inline-block';
    wrap.style.lineHeight = '0';
    parent.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
    this.wrappedHere = true;
    return wrap;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.remove();
    if (this.wrappedHere) {
      const parent = this.wrapper.parentElement;
      const canvas = this.options.canvas;
      if (parent) {
        parent.insertBefore(canvas, this.wrapper);
        this.wrapper.remove();
      }
    }
  }
}

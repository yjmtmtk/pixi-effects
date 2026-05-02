import { Text } from 'pixi.js';
import { Sequence } from './Base';
import { normalizeProps } from '../expr/normalizeProps';
import type { TextSequenceSpec } from '../types';

const STYLE_OPAQUE_KEYS = ['fontFamily', 'fill', 'align', 'fontStyle', 'fontWeight'];

export class TextSequence extends Sequence {
  declare spec: TextSequenceSpec;

  async build(): Promise<void> {
    const baseStyle = {
      fontFamily: 'Arial',
      fontSize: 36,
      fill: '#ffffff',
      align: 'center' as const,
    };
    const text = new Text({
      text: this.spec.text ?? '',
      style: baseStyle,
      label: this.spec.name,
    });
    text.cullable = true;
    this.target = text;
    this.intrinsicWidth = text.width;
    this.intrinsicHeight = text.height;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    if (this.spec.style) {
      const scope = this.scope();
      const resolved = normalizeProps(
        this.spec.style as Record<string, unknown>,
        scope as unknown as Record<string, number>,
        { skipKeys: STYLE_OPAQUE_KEYS },
      );
      for (const k of Object.keys(resolved)) {
        (text.style as unknown as Record<string, unknown>)[k] = (resolved as Record<string, unknown>)[k];
      }
    }
    this.buildFilters();
  }
}

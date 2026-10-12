// What a text layer's `style` is made of, shared by the text layer and by `spans` (which must measure with the style a text is DRAWN with).

// TextStyle fields whose string values are words or colours, never expressions. `join` / `cap` / `color`
// also live inside `stroke` and `dropShadow`, `stroke` itself may be a colour name.
export const STYLE_OPAQUE_KEYS = [
  'fontFamily', 'fill', 'align', 'fontStyle', 'fontWeight', 'fontVariant', 'textBaseline', 'whiteSpace',
  'lineJoin', 'join', 'cap', 'color', 'stroke',
];

/** What a text layer is drawn with when its `style` does not say. */
export const TEXT_STYLE_DEFAULTS = {
  fontFamily: 'Arial',
  fontSize: 36,
  fill: '#ffffff',
  align: 'center' as 'left' | 'center' | 'right',
};

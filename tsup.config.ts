import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    Controller: 'src/Controller.ts',
    three: 'src/three/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  external: ['pixi.js', 'gsap', 'gsap/PixiPlugin', 'mediabunny', 'three'],
});

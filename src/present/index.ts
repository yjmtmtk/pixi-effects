// pixi-effects/present: a movie that stops (a talk, a kiosk, a page list) and what comes with it. Built on the core's public API only.
export { Presenter } from './Presenter';
export type { PresenterOptions } from './Presenter';
export { deck } from './deck';
export type { DeckOptions, DeckPage, DeckResult, DeckTransition } from './deck';
export { next, prev, goToStop, goToPage, onStop, stopIndex, currentStop, pageIndex, pageCount } from './navigation';
export type { StopEvent } from './navigation';
export { stopImages, inspectStops, exportPDF } from './images';
export type { StopImage, StopImagesOptions, InspectStopsReport } from './images';

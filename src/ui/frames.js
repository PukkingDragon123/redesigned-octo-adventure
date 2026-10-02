// Older frame API kept for callers that set border images by hand. The art now
// comes from the pixel UI kit (kit.js); prefer its CSS classes (.k-panel, .k-btn,
// .k-slot ...) for anything new.
import { kitURL } from './kit.js';

const MAP = { wood: 'panel-leather', dark: 'panel-dark', paper: 'panel-parchment', order: 'plate-parchment', button: 'btn', buttonHot: 'btn-hover' };
// note: panels are 48px images sliced at 16, buttons 40x30 sliced 11 10 12 10, plates 24px sliced 8
export function frameURL(style = 'wood') {
  return kitURL(MAP[style] || 'panel-leather');
}
export function slotURL(hot = false) {
  return kitURL(hot ? 'slot-sel' : 'slot');
}

// P2 (Nassime) : étagère de collection (brief 02 Tâche 5, ajout 4 de la spec).
// Un verre rejoint l'étagère après un versement parfait. Pas d'icônes emoji
// pour représenter les verres : une petite silhouette dessinée en CSS.
import { mountScreen, header, bindBack, type Screen } from './screen';
import type { GlassModel } from './contractTypesTemp';

const ALL_MODELS: GlassModel[] = ['pint', 'mug_giant', 'thimble', 'flute', 'coconut', 'teacup', 'goblet', 'tankard'];

const MODEL_LABEL: Record<GlassModel, string> = {
  pint: 'Pinte',
  mug_giant: 'Chope du Géant',
  thimble: 'Dé de la Fée',
  flute: 'Flûte',
  coconut: 'Noix de coco',
  teacup: 'Tasse',
  goblet: 'Calice',
  tankard: 'Chope robuste',
};

export interface ShelfActions {
  onClose(): void;
}

export function showShelf(collection: GlassModel[], actions: ShelfActions): Screen {
  const owned = new Set(collection);
  const cards = ALL_MODELS.map((model) => {
    const has = owned.has(model);
    return `
      <div class="shelf-item ${has ? '' : 'shelf-item--locked'}">
        <div class="shelf-item__glass"></div>
        <div class="shelf-item__label">${has ? MODEL_LABEL[model] : '?'}</div>
      </div>
    `;
  }).join('');

  const screen = mountScreen(
    `
    ${header('Étagère', actions.onClose)}
    <div class="card shelf">
      <div class="shelf__count">${owned.size} / ${ALL_MODELS.length} verres parfaits</div>
      <div class="shelf__grid">${cards}</div>
    </div>
    `,
    'shelf-screen',
  );

  bindBack(screen, actions.onClose);
  return screen;
}

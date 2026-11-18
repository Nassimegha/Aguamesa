// P2 (Nassime) : petit utilitaire commun aux écrans (accueil, résultat,
// classement, étagère). Chaque écran est une div plein écran par-dessus le
// canvas 3D (qui continue de tourner derrière, visible à travers le fond
// assombri — on voit le café, pas un écran mort).
export interface Screen {
  readonly el: HTMLDivElement;
  unmount(): void;
}

export function mountScreen(innerHTML: string, className = ''): Screen {
  const el = document.createElement('div');
  el.className = `screen ${className}`.trim();
  el.innerHTML = `<div class="screen__backdrop"></div>${innerHTML}`;
  document.body.appendChild(el);
  return {
    el,
    unmount: () => el.remove(),
  };
}

export function header(title: string, onBack?: () => void): string {
  return `
    <div class="screen__header">
      ${onBack ? '<button class="btn btn--icon btn--ghost" data-back>←</button>' : ''}
      <div class="screen__title">${title}</div>
    </div>
  `;
}

export function bindBack(screen: Screen, onBack: () => void): void {
  screen.el.querySelector('[data-back]')?.addEventListener('click', onBack);
}

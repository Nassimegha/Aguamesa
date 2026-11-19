// P2 (Nassime) : mode Visite d'un lieu (Carte → Enter, ou lien direct ?visit=<lieu>).
// On entre dans le décor SANS lancer le Service du Jour (aucun essai consommé) : on tourne la
// caméra au doigt, on fait défiler les 30 clients du lieu et leurs réactions, puis on choisit
// de jouer. Pensé pour l'équipe pendant la création ET pour le jury : tout le contenu du jeu
// est visible en quelques taps.

export interface VisitCustomer {
  id: string;
  name: string;
  line: string;
}

export interface VisitInfo {
  name: string;
  blurb: string;
  customers: VisitCustomer[];
  hasLevels: boolean;
  shiftLabel: string;
  /** One line under the play button: what this mode counts for. */
  shiftNote?: string;
  /** Location 6 hosts the real shift: its play button looks different. */
  real?: boolean;
}

export interface VisitActions {
  onCustomer(index: number): void;
  onReact(kind: 'happy' | 'meh' | 'splashed'): void;
  onPlayShift(): void;
  onLevels(): void;
  onBack(): void;
}

export interface VisitPanel {
  dispose(): void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function showVisitPanel(info: VisitInfo, actions: VisitActions): VisitPanel {
  const n = info.customers.length;
  const el = document.createElement('div');
  el.className = 'visit';
  el.innerHTML = `
    <div class="visit__top">
      <button class="btn btn--icon btn--ghost" data-back aria-label="Back to the map">←</button>
      <div class="visit__title">
        <b>${esc(info.name)}</b>
        <span>${esc(info.blurb)}</span>
      </div>
    </div>
    <div class="visit__drag" aria-hidden="true">Drag to look around</div>
    <div class="visit__panel">
      ${
        n
          ? `<div class="visit__cast">
        <button class="btn btn--icon visit__arrow" data-prev aria-label="Previous customer">‹</button>
        <div class="visit__who" aria-live="polite">
          <small data-count></small>
          <b data-who></b>
          <i data-line></i>
        </div>
        <button class="btn btn--icon visit__arrow" data-next aria-label="Next customer">›</button>
      </div>
      <div class="visit__reacts">
        <button class="btn visit__react" data-react="happy">😄 Perfect</button>
        <button class="btn visit__react" data-react="meh">😐 Meh</button>
        <button class="btn visit__react" data-react="splashed">💦 Spill</button>
        <button class="btn btn--icon visit__react visit__dice" data-random aria-label="Random customer">🎲</button>
      </div>`
          : ''
      }
      <button class="btn ${info.real ? 'btn--primary' : 'visit__free'} visit__play" data-play>${esc(info.shiftLabel)}</button>
      ${info.shiftNote ? `<div class="visit__note">${esc(info.shiftNote)}</div>` : ''}
      ${info.hasLevels ? '<button class="btn visit__levels" data-levels>⭐ Levels here</button>' : ''}
    </div>`;
  document.body.appendChild(el);

  let i = 0;
  const who = el.querySelector<HTMLElement>('[data-who]');
  const line = el.querySelector<HTMLElement>('[data-line]');
  const count = el.querySelector<HTMLElement>('[data-count]');
  const show = (): void => {
    if (!who || !n) return;
    const c = info.customers[i]!;
    who.textContent = c.name;
    if (line) line.textContent = `“${c.line}”`;
    if (count) count.textContent = `Regular ${i + 1} / ${n}`;
    actions.onCustomer(i);
  };
  const step = (d: number): void => {
    i = (i + d + n) % n;
    show();
  };
  el.querySelector('[data-prev]')?.addEventListener('click', () => step(-1));
  el.querySelector('[data-next]')?.addEventListener('click', () => step(1));
  el.querySelector('[data-random]')?.addEventListener('click', () => step(1 + Math.floor(Math.random() * (n - 1))));
  el.querySelectorAll<HTMLButtonElement>('[data-react]').forEach((b) =>
    b.addEventListener('click', () => actions.onReact(b.dataset.react as 'happy' | 'meh' | 'splashed')),
  );
  el.querySelector('[data-play]')?.addEventListener('click', actions.onPlayShift);
  el.querySelector('[data-levels]')?.addEventListener('click', actions.onLevels);
  el.querySelector('[data-back]')?.addEventListener('click', actions.onBack);
  show();

  // l'invitation « Drag to look around » s'efface au premier geste
  const drag = el.querySelector<HTMLElement>('.visit__drag')!;
  const hideDrag = (): void => drag.classList.add('visit__drag--off');
  window.addEventListener('pointerdown', hideDrag, { once: true });
  const t = window.setTimeout(hideDrag, 4500);

  return {
    dispose() {
      clearTimeout(t);
      window.removeEventListener('pointerdown', hideDrag);
      el.remove();
    },
  };
}

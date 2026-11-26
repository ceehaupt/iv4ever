import type { GameView } from '../protocol';

/**
 * Einstiegshilfe: Schritte erscheinen der Reihe nach und gelten als erledigt, sobald die Spielansicht zeigt,
 * dass der Spieler den Schritt ausgeführt hat.
 */
interface Step {
  title: string;
  text: string;
  done?: (v: GameView, start: { explored: number }) => boolean;
}

const STEPS: Step[] = [
  {
    title: 'Willkommen bei iv4ever',
    text: 'Ziehe die Karte mit der Maus oder WASD, zoome mit dem Mausrad. Ein Klick wählt Einheiten, Städte und Felder – ist eine eigene Einheit gewählt, zieht ein Klick auf ein freies Feld sie dorthin.',
  },
  {
    title: 'Gründe deine Hauptstadt',
    text: 'Wähle den Siedler (⛺) und drücke <kbd>B</kbd> – das Startfeld ist ein guter Platz.',
    done: (v) => v.cities.some((c) => c.owner === v.human),
  },
  {
    title: 'Was soll gebaut werden?',
    text: 'In der Stadtansicht wählst du einen Bauauftrag, z. B. einen Krieger zur Verteidigung oder einen Arbeiter.',
    done: (v) => v.cities.some((c) => c.owner === v.human && !!c.own && c.own.queue.length > 0),
  },
  {
    title: 'Wähle ein Forschungsziel',
    text: 'Öffne den Technologiebaum mit <kbd>T</kbd> und klicke ein Ziel an. Voraussetzungen werden automatisch erforscht.',
    done: (v) => v.research.current >= 0 || v.research.known.length > 0,
  },
  {
    title: 'Erkunde die Welt',
    text: 'Wähle den Späher (Tab) und klicke mit der rechten Maustaste auf ein fernes Ziel. Die Vorschau zeigt die Runden.',
    done: (v, s) => countExplored(v) > s.explored + 25,
  },
  {
    title: 'Runde beenden',
    text: 'Haben alle Einheiten Befehle, beende die Runde mit <kbd>Enter</kbd>.',
    done: (v) => v.turn >= 3,
  },
  {
    title: 'Weiter so!',
    text: 'Diplomatie <kbd>D</kbd>, Leitbilder <kbd>P</kbd>, Handbuch <kbd>F1</kbd>, Einstellungen ⚙. Viel Erfolg!',
  },
];

function countExplored(v: GameView): number {
  let n = 0;
  for (let i = 0; i < v.fog.length; i++) if (v.fog[i]) n++;
  return n;
}

export class Tutorial {
  private readonly el = document.getElementById('tutorial')!;
  private step = 0;
  private active = false;
  private start = { explored: 0 };

  constructor(private readonly onFinish: () => void) {
    this.el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'next') this.advance();
      else if (act === 'skip') this.finish();
    });
  }

  begin(v: GameView): void {
    this.active = true;
    this.step = 0;
    this.start = { explored: countExplored(v) };
    this.render();
  }

  stop(): void {
    this.active = false;
    this.el.hidden = true;
  }

  update(v: GameView): void {
    if (!this.active) return;
    // Erledigte Schritte überspringen (auch mehrere auf einmal).
    while (this.step < STEPS.length && STEPS[this.step].done?.(v, this.start)) this.step++;
    if (this.step >= STEPS.length) this.finish();
    else this.render();
  }

  private advance(): void {
    this.step++;
    if (this.step >= STEPS.length) this.finish();
    else this.render();
  }

  private finish(): void {
    this.stop();
    this.onFinish();
  }

  private render(): void {
    const s = STEPS[this.step];
    this.el.innerHTML = `<strong>${s.title}</strong> <small>${this.step + 1}/${STEPS.length}</small><p>${s.text}</p>
      <div>${s.done ? '' : '<button type="button" data-act="next">Weiter</button>'} <button type="button" data-act="skip">Tutorial beenden</button></div>`;
    this.el.hidden = false;
  }
}

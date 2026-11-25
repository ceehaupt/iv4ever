import type { SoundSettings } from '../audio/sound';

/**
 * Einstellungen – im Browser gespeichert (localStorage, mit Fallback, falls nicht verfügbar).
 */
export interface Settings extends SoundSettings {
  animations: 'fast' | 'normal' | 'off';
  highContrast: boolean;
  colorblind: boolean;
  largeText: boolean;
  tutorial: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.7,
  sfx: 0.8,
  music: 0.35,
  musicOn: true,
  animations: 'normal',
  highContrast: false,
  colorblind: false,
  largeText: false,
  tutorial: true,
};

const KEY = 'iv4ever.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const base = { ...DEFAULT_SETTINGS, animations: reduced ? 'off' : DEFAULT_SETTINGS.animations } as Settings;
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<Settings>) } : base;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Speichern nicht möglich (z. B. privater Modus) – Einstellungen gelten nur für diese Sitzung.
  }
}

/** Einstellungsdialog (⚙). */
export class SettingsPanel {
  private readonly el = document.getElementById('settingspanel')!;

  constructor(private settings: Settings, private readonly onChange: (s: Settings) => void) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el || t.closest('[data-close]')) this.hide();
      if (t.closest('[data-act="tutorial"]')) {
        this.update({ ...this.settings, tutorial: true });
        this.hide();
      }
    });
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      const k = t.name as keyof Settings;
      if (!k) return;
      const v = t instanceof HTMLInputElement && t.type === 'checkbox' ? t.checked : t instanceof HTMLInputElement && t.type === 'range' ? Number(t.value) / 100 : t.value;
      this.update({ ...this.settings, [k]: v } as Settings);
    });
  }

  private update(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.onChange(s);
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  hide(): void {
    this.el.hidden = true;
  }

  show(): void {
    const s = this.settings;
    const range = (name: keyof Settings, label: string) =>
      `<label>${label} <input type="range" name="${name}" min="0" max="100" value="${Math.round((s[name] as number) * 100)}" /></label>`;
    const check = (name: keyof Settings, label: string) =>
      `<label class="check"><input type="checkbox" name="${name}" ${s[name] ? 'checked' : ''} /> ${label}</label>`;
    this.el.innerHTML = `<div class="panel settings-box" role="dialog" aria-label="Einstellungen">
      <header><h2>Einstellungen</h2><button type="button" class="x" data-close aria-label="Schließen">✕</button></header>
      <section><h3>Klang</h3>
        ${range('master', 'Gesamt')} ${range('sfx', 'Effekte')} ${range('music', 'Musik')} ${check('musicOn', 'Musik an')}
      </section>
      <section><h3>Darstellung</h3>
        <label>Animationen <select name="animations">
          <option value="fast" ${s.animations === 'fast' ? 'selected' : ''}>schnell</option>
          <option value="normal" ${s.animations === 'normal' ? 'selected' : ''}>normal</option>
          <option value="off" ${s.animations === 'off' ? 'selected' : ''}>aus (reduzierte Bewegung)</option>
        </select></label>
        ${check('highContrast', 'Hoher Kontrast')} ${check('largeText', 'Große Schrift')} ${check('colorblind', 'Farben für Farbsehschwäche')}
      </section>
      <section><button type="button" data-act="tutorial">Tutorial erneut zeigen</button></section>
    </div>`;
    this.el.hidden = false;
  }
}

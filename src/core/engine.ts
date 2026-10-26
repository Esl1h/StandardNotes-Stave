import { type Extension } from '@codemirror/state';

/**
 * The contract between the UI and a notation engine
 * (docs/adr/0009-engine-interface.md). The menu, the toolbar and the panes
 * only see these types; adding a notation must not need UI changes.
 */

export type Dur = 1 | 2 | 4 | 8 | 16 | 32 | 64;

export type HeaderKey = 'title' | 'composer' | 'meter' | 'key' | 'tempo' | 'clef';

/** A toolbar action, in notation-neutral terms; the engine writes its syntax. */
export type Cmd =
  // An empty pitch lets the engine pick one: the pitch of the note before
  // the cursor, or one near the middle of the staff.
  | { kind: 'note'; pitch: string; dur: Dur; dotted?: boolean }
  | { kind: 'rest'; dur: Dur; dotted?: boolean }
  | { kind: 'accidental'; value: 'sharp' | 'flat' | 'natural' }
  // dot lengthens the note before the cursor by half.
  | { kind: 'tie' | 'dot' | 'bar' | 'doubleBar' | 'repeatStart' | 'repeatEnd' }
  | { kind: 'chord'; symbol: string }
  | { kind: 'header'; key: HeaderKey; value: string }
  | { kind: 'technique'; id: string };

/** Where a command is inserted, so the engine can adapt the snippet. */
export interface CursorCtx {
  /** The whole source. */
  src: string;
  /** Selection, as offsets into src; equal when nothing is selected. */
  from: number;
  to: number;
}

/** What to put into the source: replaces [from, to) with insert. */
export interface Edit {
  from: number;
  to: number;
  insert: string;
  /** Cursor offset after the edit; the end of the insert by default. */
  cursor?: number;
}

export interface ThemeColors {
  foreground: string;
  background: string;
  /** Secondary text, lines that should recede (staff lines, bar numbers). */
  neutral: string;
  /** Selection, playback cursor and highlighted notes. */
  accent: string;
  danger: string;
}

export interface RenderOpts {
  theme: ThemeColors;
  /** 1 is the engine's natural size. */
  zoom: number;
}

export interface SourceError {
  message: string;
  /** 1-based, like editors show them. */
  line: number;
  column: number;
  /** Offsets into the source, when the engine knows them. */
  from?: number;
  to?: number;
}

export interface RenderResult {
  errors: SourceError[];
}

export interface PlayerState {
  playing: boolean;
  /** Tempo multiplier, 1 is as written. */
  speed: number;
  loop: boolean;
}

export interface Player {
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  setSpeed(speed: number): void;
  setLoop(loop: boolean): void;
  onStateChange(cb: (state: PlayerState) => void): void;
}

export type ExportFormat = 'svg' | 'png' | 'midi' | 'pdf' | 'gp7';

export interface EngineInstance {
  render(src: string): Promise<RenderResult>;
  /** Reports the source range of the element clicked in the rendering. */
  onSourceClick?(cb: (range: [number, number]) => void): void;
  /** Highlights the rendered elements of a source range. */
  highlight?(range: [number, number]): void;
  player?: Player;
  /** The source rewritten a number of semitones up or down. */
  transpose?(src: string, semitones: number): Promise<string>;
  /** Formats this instance can export. */
  exportFormats?: ExportFormat[];
  export?(fmt: ExportFormat): Promise<Blob>;
  setTheme(theme: ThemeColors): void;
  setZoom?(zoom: number): void;
  destroy(): void;
}

/** Music symbols the toolbar can draw (src/components/MusicIcon.tsx). */
export type MusicIcon =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'rest'
  | 'dot'
  | 'sharp'
  | 'flat'
  | 'natural'
  | 'tie'
  | 'bar'
  | 'doubleBar'
  | 'repeatStart'
  | 'repeatEnd';

export interface ToolDef {
  id: string;
  label: string;
  /** A drawn music symbol for the button; glyph (text) when absent. */
  icon?: MusicIcon;
  /** Short text for the button when there is no icon. */
  glyph?: string;
  /** Keyboard shortcut shown in the tooltip, as in the Help menu. */
  shortcut?: string;
  cmd: Cmd;
  /** Toolbar group; tools of one group sit together. */
  group: string;
}

export interface CheatsheetSection {
  title: string;
  rows: Array<{ syntax: string; meaning: string }>;
}

export interface Engine {
  id: string;
  label: string;
  /** File extension used when the source is downloaded. */
  extension: string;
  detect(src: string): boolean;
  /** The piece's title, for the notes list preview. */
  title(src: string): string | undefined;
  template(): string;
  emit(cmd: Cmd, ctx: CursorCtx): Edit;
  /** Loads the renderer chunk and draws into el. */
  mount(el: HTMLElement, opts: RenderOpts): Promise<EngineInstance>;
  tools(): ToolDef[];
  cheatsheet(): CheatsheetSection[];
  /** Syntax highlighting and completion for the source pane. */
  language?(): Extension;
}

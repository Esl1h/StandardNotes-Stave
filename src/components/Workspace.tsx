import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type EditorView } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Menu as MenuIcon,
  Pause,
  Play,
  Repeat,
  Square,
} from 'lucide-react';
import {
  type Cmd,
  type Engine,
  type EngineInstance,
  type ExportFormat,
  type PlayerState,
  type SourceError,
} from '../core/engine';
import { clampZoom, readPreferences, writePreference, type Preferences } from '../core/preferences';
import { themeColors, watchTheme } from '../core/theme';
import { shortcutFor, SHORTCUT_HELP, type ShortcutAction } from '../core/shortcuts';
import { downloadFile, fileNameFor } from '../core/download';
import { detectEngine, engineById, ENGINES } from '../engines/registry';
import MenuBar, { type MenuDef, type MenuItem } from './MenuBar';
import Toolbar from './Toolbar';
import SourcePane, { changedRange } from './SourcePane';
import RenderPane from './RenderPane';
import Dialog from './Dialog';

declare const __APP_VERSION__: string;

interface WorkspaceProps {
  rawText: string;
  /** Bumped on every note switch. */
  epoch: number;
  locked: boolean;
  /** Phones and tablets: bars start collapsed. */
  mobile: boolean;
  onTextChange: (text: string) => void;
}

const EXPORT_LABELS: Record<ExportFormat, string> = {
  svg: 'SVG image',
  png: 'PNG image',
  midi: 'MIDI file',
  pdf: 'Print or PDF',
  gp7: 'Guitar Pro 7',
};

const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  svg: 'svg',
  png: 'png',
  midi: 'mid',
  pdf: 'pdf',
  gp7: 'gp',
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
const STOPPED: PlayerState = { playing: false, speed: 1, loop: false };
const NO_ERRORS: SourceError[] = [];

type DialogName = 'cheatsheet' | 'shortcuts' | 'about' | { switchTo: string };

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const ctrl = isMac ? '⌘' : 'Ctrl+';

/**
 * The editor: menu bar, toolbar, source and rendering. It owns the layout
 * preferences and the engine of the open note, and turns menu, toolbar and
 * keyboard actions into source edits or engine calls.
 */
function Workspace({ rawText, epoch, locked, mobile, onTextChange }: WorkspaceProps) {
  const [prefs, setPrefs] = useState<Preferences>(() => readPreferences(mobile));
  const [override, setOverride] = useState<{ epoch: number; id: string } | null>(null);
  const [theme, setTheme] = useState(themeColors);
  // Kept with the engine that reported them, so another engine starts clean.
  const [reported, setReported] = useState<{ engine?: Engine; errors: SourceError[] }>({
    errors: [],
  });
  const [selection, setSelection] = useState<[number, number] | undefined>();
  const [instance, setInstance] = useState<EngineInstance | null>(null);
  // Kept with the instance that reported it, so a new renderer starts stopped.
  const [played, setPlayed] = useState<{ instance?: EngineInstance; state: PlayerState }>({
    state: STOPPED,
  });
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [playFailure, setPlayFailure] = useState<{ instance: EngineInstance; message: string }>();
  const viewRef = useRef<EditorView | null>(null);

  const engine: Engine | undefined = useMemo(() => {
    const chosen = override?.epoch === epoch ? engineById(override.id) : undefined;
    return chosen ?? detectEngine(rawText, prefs.defaultEngine);
  }, [override, epoch, rawText, prefs.defaultEngine]);
  const empty = rawText.trim() === '';
  const editable = !locked;

  const setPref = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    writePreference(key, value);
    setPrefs((current) => ({ ...current, [key]: value }));
  }, []);

  useEffect(() => watchTheme(() => setTheme(themeColors())), []);

  const errors = reported.engine === engine ? reported.errors : NO_ERRORS;
  const player = played.instance === instance && instance ? played.state : STOPPED;

  useEffect(() => {
    if (instance?.player) {
      instance.player.onStateChange((state) => setPlayed({ instance, state }));
    }
  }, [instance]);

  /** Replaces the selection through CodeMirror, so it is undoable and saved. */
  const applyCmd = useCallback(
    (cmd: Cmd) => {
      const view = viewRef.current;
      if (!engine || !view || !editable) {
        return;
      }
      const { from, to } = view.state.selection.main;
      const edit = engine.emit(cmd, { src: view.state.doc.toString(), from, to });
      view.dispatch({
        changes: { from: edit.from, to: edit.to, insert: edit.insert },
        selection: { anchor: edit.cursor ?? edit.from + edit.insert.length },
        scrollIntoView: true,
        userEvent: 'input.toolbar',
      });
      view.focus();
    },
    [engine, editable]
  );

  /** Rewrites the whole source as one undoable edit, keeping what is unchanged. */
  const transpose = useCallback(
    async (semitones: number) => {
      const view = viewRef.current;
      if (!instance?.transpose || !view || !editable) return;
      const current = view.state.doc.toString();
      const next = await instance.transpose(current, semitones);
      if (viewRef.current !== view || view.state.doc.toString() !== current || next === current) {
        return;
      }
      view.dispatch({ changes: changedRange(current, next), userEvent: 'input.transpose' });
    },
    [instance, editable]
  );

  const startWith = (next: Engine) => {
    setPref('defaultEngine', next.id);
    onTextChange(next.template());
  };

  const chooseEngine = (id: string) => {
    const next = engineById(id);
    if (!next || next === engine) {
      return;
    }
    if (empty) {
      startWith(next);
    } else {
      setDialog({ switchTo: id });
    }
  };

  const togglePlay = useCallback(() => {
    const active = instance?.player;
    if (!active) return;
    if (player.playing) active.pause();
    else {
      setPlayFailure(undefined);
      active.play().catch((error: Error) => setPlayFailure({ instance, message: error.message }));
    }
  }, [instance, player.playing]);

  const exportAs = useCallback(
    async (fmt: ExportFormat) => {
      if (!engine || !instance?.export) return;
      const blob = await instance.export(fmt);
      downloadFile(blob, fileNameFor(engine.title(rawText), EXPORT_EXTENSIONS[fmt]));
    },
    [engine, instance, rawText]
  );

  const runShortcut = useCallback(
    (action: ShortcutAction) => {
      switch (action.type) {
        case 'note':
          return applyCmd({ kind: 'note', pitch: '', dur: action.dur });
        case 'rest':
          return applyCmd({ kind: 'rest', dur: 4 });
        case 'dot':
          return applyCmd({ kind: 'dot' });
        case 'bar':
          return applyCmd({ kind: 'bar' });
        case 'playPause':
          return togglePlay();
        case 'transpose':
          return void transpose(action.semitones);
        case 'export': {
          const first = instance?.exportFormats?.[0];
          return first ? void exportAs(first) : undefined;
        }
        case 'toggleSplit':
          return setPref('view', prefs.view === 'split' ? 'source' : 'split');
        case 'toggleBars': {
          const show = !(prefs.menuBar || prefs.toolbar);
          setPref('menuBar', show);
          return setPref('toolbar', show);
        }
      }
    },
    [applyCmd, togglePlay, transpose, instance, exportAs, setPref, prefs]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || dialog) return;
      const target = event.target as HTMLElement | null;
      const inEditor = !!target?.closest('.cm-editor');
      // Buttons, menus and fields keep their own keys.
      if (!inEditor && target?.closest('input, select, textarea, [role^="menu"], button')) {
        if (!(event.ctrlKey || event.metaKey)) return;
      }
      const action = shortcutFor(event, inEditor);
      if (action) {
        event.preventDefault();
        runShortcut(action);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [runShortcut, dialog]);

  const zoomBy = (step: number) => setPref('zoom', clampZoom(prefs.zoom + step));
  const check = (label: string, checked: boolean, onSelect: () => void, shortcut?: string) =>
    ({ label, checked, onSelect, shortcut }) as MenuItem;

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        ...ENGINES.map((each) => ({
          label: `New ${each.label} from template`,
          disabled: !editable,
          onSelect: () => (empty ? startWith(each) : setDialog({ switchTo: each.id })),
        })),
        'separator',
        {
          label: 'Download source',
          disabled: !engine,
          onSelect: () =>
            engine && downloadFile(rawText, fileNameFor(engine.title(rawText), engine.extension)),
        },
        ...(instance?.exportFormats ?? []).map((fmt, index) => ({
          label: `Export ${EXPORT_LABELS[fmt]}`,
          shortcut: index === 0 ? `${ctrl}Shift+E` : undefined,
          onSelect: () => void exportAs(fmt),
        })),
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: `${ctrl}Z`,
          disabled: !editable,
          onSelect: () => viewRef.current && undo(viewRef.current),
        },
        {
          label: 'Redo',
          shortcut: `${ctrl}Shift+Z`,
          disabled: !editable,
          onSelect: () => viewRef.current && redo(viewRef.current),
        },
        'separator',
        {
          label: 'Transpose up',
          shortcut: `${ctrl}Up`,
          disabled: !instance?.transpose || !editable,
          onSelect: () => void transpose(1),
        },
        {
          label: 'Transpose down',
          shortcut: `${ctrl}Down`,
          disabled: !instance?.transpose || !editable,
          onSelect: () => void transpose(-1),
        },
        'separator',
        {
          label: 'Insert title',
          disabled: !engine || !editable,
          onSelect: () => applyCmd({ kind: 'header', key: 'title', value: 'Title' }),
        },
        {
          label: 'Insert composer',
          disabled: !engine || !editable,
          onSelect: () => applyCmd({ kind: 'header', key: 'composer', value: 'Composer' }),
        },
        {
          label: 'Insert tempo',
          disabled: !engine || !editable,
          onSelect: () => applyCmd({ kind: 'header', key: 'tempo', value: '120' }),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        check('Split', prefs.view === 'split', () => setPref('view', 'split'), `${ctrl}\\`),
        check('Source only', prefs.view === 'source', () => setPref('view', 'source')),
        check('Rendering only', prefs.view === 'render', () => setPref('view', 'render')),
        'separator',
        check('Side by side', prefs.orientation === 'side', () => setPref('orientation', 'side')),
        check('Stacked', prefs.orientation === 'stacked', () => setPref('orientation', 'stacked')),
        check('Rendering first', prefs.swapped, () => setPref('swapped', !prefs.swapped)),
        'separator',
        { label: 'Zoom in', onSelect: () => zoomBy(0.1) },
        { label: 'Zoom out', onSelect: () => zoomBy(-0.1) },
        {
          label: `Reset zoom (${Math.round(prefs.zoom * 100)}%)`,
          onSelect: () => setPref('zoom', 1),
        },
        ...(instance?.views?.length
          ? [
              'separator' as const,
              ...instance.views.map((each) =>
                check(each.label, (prefs.renderView || instance.views?.[0].id) === each.id, () =>
                  setPref('renderView', each.id)
                )
              ),
            ]
          : []),
        'separator',
        check('Toolbar', prefs.toolbar, () => setPref('toolbar', !prefs.toolbar)),
        {
          label: 'Hide the bars',
          shortcut: `${ctrl}Shift+M`,
          onSelect: () => runShortcut({ type: 'toggleBars' }),
        },
      ],
    },
    {
      id: 'play',
      label: 'Play',
      items: [
        {
          label: player.playing ? 'Pause' : 'Play',
          shortcut: 'Space',
          disabled: !instance?.player,
          onSelect: togglePlay,
        },
        { label: 'Stop', disabled: !instance?.player, onSelect: () => instance?.player?.stop() },
        check('Loop', player.loop, () => instance?.player?.setLoop(!player.loop)),
        'separator',
        ...SPEEDS.map((speed) =>
          check(`Speed ${speed * 100}%`, player.speed === speed, () =>
            instance?.player?.setSpeed(speed)
          )
        ),
        ...(player.tracks?.length
          ? [
              'separator' as const,
              ...player.tracks.flatMap((track, index) => {
                const name = track.name || `Track ${index + 1}`;
                return [
                  check(`Mute ${name}`, track.muted, () =>
                    instance?.player?.setTrackMute?.(index, !track.muted)
                  ),
                  check(`Solo ${name}`, track.solo, () =>
                    instance?.player?.setTrackSolo?.(index, !track.solo)
                  ),
                ];
              }),
            ]
          : []),
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        {
          label: `${engine?.label ?? 'Notation'} cheat sheet`,
          disabled: !engine,
          onSelect: () => setDialog('cheatsheet'),
        },
        { label: 'Keyboard shortcuts', onSelect: () => setDialog('shortcuts') },
        { label: 'About Stave', onSelect: () => setDialog('about') },
      ],
    },
  ];

  const engineSelect = (
    <label className="engine-select">
      <span className="visually-hidden">Notation</span>
      <select
        value={engine?.id ?? ''}
        disabled={!editable || ENGINES.length === 0}
        onChange={(event) => chooseEngine(event.target.value)}
      >
        {!engine && <option value="">None</option>}
        {ENGINES.map((each) => (
          <option key={each.id} value={each.id}>
            {each.label}
          </option>
        ))}
      </select>
    </label>
  );

  const transposeTools = instance?.transpose ? (
    <div className="toolbar-group" role="group" aria-label="Transpose">
      <button
        type="button"
        className="tool"
        aria-label="Transpose down"
        title={`Transpose down (${ctrl}Down)`}
        disabled={!editable}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void transpose(-1)}
      >
        <ArrowDown size={16} />
      </button>
      <button
        type="button"
        className="tool"
        aria-label="Transpose up"
        title={`Transpose up (${ctrl}Up)`}
        disabled={!editable}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void transpose(1)}
      >
        <ArrowUp size={16} />
      </button>
    </div>
  ) : null;

  const playback = instance?.player ? (
    <div className="toolbar-group" role="group" aria-label="Playback">
      <button
        type="button"
        className="tool"
        aria-label={player.playing ? 'Pause' : 'Play'}
        title={`${player.playing ? 'Pause' : 'Play'} (Space)`}
        onClick={togglePlay}
      >
        {player.playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button
        type="button"
        className="tool"
        aria-label="Stop"
        title="Stop"
        onClick={() => instance.player?.stop()}
      >
        <Square size={16} />
      </button>
      <button
        type="button"
        className={`tool${player.loop ? ' active' : ''}`}
        aria-label="Loop"
        aria-pressed={player.loop}
        title="Loop"
        onClick={() => instance.player?.setLoop(!player.loop)}
      >
        <Repeat size={16} />
      </button>
      <label className="speed">
        <span className="visually-hidden">Speed</span>
        <select
          value={player.speed}
          onChange={(event) => instance.player?.setSpeed(Number(event.target.value))}
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed * 100}%
            </option>
          ))}
        </select>
      </label>
    </div>
  ) : null;

  const source = (
    <div className="pane source-pane" key="source">
      <SourcePane
        rawText={rawText}
        epoch={epoch}
        readOnly={!editable}
        language={engine?.language?.() ?? []}
        errors={errors}
        onTextChange={onTextChange}
        onSelection={(from, to) => setSelection([from, to])}
        onView={(view) => {
          viewRef.current = view;
        }}
      />
    </div>
  );

  const rendering = (
    <div className="pane render-pane" key="render">
      {empty && editable && ENGINES.length > 0 ? (
        <div className="start">
          <p>Start a new piece in:</p>
          {ENGINES.map((each) => (
            <button type="button" key={each.id} onClick={() => startWith(each)}>
              {each.label}
            </button>
          ))}
        </div>
      ) : (
        <RenderPane
          engine={engine}
          src={rawText}
          theme={theme}
          zoom={prefs.zoom}
          view={prefs.renderView}
          highlight={selection}
          onErrors={(list) => setReported({ engine, errors: list })}
          onInstance={setInstance}
          onSourceClick={([from, to]) => {
            const view = viewRef.current;
            if (!view) return;
            const length = view.state.doc.length;
            view.dispatch({
              selection: { anchor: Math.min(from, length), head: Math.min(to, length) },
              scrollIntoView: true,
            });
            // The selection shows, and typing goes to the clicked note.
            view.focus();
          }}
        />
      )}
    </div>
  );

  const panes =
    prefs.view === 'source'
      ? [source]
      : prefs.view === 'render'
        ? [rendering]
        : prefs.swapped
          ? [rendering, source]
          : [source, rendering];

  return (
    <div className={`workspace view-${prefs.view}`}>
      {prefs.menuBar ? (
        <MenuBar
          menus={menus}
          trailing={
            <>
              {engineSelect}
              <button
                type="button"
                className="icon-button"
                aria-label="Hide the bars"
                title={`Hide the bars (${ctrl}Shift+M)`}
                onClick={() => runShortcut({ type: 'toggleBars' })}
              >
                <ChevronUp size={16} />
              </button>
            </>
          }
        />
      ) : (
        <div className="menu-bar collapsed">
          <button
            type="button"
            className="icon-button"
            aria-label="Show the menu"
            title={`Show the menu (${ctrl}Shift+M)`}
            onClick={() => setPref('menuBar', true)}
          >
            <MenuIcon size={16} />
          </button>
          {playback}
          <div className="spacer" />
          {engineSelect}
        </div>
      )}
      {prefs.menuBar && prefs.toolbar && (
        <Toolbar
          tools={engine?.tools() ?? []}
          editable={editable}
          onTool={applyCmd}
          trailing={
            <>
              {transposeTools}
              {transposeTools && playback && (
                <span className="toolbar-separator" aria-hidden="true" />
              )}
              {playback}
            </>
          }
        />
      )}
      {prefs.menuBar && !prefs.toolbar && (
        <button
          type="button"
          className="toolbar-show"
          aria-label="Show the toolbar"
          title="Show the toolbar"
          onClick={() => setPref('toolbar', true)}
        >
          <ChevronDown size={14} />
        </button>
      )}
      {locked && (
        <p className="locked-notice" role="status">
          This note is locked: it can be read and played, not edited.
        </p>
      )}
      {playFailure && playFailure.instance === instance && (
        <p className="play-error" role="alert">
          Playback failed: {playFailure.message}
        </p>
      )}
      <div className={`panes orientation-${prefs.orientation} count-${panes.length}`}>{panes}</div>
      {dialog === 'cheatsheet' && engine && (
        <Dialog title={`${engine.label} cheat sheet`} onClose={() => setDialog(null)}>
          {engine.cheatsheet().map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <dl className="cheatsheet">
                {section.rows.map((row) => (
                  <React.Fragment key={row.syntax}>
                    <dt>
                      <code>{row.syntax}</code>
                    </dt>
                    <dd>{row.meaning}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          ))}
        </Dialog>
      )}
      {dialog === 'shortcuts' && (
        <Dialog title="Keyboard shortcuts" onClose={() => setDialog(null)}>
          <dl className="cheatsheet">
            {SHORTCUT_HELP.map((row) => (
              <React.Fragment key={row.keys}>
                <dt>
                  <kbd>{row.keys.replace(/Ctrl\+/g, ctrl)}</kbd>
                </dt>
                <dd>{row.action}</dd>
              </React.Fragment>
            ))}
          </dl>
        </Dialog>
      )}
      {dialog === 'about' && (
        <Dialog title="About Stave" onClose={() => setDialog(null)}>
          <p>
            Stave {__APP_VERSION__}, a music notation editor for Standard Notes. Free software under
            the GNU Affero General Public License 3.0 or later.
          </p>
          <p>
            Source code and third-party licenses:{' '}
            <a href="https://github.com/Esl1h/StandardNotes-Stave" target="_blank" rel="noreferrer">
              github.com/Esl1h/StandardNotes-Stave
            </a>
            , and <a href="./THIRD_PARTY_LICENSES.md">THIRD_PARTY_LICENSES.md</a> next to this page.
          </p>
        </Dialog>
      )}
      {typeof dialog === 'object' && dialog && (
        <Dialog
          title={`Switch to ${engineById(dialog.switchTo)?.label}?`}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button type="button" onClick={() => setDialog(null)} data-autofocus>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setPref('defaultEngine', dialog.switchTo);
                  setOverride({ epoch, id: dialog.switchTo });
                  setDialog(null);
                }}
              >
                Switch
              </button>
            </>
          }
        >
          <p>
            The note is written in {engine?.label}. Its text is kept as it is, not converted, so it
            will show errors until it is rewritten in {engineById(dialog.switchTo)?.label}.
          </p>
        </Dialog>
      )}
    </div>
  );
}

export default Workspace;

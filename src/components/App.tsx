import React from 'react';
import { NoteBridge } from '../core/noteBridge';
import { setPreferenceStore } from '../core/preferences';
import { notePreview } from '../core/preview';
import { detectEngine } from '../engines/registry';
import ErrorBoundary from './ErrorBoundary';
import Workspace from './Workspace';

/** How long to wait for Standard Notes to stream the note before saying so */
const NOTE_WAIT_MS = 5000;

interface AppState {
  rawText: string;
  /** Bumped on every note switch; resets the source undo history */
  epoch: number;
  locked: boolean;
  /** True once Standard Notes has streamed the note in */
  noteReceived: boolean;
  /** True when no note arrived within NOTE_WAIT_MS */
  waitTimedOut: boolean;
}

const isMobile = (bridge: NoteBridge) =>
  /mobile/.test(bridge.environment ?? '') || ['ios', 'android'].includes(bridge.platform ?? '');

/** Connects to Standard Notes and shows the editor once the note arrives. */
export default class App extends React.Component<Record<string, never>, AppState> {
  bridge: NoteBridge;
  waitTimer?: ReturnType<typeof setTimeout>;

  constructor(props: Record<string, never>) {
    super(props);
    // Nothing is rendered until the note arrives: an editable placeholder
    // would take typing that has no note to be saved into.
    this.state = { rawText: '', epoch: 0, locked: false, noteReceived: false, waitTimedOut: false };
    this.bridge = new NoteBridge(
      {
        setEditorRawText: (text) => this.setState({ rawText: text, noteReceived: true }),
        clearUndoHistory: () => this.setState(({ epoch }) => ({ epoch: epoch + 1 })),
        setLocked: (locked) => {
          if (locked !== this.state.locked) this.setState({ locked });
        },
      },
      (text) => notePreview(text, detectEngine(text))
    );
    // Preferences live in the component data, which the app keeps on the
    // component item; localStorage alone is lost in sandboxed iframe origins.
    setPreferenceStore({
      get: (key) => this.bridge.getPreference(key),
      set: (key, value) => this.bridge.setPreference(key, value),
    });
  }

  componentDidMount() {
    this.waitTimer = setTimeout(() => this.setState({ waitTimedOut: true }), NOTE_WAIT_MS);
  }

  componentWillUnmount() {
    clearTimeout(this.waitTimer);
  }

  handleTextChange = (rawText: string) => {
    this.setState({ rawText });
    this.bridge.onEditorValueChanged(rawText);
  };

  render() {
    if (!this.state.noteReceived) {
      return (
        <div className="note-status" role="status">
          {this.state.waitTimedOut
            ? 'The note was not received from Standard Notes. Close and reopen it, or restart the app.'
            : 'Waiting for the note...'}
        </div>
      );
    }
    return (
      <ErrorBoundary
        rawText={this.state.rawText}
        onRawTextChange={this.handleTextChange}
        resetKey={this.state.epoch}
      >
        <Workspace
          rawText={this.state.rawText}
          epoch={this.state.epoch}
          locked={this.state.locked}
          mobile={isMobile(this.bridge)}
          onTextChange={this.handleTextChange}
        />
      </ErrorBoundary>
    );
  }
}

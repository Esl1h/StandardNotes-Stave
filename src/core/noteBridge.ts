import ComponentRelay from '../vendor/component-relay/ComponentRelay';
import { EchoGuard } from './echoGuard';

/**
 * Plain-text note bridge to Standard Notes over the component relay, as in
 * the Kanban plugin: streams the note in, saves the text with its preview,
 * and keeps the editor's preferences in the component data.
 */

export interface StreamedNote {
  uuid: string;
  isMetadataUpdate?: boolean;
  content: {
    text?: string;
    preview_plain?: string;
    preview_html?: string;
    appData?: Record<string, Record<string, unknown> | undefined>;
  };
}

export interface NoteBridgeDelegate {
  setEditorRawText(text: string, noteId: string): void;
  clearUndoHistory(): void;
  /** Called on every stream, metadata updates included: locking is one. */
  setLocked(locked: boolean): void;
}

// The part of ComponentRelay used here; tests pass a fake.
export interface Relay {
  streamContextItem(callback: (note: StreamedNote) => void): void;
  saveItemWithPresave(note: StreamedNote, presave: () => void): void;
  getComponentDataValueForKey(key: string): unknown;
  setComponentDataValueForKey(key: string, value: unknown): void;
  readonly environment?: string;
  readonly platform?: string;
}

const createRelay = (): Relay => {
  const relay: ComponentRelay = new ComponentRelay({
    targetWindow: window,
    options: { coallesedSaving: true, coallesedSavingDelay: 350 },
    onReady: () => {
      if (relay.platform) {
        document.documentElement.classList.add(relay.platform);
      }
    },
    handleRequestForContentHeight: () => undefined,
  });
  return relay as unknown as Relay;
};

const isLocked = (note: StreamedNote): boolean =>
  note.content?.appData?.['org.standardnotes.sn']?.locked === true;

export class NoteBridge {
  private note?: StreamedNote;
  private echoGuard = new EchoGuard();
  // What the editor last saved; the text the user is looking at.
  private lastSaved?: string;
  // The note whose text the editor shows. A metadata-only stream of the
  // next note can arrive before its text, so this.note alone cannot tell
  // when the text switches notes.
  private shownNoteId?: string;

  constructor(
    private delegate: NoteBridgeDelegate,
    private preview: (text: string) => string,
    private relay: Relay = createRelay()
  ) {
    relay.streamContextItem((note) => {
      this.note = note;
      this.delegate.setLocked(isLocked(note));
      if (note.isMetadataUpdate) {
        return;
      }
      const isNewNote = this.shownNoteId !== note.uuid;
      this.shownNoteId = note.uuid;
      const text = note.content?.text || '';
      if (isNewNote) {
        this.lastSaved = undefined;
      }
      if (this.echoGuard.isStaleEcho(note.uuid, text, this.lastSaved ?? text)) {
        return;
      }
      this.delegate.setEditorRawText(text, note.uuid);
      if (isNewNote) {
        this.delegate.clearUndoHistory();
      }
    });
  }

  get environment(): string | undefined {
    return this.relay.environment;
  }

  get platform(): string | undefined {
    return this.relay.platform;
  }

  /** Reads a value the app keeps on the component item (not on the note). */
  getPreference(key: string): unknown {
    return this.relay.getComponentDataValueForKey(key);
  }

  setPreference(key: string, value: unknown): void {
    this.relay.setComponentDataValueForKey(key, value);
  }

  onEditorValueChanged(text: string): void {
    const note = this.note;
    if (!note || isLocked(note)) {
      return;
    }
    this.lastSaved = text;
    this.echoGuard.recordSave(text);
    this.relay.saveItemWithPresave(note, () => {
      note.content.text = text;
      note.content.preview_plain = this.preview(text);
      note.content.preview_html = undefined;
    });
  }
}

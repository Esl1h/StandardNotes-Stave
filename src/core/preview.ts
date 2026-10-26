import { type Engine } from './engine';

export const PREVIEW_LIMIT = 160;

// One line, never empty: an empty preview makes the app show the whole text.
export const truncatePreview = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') {
    return ' ';
  }
  return flat.length > PREVIEW_LIMIT ? `${flat.slice(0, PREVIEW_LIMIT - 1)}…` : flat;
};

/**
 * The notes list preview: "Title · ABC" when the engine finds a title,
 * otherwise the start of the text.
 */
export const notePreview = (text: string, engine: Engine | undefined): string => {
  const title = engine?.detect(text) ? engine.title(text) : undefined;
  return truncatePreview(title ? `${title} · ${engine!.label}` : text);
};

import React from 'react';
import { type Cmd, type ToolDef } from '../core/engine';
import MusicIcon from './MusicIcon';

interface ToolbarProps {
  tools: ToolDef[];
  /** A locked note can be read and played, not edited. */
  editable: boolean;
  onTool: (cmd: Cmd) => void;
  /** Controls at the end of the bar that do not edit (playback). */
  trailing?: React.ReactNode;
}

/** Tools grouped as the engine lists them, a separator between groups. */
export const groupTools = (tools: ToolDef[]): ToolDef[][] => {
  const groups: ToolDef[][] = [];
  for (const tool of tools) {
    const last = groups[groups.length - 1];
    if (last && last[0].group === tool.group) {
      last.push(tool);
    } else {
      groups.push([tool]);
    }
  }
  return groups;
};

/** The contextual toolbar: the active engine's tools, which insert syntax. */
function Toolbar({ tools, editable, onTool, trailing }: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Notation tools">
      {groupTools(tools).map((group, index) => (
        <React.Fragment key={group[0].group}>
          {index > 0 && <span className="toolbar-separator" aria-hidden="true" />}
          <div className="toolbar-group" role="group" aria-label={group[0].group}>
            {group.map((tool) => (
              <button
                type="button"
                key={tool.id}
                className="tool"
                aria-label={tool.label}
                title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                disabled={!editable}
                // Keep the focus (and the selection) in the source editor.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onTool(tool.cmd)}
              >
                {tool.icon ? (
                  <MusicIcon name={tool.icon} />
                ) : (
                  <span aria-hidden="true">{tool.glyph}</span>
                )}
              </button>
            ))}
          </div>
        </React.Fragment>
      ))}
      <div className="spacer" />
      {trailing}
    </div>
  );
}

export default Toolbar;

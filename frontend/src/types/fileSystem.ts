/**
 * Shared structural typing for the Chromium File System Access API.
 *
 * Previously `LocalFileHandle` was declared TWICE — once in
 * `PropertiesPanel.tsx` (without `createWritable`) and once in
 * `WorkspaceEditorPage.tsx` (with it). TypeScript treated them as two unrelated
 * nominal types, so passing the panel's `onFileSelected` handler to the editor
 * was a hard compile error. One declaration, imported by both, removes the
 * whole class of problem.
 *
 * A handle lets the executor re-read a picked file's CURRENT bytes before each
 * node (so chained writes accumulate) and write updated workbooks back to the
 * original file on disk instead of downloading a copy.
 */

export interface LocalFileWritable {
  write: (data: Blob | ArrayBuffer | string) => Promise<void>;
  close: () => Promise<void>;
}

export interface LocalFileHandle {
  name: string;
  getFile: () => Promise<File>;
  /**
   * Present on real File System Access handles. Optional so a handle obtained
   * from a read-only picker still satisfies the type.
   */
  createWritable?: () => Promise<LocalFileWritable>;
  queryPermission?: (
    descriptor?: { mode?: 'read' | 'readwrite' }
  ) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (
    descriptor?: { mode?: 'read' | 'readwrite' }
  ) => Promise<'granted' | 'denied' | 'prompt'>;
}

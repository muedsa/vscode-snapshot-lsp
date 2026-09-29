import * as vscode from 'vscode';
import { scanHighlights, type HighlightCatalog, type HighlightKind, type HighlightSpan } from './highlight';

const colorIds: Record<HighlightKind, string> = {
  tag: 'snapshot.tagName',
  attribute: 'snapshot.attributeName',
  string: 'snapshot.string',
  color: 'snapshot.colorValue',
  number: 'snapshot.numberValue',
  boolean: 'snapshot.booleanValue',
  enum: 'snapshot.enumValue',
  comment: 'snapshot.comment',
  cdata: 'snapshot.cdata',
  punctuation: 'snapshot.punctuation',
};

const largeDocumentThreshold = 200_000;
const visibleMarginLines = 20;

export function registerSnapshotColorizer(context: vscode.ExtensionContext, catalog: HighlightCatalog): void {
  const decorations = Object.fromEntries(
    Object.entries(colorIds).map(([kind, id]) => [
      kind,
      vscode.window.createTextEditorDecorationType({ color: new vscode.ThemeColor(id) }),
    ]),
  ) as Record<HighlightKind, vscode.TextEditorDecorationType>;
  const cached = new WeakMap<
    vscode.TextDocument,
    { version: number; source: string; from: number; to: number; spans: HighlightSpan[] }
  >();
  const applied = new WeakMap<vscode.TextEditor, { version: number; from: number; to: number }>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const update = (editor: vscode.TextEditor) => {
    if (editor.document.languageId !== 'snapshot') {
      for (const decoration of Object.values(decorations)) editor.setDecorations(decoration, []);
      applied.delete(editor);
      return;
    }
    const ranges: Record<HighlightKind, vscode.Range[]> = {
      tag: [],
      attribute: [],
      string: [],
      color: [],
      number: [],
      boolean: [],
      enum: [],
      comment: [],
      cdata: [],
      punctuation: [],
    };
    let result = cached.get(editor.document);
    const source = result?.version === editor.document.version ? result.source : editor.document.getText();
    let from = 0;
    let to = source.length;
    if (to > largeDocumentThreshold && editor.visibleRanges.length) {
      const firstLine = Math.max(0, editor.visibleRanges[0].start.line - visibleMarginLines);
      const lastLine = Math.min(
        editor.document.lineCount - 1,
        editor.visibleRanges.at(-1)!.end.line + visibleMarginLines,
      );
      from = editor.document.offsetAt(new vscode.Position(firstLine, 0));
      const last = editor.document.lineAt(lastLine);
      to = editor.document.offsetAt(last.range.end);
    }
    if (!result || result.version !== editor.document.version || result.from !== from || result.to !== to) {
      result = {
        version: editor.document.version,
        source,
        from,
        to,
        spans: scanHighlights(source, catalog, { from, to }),
      };
      cached.set(editor.document, result);
    }
    const previous = applied.get(editor);
    if (previous?.version === result.version && previous.from === from && previous.to === to) return;
    for (const span of result.spans) {
      ranges[span.kind].push(
        new vscode.Range(editor.document.positionAt(span.start), editor.document.positionAt(span.end)),
      );
    }
    for (const kind of Object.keys(decorations) as HighlightKind[])
      editor.setDecorations(decorations[kind], ranges[kind]);
    applied.set(editor, { version: result.version, from, to });
  };
  const updateVisible = () => vscode.window.visibleTextEditors.forEach(update);

  context.subscriptions.push(
    ...Object.values(decorations),
    vscode.window.onDidChangeVisibleTextEditors(updateVisible),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (
        event.textEditor.document.languageId === 'snapshot' &&
        (cached.get(event.textEditor.document)?.source.length ?? 0) > largeDocumentThreshold
      )
        update(event.textEditor);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        event.document.languageId !== 'snapshot' ||
        event.contentChanges.length === 0 ||
        !vscode.window.visibleTextEditors.some((editor) => editor.document === event.document)
      )
        return;
      const key = event.document.uri.toString();
      const previous = pending.get(key);
      if (previous) clearTimeout(previous);
      pending.set(
        key,
        setTimeout(() => {
          pending.delete(key);
          for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document === event.document) update(editor);
          }
        }, 50),
      );
    }),
    vscode.workspace.onDidOpenTextDocument(updateVisible),
    new vscode.Disposable(() => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    }),
  );
  updateVisible();
}

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

export function registerSnapshotColorizer(context: vscode.ExtensionContext, catalog: HighlightCatalog): void {
  const decorations = Object.fromEntries(
    Object.entries(colorIds).map(([kind, id]) => [
      kind,
      vscode.window.createTextEditorDecorationType({ color: new vscode.ThemeColor(id) }),
    ]),
  ) as Record<HighlightKind, vscode.TextEditorDecorationType>;
  const cached = new WeakMap<vscode.TextDocument, { version: number; spans: HighlightSpan[] }>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const update = (editor: vscode.TextEditor) => {
    if (editor.document.languageId !== 'snapshot') {
      for (const decoration of Object.values(decorations)) editor.setDecorations(decoration, []);
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
    if (!result || result.version !== editor.document.version) {
      result = { version: editor.document.version, spans: scanHighlights(editor.document.getText(), catalog) };
      cached.set(editor.document, result);
    }
    for (const span of result.spans) {
      ranges[span.kind].push(
        new vscode.Range(editor.document.positionAt(span.start), editor.document.positionAt(span.end)),
      );
    }
    for (const kind of Object.keys(decorations) as HighlightKind[])
      editor.setDecorations(decorations[kind], ranges[kind]);
  };
  const updateVisible = () => vscode.window.visibleTextEditors.forEach(update);

  context.subscriptions.push(
    ...Object.values(decorations),
    vscode.window.onDidChangeVisibleTextEditors(updateVisible),
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

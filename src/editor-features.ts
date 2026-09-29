import * as vscode from 'vscode';
import { buildTagTree, formatIndentation, scanStructure, type SnapshotNode } from './structure';

function toDocumentSymbol(document: vscode.TextDocument, node: SnapshotNode): vscode.DocumentSymbol {
  const symbol = new vscode.DocumentSymbol(
    node.tag.name,
    '',
    vscode.SymbolKind.Object,
    new vscode.Range(document.positionAt(node.tag.start), document.positionAt(node.end)),
    new vscode.Range(
      document.positionAt(node.tag.nameStart),
      document.positionAt(node.tag.nameStart + node.tag.name.length),
    ),
  );
  symbol.children = node.children.map((child) => toDocumentSymbol(document, child));
  return symbol;
}

export function registerEditorFeatures(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [{ language: 'snapshot' }];
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(document) {
        return buildTagTree(scanStructure(document.getText()).tags).map((node) => toDocumentSymbol(document, node));
      },
    }),
    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      provideDocumentFormattingEdits(document, options) {
        const unit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
        return formatIndentation(document.getText(), unit).map(
          (edit) =>
            new vscode.TextEdit(
              new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)),
              edit.text,
            ),
        );
      },
    }),
  );
}

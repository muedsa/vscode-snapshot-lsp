import * as vscode from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';
import { registerSnapshotColorizer } from './colorizer';
import { registerEditorFeatures } from './editor-features';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const { tags } = await import('@muedsa/snapshot-lsp');
  registerSnapshotColorizer(context, tags);
  registerEditorFeatures(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('snapshot.restartLanguageServer', () => client?.restart()),
  );
  const serverModule = context.asAbsolutePath('dist/server.cjs');
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { execArgv: ['--inspect=6009'] },
    },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'snapshot' }],
  };

  client = new LanguageClient('snapshot', 'Snapshot LSP', serverOptions, clientOptions);
  await client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

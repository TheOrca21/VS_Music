import * as vscode from 'vscode';
import * as fs from 'fs';
import { MusicPanelProvider } from './panel';
import { PlayerController } from './player';
import { StatusBarController } from './statusBar';
import { Library } from './library';

export function activate(context: vscode.ExtensionContext) {
    console.log('VS-Music is active');
    const storagePath = context.globalStorageUri.fsPath;
    fs.mkdirSync(storagePath, { recursive: true });

    const library = new Library(storagePath);
    const player = new PlayerController(context.extensionUri);
    const provider = new MusicPanelProvider(context.extensionUri, player, library);

    new StatusBarController(player, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MusicPanelProvider.viewType,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Close DB cleanly when VS Code shuts down
    context.subscriptions.push({
        dispose: () => library.close()
    });
}

export function deactivate() {}

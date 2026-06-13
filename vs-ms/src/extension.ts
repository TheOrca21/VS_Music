import * as vscode from 'vscode';
import { MusicPanelProvider } from './panel';
import { PlayerController } from './player';
import { StatusBarController } from './statusBar';

export function activate(context: vscode.ExtensionContext) {
    console.log('VS-Music is active');

    const player = new PlayerController(context.extensionUri);
    const provider = new MusicPanelProvider(context.extensionUri, player);

    new StatusBarController(player, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MusicPanelProvider.viewType,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
}

export function deactivate() {}

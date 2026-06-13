import * as fs from 'fs';
import * as vscode from 'vscode';
import { PlayerController } from './player';

export class MusicPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vsmusic.playerView';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _player: PlayerController
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._player.bindWebview(webviewView);

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((message) => {
            this._player.handleWebviewMessage(message);
        });
    }

    private _getHtml(webview: vscode.Webview): string {
        const htmlPath = vscode.Uri.joinPath(
            this._extensionUri, 'src', 'webview', 'index.html'
        );
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'style.css')
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'ui.js')
        );
        const cspSource = webview.cspSource;

        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
        html = html.replaceAll('{{CSP_SOURCE}}', cspSource);
        html = html.replace('{{CSS_URI}}', cssUri.toString());
        html = html.replace('{{JS_URI}}', jsUri.toString());
        return html;
    }
}

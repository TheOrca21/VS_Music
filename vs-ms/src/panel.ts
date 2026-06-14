import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PlayerController } from './player';
import { Library } from './library';

export class MusicPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vsmusic.playerView';
    private _view?: vscode.WebviewView;
    /** Track the last drive root to avoid unnecessary webview reloads */
    private _lastDriveRoot: string | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _player: PlayerController,
        private readonly _library: Library 
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        // Build initial localResourceRoots — include saved folder if available
        const roots: vscode.Uri[] = [this._extensionUri];
        const savedFolder = this._library.getFolder();
        if (savedFolder) {
            const driveRoot = this._driveRoot(savedFolder);
            roots.push(driveRoot);
            this._lastDriveRoot = driveRoot.fsPath;
        }

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: roots
        };

        // Set the HTML FIRST — the webview JS must be loaded before we send messages
        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Wire up message handling
        webviewView.webview.onDidReceiveMessage((message) => {
            this._player.handleWebviewMessage(message);
        });

        // When the player state changes, check if the folder root changed.
        // IMPORTANT: only update webview.options when the drive root actually
        // changes — re-setting options causes VS Code to reload the webview!
        this._player.onStateChanged(() => {
            this._maybeUpdateResourceRoots();
        });

        // NOW bind the player (sets up library ref), then defer the
        // saved-library restore so the webview JS has time to initialize
        this._player.bindWebview(webviewView, this._library);
    }

    /**
     * Only update localResourceRoots when the drive root actually changed.
     * Setting webview.options causes VS Code to reload the webview entirely,
     * so we must avoid doing it on every state change.
     */
    private _maybeUpdateResourceRoots(): void {
        const view = this._view;
        if (!view) {
            return;
        }

        const folderPath = this._player.folderPath;
        if (!folderPath) {
            return; // no folder set, nothing to update
        }

        const newDriveRoot = this._driveRoot(folderPath).fsPath;
        if (newDriveRoot === this._lastDriveRoot) {
            return; // same drive root, skip the update to avoid webview reload
        }

        // Drive root changed — update options
        this._lastDriveRoot = newDriveRoot;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                this._driveRoot(folderPath)
            ]
        };
    }

    /**
     * Returns the drive root (e.g. D:\) on Windows or / on Unix
     * so that any sub-path within the same drive is accessible.
     */
    private _driveRoot(folderPath: string): vscode.Uri {
        const parsed = path.parse(folderPath);
        // parsed.root is "D:\\" on Windows or "/" on Unix
        return vscode.Uri.file(parsed.root);
    }

    private _getHtml(webview: vscode.Webview): string {
        const htmlPath = vscode.Uri.joinPath(
            this._extensionUri, 'webview', 'index.html'
        );
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'style.css')
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'ui.js')
        );
        const cspSource = webview.cspSource;

        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
        html = html.replaceAll('{{CSP_SOURCE}}', cspSource);
        html = html.replace('{{CSS_URI}}', cssUri.toString());
        html = html.replace('{{JS_URI}}', jsUri.toString());
        return html;
    }
}


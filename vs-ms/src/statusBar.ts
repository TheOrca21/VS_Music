import * as vscode from 'vscode';
import { PlayerController } from './player';

export class StatusBarController {
    private readonly _trackItem: vscode.StatusBarItem;
    private readonly _prevItem: vscode.StatusBarItem;
    private readonly _playItem: vscode.StatusBarItem;
    private readonly _stopItem: vscode.StatusBarItem;
    private readonly _nextItem: vscode.StatusBarItem;

    constructor(
        private readonly _player: PlayerController,
        context: vscode.ExtensionContext
    ) {
        this._trackItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this._prevItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        this._playItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            98
        );
        this._stopItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            97
        );
        this._nextItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            96
        );

        this._prevItem.text = '$(chevron-left)';
        this._prevItem.tooltip = 'Previous track';
        this._prevItem.command = 'vs-ms.prev';

        this._playItem.text = '$(debug-start)';
        this._playItem.tooltip = 'Play / Pause';
        this._playItem.command = 'vs-ms.playPause';

        this._stopItem.text = '$(debug-stop)';
        this._stopItem.tooltip = 'Stop';
        this._stopItem.command = 'vs-ms.stop';

        this._nextItem.text = '$(chevron-right)';
        this._nextItem.tooltip = 'Next track';
        this._nextItem.command = 'vs-ms.next';

        // add UI items
        context.subscriptions.push(
            this._trackItem,
            this._prevItem,
            this._playItem,
            this._stopItem,
            this._nextItem
        );

        // register commands with guards so clicking before loading a library doesn't throw
        context.subscriptions.push(
            vscode.commands.registerCommand('vs-ms.prev', () => {
                try {
                    if (!this._player.hasLibrary) {
                        void vscode.window.showInformationMessage('VS-Music: Load a folder first to use controls.');
                        return;
                    }
                    this._player.previous();
                } catch (err) {
                    console.error('Error running prev command', err);
                    void vscode.window.showErrorMessage('VS-Music: Could not run previous command');
                }
            }),
            vscode.commands.registerCommand('vs-ms.next', () => {
                try {
                    if (!this._player.hasLibrary) {
                        void vscode.window.showInformationMessage('VS-Music: Load a folder first to use controls.');
                        return;
                    }
                    this._player.next();
                } catch (err) {
                    console.error('Error running next command', err);
                    void vscode.window.showErrorMessage('VS-Music: Could not run next command');
                }
            }),
            vscode.commands.registerCommand('vs-ms.playPause', () => {
                try {
                    if (!this._player.hasLibrary) {
                        void vscode.window.showInformationMessage('VS-Music: Load a folder first to use controls.');
                        return;
                    }
                    // ask the webview to toggle playback (mirrors side-panel behavior)
                    this._player.requestTogglePlayback();
                } catch (err) {
                    console.error('Error running playPause command', err);
                    void vscode.window.showErrorMessage('VS-Music: Could not toggle playback');
                }
            }),
            vscode.commands.registerCommand('vs-ms.stop', () => {
                try {
                    if (!this._player.hasLibrary) {
                        return;
                    }
                    this._player.stop();
                } catch (err) {
                    console.error('Error running stop command', err);
                    void vscode.window.showErrorMessage('VS-Music: Could not stop playback');
                }
            }),
            // keep the state change listener last
            this._player.onStateChanged(() => this._refresh())
        );

        this._refresh();
    }

    private _refresh(): void {
        if (!this._player.hasLibrary) {
            this._hideAll();
            return;
        }

        const track = this._player.currentTrack;
        this._trackItem.text = track
            ? `$(music) ${track.artist} — ${track.title}`
            : '$(music) VS-Music';
        this._trackItem.tooltip = 'VS-Music now playing';

        this._trackItem.show();

        if (this._player.userGestureAllowed) {
            this._playItem.text = this._player.isPlaying
                ? '$(debug-pause)'
                : '$(debug-start)';
            this._prevItem.show();
            this._playItem.show();
            this._stopItem.show();
            this._nextItem.show();
        } else {
            this._prevItem.hide();
            this._playItem.hide();
            this._stopItem.hide();
            this._nextItem.hide();
        }
    }

    private _hideAll(): void {
        this._trackItem.hide();
        this._prevItem.hide();
        this._playItem.hide();
        this._stopItem.hide();
        this._nextItem.hide();
    }
}

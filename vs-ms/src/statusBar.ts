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

        this._prevItem.text = '$(skip-back)';
        this._prevItem.tooltip = 'Previous track';
        this._prevItem.command = 'vs-ms.prev';

        this._playItem.tooltip = 'Play / Pause';
        this._playItem.command = 'vs-ms.playPause';

        this._stopItem.text = '$(debug-stop)';
        this._stopItem.tooltip = 'Stop';
        this._stopItem.command = 'vs-ms.stop';

        this._nextItem.text = '$(skip-forward)';
        this._nextItem.tooltip = 'Next track';
        this._nextItem.command = 'vs-ms.next';

        context.subscriptions.push(
            this._trackItem,
            this._prevItem,
            this._playItem,
            this._stopItem,
            this._nextItem,
            vscode.commands.registerCommand('vs-ms.prev', () => this._player.previous()),
            vscode.commands.registerCommand('vs-ms.next', () => this._player.next()),
            vscode.commands.registerCommand('vs-ms.playPause', () => this._player.togglePlayPause()),
            vscode.commands.registerCommand('vs-ms.stop', () => this._player.stop()),
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

        this._playItem.text = this._player.isPlaying
            ? '$(debug-pause)'
            : '$(debug-start)';

        this._trackItem.show();
        this._prevItem.show();
        this._playItem.show();
        this._stopItem.show();
        this._nextItem.show();
    }

    private _hideAll(): void {
        this._trackItem.hide();
        this._prevItem.hide();
        this._playItem.hide();
        this._stopItem.hide();
        this._nextItem.hide();
    }
}

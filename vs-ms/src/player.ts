import * as path from 'path';
import * as vscode from 'vscode';
import { scanFolder, Track } from './scanner';

interface WebTrack {
    index: number;
    title: string;
    artist: string;
    album: string;
    duration: number;
    src: string;
}

export class PlayerController {
    private _tracks: Track[] = [];
    private _currentIndex = 0;
    private _isPlaying = false;
    private _userGestureAllowed = false;
    private _folderPath: string | null = null;
    private _view?: vscode.WebviewView;

    private readonly _onStateChanged = new vscode.EventEmitter<void>();
    readonly onStateChanged = this._onStateChanged.event;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    get tracks(): readonly Track[] {
        return this._tracks;
    }

    get currentTrack(): Track | undefined {
        return this._tracks[this._currentIndex];
    }

    get isPlaying(): boolean {
        return this._isPlaying;
    }

    get hasLibrary(): boolean {
        return this._tracks.length > 0;
    }

    get userGestureAllowed(): boolean {
        return this._userGestureAllowed;
    }

    bindWebview(view: vscode.WebviewView): void {
        this._view = view;
        this._syncWebviewState();
    }

    setPlayingState(playing: boolean): void {
        this._isPlaying = playing;
        this._onStateChanged.fire();
    }

    async loadFolder(): Promise<void> {
        const { tracks, folderPath } = await scanFolder();

        this._tracks = tracks;
        this._currentIndex = 0;
        this._folderPath = folderPath;
        this._isPlaying = false;
        this._userGestureAllowed = false;

        const view = this._view;
        if (!view) {
            this._onStateChanged.fire();
            return;
        }

        if (folderPath) {
            const roots = new Set<vscode.Uri>([
                this._extensionUri,
                vscode.Uri.file(folderPath)
            ]);
            for (const track of tracks) {
                roots.add(vscode.Uri.file(path.dirname(track.path)));
            }
            view.webview.options = {
                ...view.webview.options,
                localResourceRoots: [...roots]
            };
        }

        const webTracks = this._toWebTracks(view.webview, tracks);
        view.webview.postMessage({
            type: 'libraryLoaded',
            tracks: webTracks,
            folderPath
        });

        if (webTracks.length > 0) {
            this.sendPlayTrack(0, false);
        }

        this._onStateChanged.fire();
    }

    play(): void {
        if (!this.hasLibrary) {
            return;
        }
        this._userGestureAllowed = true;
        this.sendPlayTrack(this._currentIndex, true);
    }

    pause(): void {
        this._isPlaying = false;
        this._postToWebview({ type: 'pause' });
        this._onStateChanged.fire();
    }

    stop(): void {
        this._isPlaying = false;
        this._postToWebview({ type: 'stop' });
        this._onStateChanged.fire();
    }

    togglePlayPause(): void {
        if (!this.hasLibrary) {
            return;
        }
        if (!this._userGestureAllowed) {
            this._postToWebview({ type: 'gestureRequired' });
            return;
        }
        if (this._isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Request the webview to toggle playback using the webview-side logic.
     * This mirrors the side panel play button behavior by asking the webview
     * to call `audio.play()` / `audio.pause()` directly, avoiding races
     * where the extension triggers playback before the webview has loaded sources.
     */
    requestTogglePlayback(): void {
        const view = this._view;
        if (!view || !this.hasLibrary) {
            return;
        }
        if (!this._userGestureAllowed) {
            this._postToWebview({ type: 'gestureRequired' });
            return;
        }
        try {
            (view as any).show?.(false);
        } catch {
            // ignore if not supported
        }

        view.webview.postMessage({ type: 'toggle' });
    }

    previous(): void {
        if (!this.hasLibrary) {
            return;
        }
        this._currentIndex =
            (this._currentIndex - 1 + this._tracks.length) % this._tracks.length;
        this.sendPlayTrack(this._currentIndex, true);
    }

    next(): void {
        if (!this.hasLibrary) {
            return;
        }
        this._currentIndex = (this._currentIndex + 1) % this._tracks.length;
        this.sendPlayTrack(this._currentIndex, true);
    }

    sendPlayTrack(index: number, autoplay: boolean): void {
        const track = this._tracks[index];
        const view = this._view;
        if (!track || !view) {
            return;
        }

        this._currentIndex = index;
        if (autoplay) {
            this._isPlaying = true;
        }

        const webview = view.webview;
        webview.postMessage({
            type: 'playTrack',
            index,
            autoplay,
            track: {
                title: track.title,
                artist: track.artist,
                album: track.album,
                duration: track.duration,
                coverArt: track.coverArt,
                src: webview.asWebviewUri(vscode.Uri.file(track.path)).toString()
            }
        });

        this._onStateChanged.fire();
    }

    handleWebviewMessage(message: { command?: string; isPlaying?: boolean }): void {
        switch (message.command) {
            case 'scanFolder':
                void this.loadFolder().catch((err: unknown) => {
                    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                    this._postToWebview({ type: 'scanError', message: errorMessage });
                });
                break;
            case 'play':
                this.play();
                break;
            case 'pause':
                this.pause();
                break;
            case 'prev':
                this.previous();
                break;
            case 'next':
                this.next();
                break;
            case 'gesturePlay':
                this._userGestureAllowed = true;
                this._onStateChanged.fire();
                break;
            case 'playbackState':
                if (typeof message.isPlaying === 'boolean') {
                    this.setPlayingState(message.isPlaying);
                }
                break;
        }
    }

    private _syncWebviewState(): void {
        const view = this._view;
        if (!view || !this.hasLibrary) {
            return;
        }

        const webTracks = this._toWebTracks(view.webview, this._tracks);
        view.webview.postMessage({
            type: 'libraryLoaded',
            tracks: webTracks,
            folderPath: this._folderPath
        });
        this.sendPlayTrack(this._currentIndex, false);
    }

    private _toWebTracks(webview: vscode.Webview, tracks: Track[]): WebTrack[] {
        return tracks.map((track, index) => ({
            index,
            title: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
            src: webview.asWebviewUri(vscode.Uri.file(track.path)).toString()
        }));
    }

    private _postToWebview(message: object): void {
        this._view?.webview.postMessage(message);
    }
}

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseFile } from 'music-metadata';

export interface Track {
    path: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    bpm: number | null;
    genre: string | null;
    coverArt: string | null;
}

const AUDIO_EXTENSIONS = new Set([
    '.mp3', '.mp4', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.wma', '.opus', '.webm'
]);

const SKIP_DIRS = new Set([
    '$recycle.bin', 'system volume information', 'node_modules', '.git'
]);

async function findAudioFiles(dirPath: string): Promise<string[]> {
    const results: string[] = [];

    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name.toLowerCase())) {
                continue;
            }
            const nested = await findAudioFiles(fullPath);
            results.push(...nested);
            continue;
        }

        // On Windows, isFile() can be unreliable — fall back to extension check.
        const ext = path.extname(entry.name).toLowerCase();
        if (!AUDIO_EXTENSIONS.has(ext)) {
            continue;
        }

        try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.isFile()) {
                results.push(fullPath);
            }
        } catch {
            // unreadable entry
        }
    }

    return results;
}

async function parseTrack(filePath: string): Promise<Track> {
    try {
        const metadata = await parseFile(filePath);
        const tags = metadata.common;
        const format = metadata.format;

        let coverArt: string | null = null;
        if (tags.picture && tags.picture.length > 0) {
            const pic = tags.picture[0];
            const base64 = Buffer.from(pic.data).toString('base64');
            coverArt = `data:${pic.format};base64,${base64}`;
        }

        return {
            path: filePath,
            title: tags.title || path.basename(filePath, path.extname(filePath)),
            artist: tags.artist || 'Unknown Artist',
            album: tags.album || 'Unknown Album',
            duration: Math.floor(format.duration || 0),
            bpm: tags.bpm || null,
            genre: tags.genre?.[0] || null,
            coverArt,
        };
    } catch {
        return {
            path: filePath,
            title: path.basename(filePath, path.extname(filePath)),
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: 0,
            bpm: null,
            genre: null,
            coverArt: null,
        };
    }
}

export async function scanFolder(): Promise<{ tracks: Track[]; folderPath: string | null }> {
    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Music Folder'
    });

    if (!selected || selected.length === 0) {
        return { tracks: [], folderPath: null };
    }

    const folderPath = selected[0].fsPath;

    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'VS-Music: Scanning folder...',
        cancellable: false
    }, async (progress) => {
        progress.report({ message: 'Finding audio files...' });
        const audioPaths = await findAudioFiles(folderPath);

        if (audioPaths.length === 0) {
            vscode.window.showWarningMessage('VS-Music: No audio files found in that folder.');
            return { tracks: [], folderPath };
        }

        const tracks: Track[] = [];
        for (let i = 0; i < audioPaths.length; i++) {
            progress.report({
                message: `Reading tags ${i + 1} of ${audioPaths.length}...`,
                increment: (1 / audioPaths.length) * 100
            });
            tracks.push(await parseTrack(audioPaths[i]));
        }

        vscode.window.showInformationMessage(
            `VS-Music: Found ${tracks.length} tracks.`
        );

        return { tracks, folderPath };
    });
}

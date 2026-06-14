import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { Track } from './scanner';

// This is the shape of a play event stored in the DB
export interface PlayEvent {
    trackId: number;
    playedAt: number;       // unix timestamp
    durationPlayed: number; // seconds before skip or end
    completed: number;      // 1 = played to end, 0 = skipped
}

// This is the shape of an album
export interface Album {
    id: number;
    name: string;
    artist: string | null;
    createdAt: number;
}

// The Library class owns the SQLite connection.
// One instance is created in extension.ts and passed around.
export class Library {
    private db: DatabaseSync;

    constructor(storagePath: string) {
        // storagePath comes from context.globalStorageUri.fsPath in extension.ts
        // This is a folder VS Code manages per-extension — safe place for the DB
        const dbPath = path.join(storagePath, 'vsmusic.db');
        this.db = new DatabaseSync(dbPath);
        this._createTables();
    }

    // ─── SETUP ──────────────────────────────────────────────────────────────

    private _createTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS tracks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT UNIQUE,
                title       TEXT,
                artist      TEXT,
                album       TEXT,
                duration    INTEGER,
                bpm         REAL,
                genre       TEXT,
                cover_art   TEXT
            );

            CREATE TABLE IF NOT EXISTS albums (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                artist      TEXT,
                created_at  INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS album_tracks (
                album_id    INTEGER REFERENCES albums(id) ON DELETE CASCADE,
                track_id    INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                position    INTEGER,
                PRIMARY KEY (album_id, track_id)
            );

            CREATE TABLE IF NOT EXISTS play_events (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id         INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                played_at        INTEGER NOT NULL,
                duration_played  INTEGER NOT NULL,
                completed        INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS settings (
                key     TEXT PRIMARY KEY,
                value   TEXT
            );
        `);
    }

    // ─── FOLDER PERSISTENCE ─────────────────────────────────────────────────
    // Saves the folder path so we never ask the user again on restart

    saveFolder(folderPath: string) {
        this.db.prepare(`
            INSERT INTO settings (key, value) VALUES ('folderPath', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(folderPath);
    }

    getFolder(): string | null {
        const row = this.db.prepare(
            `SELECT value FROM settings WHERE key = 'folderPath'`
        ).get() as { value: string } | undefined;
        return row?.value ?? null;
    }

    // ─── TRACKS ─────────────────────────────────────────────────────────────

    // Called after every scan — inserts new tracks, updates existing ones
    upsertTracks(tracks: Track[]) {
        const stmt = this.db.prepare(`
            INSERT INTO tracks (path, title, artist, album, duration, bpm, genre, cover_art)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                title     = excluded.title,
                artist    = excluded.artist,
                album     = excluded.album,
                duration  = excluded.duration,
                bpm       = excluded.bpm,
                genre     = excluded.genre,
                cover_art = excluded.cover_art
        `);

        // Wrap in a transaction manually using BEGIN/COMMIT
        this.db.exec('BEGIN');
        try {
            for (const track of tracks) {
                stmt.run(
                    track.path,
                    track.title,
                    track.artist,
                    track.album,
                    track.duration,
                    track.bpm,
                    track.genre,
                    track.coverArt
                );
            }
            this.db.exec('COMMIT');
        } catch (err) {
            this.db.exec('ROLLBACK');
            throw err;
        }
    }

    getAllTracks(): Track[] {
        const rows = this.db.prepare(`
            SELECT path, title, artist, album, duration, bpm, genre, cover_art as coverArt
            FROM tracks
            ORDER BY artist, album, title
        `).all() as unknown as Track[];
        return rows;
    }

    getTrackById(id: number): Track | null {
        const row = this.db.prepare(`
            SELECT path, title, artist, album, duration, bpm, genre, cover_art as coverArt
            FROM tracks WHERE id = ?
        `).get(id) as unknown as Track | undefined;
        return row ?? null;
    }

    // Returns the DB id for a track path — needed when logging play events
    getTrackId(trackPath: string): number | null {
        const row = this.db.prepare(
            `SELECT id FROM tracks WHERE path = ?`
        ).get(trackPath) as { id: number } | undefined;
        return row?.id ?? null;
    }

    // ─── PLAY HISTORY ───────────────────────────────────────────────────────
    // Called by player.ts whenever a track ends or is skipped

    logPlayEvent(trackPath: string, durationPlayed: number, completed: boolean) {
        const trackId = this.getTrackId(trackPath);
        if (!trackId) {
            return; // track not in DB yet, ignore
        }

        this.db.prepare(`
            INSERT INTO play_events (track_id, played_at, duration_played, completed)
            VALUES (?, ?, ?, ?)
        `).run(trackId, Date.now(), durationPlayed, completed ? 1 : 0);
    }

    // Returns play stats per track — this is what recommender.ts reads
    getPlayStats(): {
        trackId: number;
        path: string;
        playCount: number;
        completionRate: number;  // 0.0 to 1.0
        avgDurationPlayed: number;
    }[] {
        return this.db.prepare(`
            SELECT
                t.id         AS trackId,
                t.path       AS path,
                COUNT(*)     AS playCount,
                AVG(p.completed)        AS completionRate,
                AVG(p.duration_played)  AS avgDurationPlayed
            FROM play_events p
            JOIN tracks t ON t.id = p.track_id
            GROUP BY p.track_id
        `).all() as any[];
    }

    // ─── ALBUMS ─────────────────────────────────────────────────────────────

    // Auto-group tracks by their album metadata tag — called after every scan
    autoCreateAlbums() {
        const tracks = this.db.prepare(`
            SELECT id, album, artist FROM tracks
            WHERE album != 'Unknown Album'
        `).all() as { id: number; album: string; artist: string }[];

        // Group by album name
        const albumMap = new Map<string, { artist: string; trackIds: number[] }>();
        for (const track of tracks) {
            if (!albumMap.has(track.album)) {
                albumMap.set(track.album, { artist: track.artist, trackIds: [] });
            }
            albumMap.get(track.album)!.trackIds.push(track.id);
        }

        for (const [albumName, data] of albumMap) {
            // Insert album if it doesn't exist
            this.db.prepare(`
                INSERT OR IGNORE INTO albums (name, artist, created_at)
                VALUES (?, ?, ?)
            `).run(albumName, data.artist, Date.now());

            const album = this.db.prepare(
                `SELECT id FROM albums WHERE name = ?`
            ).get(albumName) as { id: number };

            // Link tracks to album
            const linkStmt = this.db.prepare(`
                INSERT OR IGNORE INTO album_tracks (album_id, track_id, position)
                VALUES (?, ?, ?)
            `);
            data.trackIds.forEach((trackId, i) => {
                linkStmt.run(album.id, trackId, i);
            });
        }
    }

    // User manually creates a named album
    createAlbum(name: string, artist: string | null = null): number {
        const result = this.db.prepare(`
            INSERT INTO albums (name, artist, created_at) VALUES (?, ?, ?)
        `).run(name, artist, Date.now());
        return Number(result.lastInsertRowid); // returns the new album's id
    }

    // User adds a track to a manual album
    addTrackToAlbum(albumId: number, trackPath: string) {
        const trackId = this.getTrackId(trackPath);
        if (!trackId) { return; }

        // Position = end of current album tracklist
        const pos = this.db.prepare(
            `SELECT COUNT(*) as count FROM album_tracks WHERE album_id = ?`
        ).get(albumId) as { count: number };

        this.db.prepare(`
            INSERT OR IGNORE INTO album_tracks (album_id, track_id, position)
            VALUES (?, ?, ?)
        `).run(albumId, trackId, pos.count);
    }

    removeTrackFromAlbum(albumId: number, trackPath: string) {
        const trackId = this.getTrackId(trackPath);
        if (!trackId) { return; }
        this.db.prepare(
            `DELETE FROM album_tracks WHERE album_id = ? AND track_id = ?`
        ).run(albumId, trackId);
    }

    getAllAlbums(): Album[] {
        return this.db.prepare(
            `SELECT id, name, artist, created_at as createdAt FROM albums ORDER BY name`
        ).all() as unknown as Album[];
    }

    getAlbumTracks(albumId: number): Track[] {
        return this.db.prepare(`
            SELECT t.path, t.title, t.artist, t.album, t.duration, t.bpm, t.genre,
                   t.cover_art as coverArt
            FROM album_tracks at
            JOIN tracks t ON t.id = at.track_id
            WHERE at.album_id = ?
            ORDER BY at.position
        `).all(albumId) as unknown as Track[];
    }

    deleteAlbum(albumId: number) {
        // ON DELETE CASCADE handles album_tracks cleanup automatically
        this.db.prepare(`DELETE FROM albums WHERE id = ?`).run(albumId);
    }

    // ─── CLEANUP ────────────────────────────────────────────────────────────

    close() {
        this.db.close();
    }
}
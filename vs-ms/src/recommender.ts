import { Track } from './scanner';

// The shape of play stats coming from library.ts
interface PlayStats {
    trackId: number;
    path: string;
    playCount: number;
    completionRate: number;   // 0.0 to 1.0
    avgDurationPlayed: number;
}

// Feature vector for a single track.
// Every track gets represented as an array of numbers.
// The recommender finds tracks whose vectors are closest to the current one.
interface TrackVector {
    track: Track;
    vector: number[];
}

// Normalise a value between 0 and 1 given a known min/max range.
// Prevents one large-range feature (like BPM 60-200) from drowning out others.
function normalise(value: number, min: number, max: number): number {
    if (max === min) { return 0; }
    return (value - min) / (max - min);
}

// Cosine similarity between two equal-length vectors.
// Returns 1.0 = identical direction, 0.0 = no relation, -1.0 = opposite.
function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
        dot  += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) { return 0; }
    return dot / magnitude;
}

// Build a numeric feature vector for a track.
// Features: [bpmNorm, durationNorm, genreMatch(placeholder), artistMatch(placeholder)]
// bpmRange and durationRange are the min/max across the whole library
// so we can normalise consistently.
function buildVector(
    track: Track,
    bpmRange: { min: number; max: number },
    durationRange: { min: number; max: number }
): number[] {
    return [
        normalise(track.bpm ?? 120, bpmRange.min, bpmRange.max),
        normalise(track.duration, durationRange.min, durationRange.max),
    ];
}

// The main export — call this when you want the next track suggestions.
//
// currentTrack  — the track currently playing
// allTracks     — full library from library.getAllTracks()
// playStats     — history from library.getPlayStats()
// limit         — how many recommendations to return (default 10)
export function getRecommendations(
    currentTrack: Track,
    allTracks: Track[],
    playStats: PlayStats[],
    limit = 10
): Track[] {

    if (allTracks.length === 0) { return []; }

    // Build a lookup of play stats by path for O(1) access
    const statsMap = new Map<string, PlayStats>();
    for (const stat of playStats) {
        statsMap.set(stat.path, stat);
    }

    // Compute BPM and duration ranges across the whole library
    // so normalisation is consistent
    const bpms     = allTracks.map(t => t.bpm ?? 120);
    const durations = allTracks.map(t => t.duration);

    const bpmRange      = { min: Math.min(...bpms),      max: Math.max(...bpms) };
    const durationRange = { min: Math.min(...durations), max: Math.max(...durations) };

    // Build the current track's vector — this is the target we compare against
    const currentVector = buildVector(currentTrack, bpmRange, durationRange);

    // Score every track in the library
    const scored = allTracks
        .filter(t => t.path !== currentTrack.path) // exclude current track
        .map(t => {
            const vector = buildVector(t, bpmRange, durationRange);

            // --- Base score: how similar is this track to the current one ---
            const similarity = cosineSimilarity(currentVector, vector);

            // --- History score: reward tracks the user actually likes ---
            const stats = statsMap.get(t.path);
            const completionRate = stats?.completionRate ?? 0.5; // neutral if never played
            const playCount      = stats?.playCount ?? 0;

            // Diminishing returns on play count — don't just repeat the same 5 songs
            const playCountBoost = Math.log1p(playCount) / 10;

            // Penalise tracks the user keeps skipping
            const skipPenalty = 1 - completionRate;

            // --- Artist affinity: slight boost for same artist ---
            const artistBoost = t.artist === currentTrack.artist ? 0.1 : 0;

            // --- Genre affinity: slight boost for same genre ---
            const genreBoost = (t.genre && t.genre === currentTrack.genre) ? 0.1 : 0;

            // --- Final weighted score ---
            // Weights add up to 1.0 (before boosts)
            const score =
                (similarity      * 0.45) +   // acoustic/feature similarity
                (completionRate  * 0.25) +   // user actually listened to it
                (playCountBoost  * 0.15) +   // familiarity
                (-skipPenalty    * 0.15) +   // punish skipped tracks
                artistBoost +                // same artist bonus
                genreBoost;                  // same genre bonus

            return { track: t, score };
        });

    // Sort descending by score, return top N tracks
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.track);
}

// Flow state variant — filters by BPM target range before scoring.
// Called by flowState.ts when VS Code activity changes.
export function getFlowQueue(
    currentTrack: Track,
    allTracks: Track[],
    playStats: PlayStats[],
    bpmTarget: { min: number; max: number },
    limit = 10
): Track[] {

    // Filter to only tracks within the BPM range
    const bpmFiltered = allTracks.filter(t => {
        const bpm = t.bpm ?? 120;
        return bpm >= bpmTarget.min && bpm <= bpmTarget.max;
    });

    // Fall back to full library if BPM metadata is sparse
    const pool = bpmFiltered.length >= 3 ? bpmFiltered : allTracks;

    return getRecommendations(currentTrack, pool, playStats, limit);
}
const vscode = acquireVsCodeApi();

const setupView = document.getElementById('setupView');
const playerPanel = document.getElementById('playerPanel');
const setupStatus = document.getElementById('setupStatus');
const libraryInfo = document.getElementById('libraryInfo');
const playbackStatus = document.getElementById('playbackStatus');
const scanBtn = document.getElementById('scanBtn');
const changeFolderBtn = document.getElementById('changeFolderBtn');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const seekBar = document.getElementById('seekBar');
const volumeBar = document.getElementById('volumeBar');
const audio = document.getElementById('audio');

// Debug: log if buttons exist
if (!prevBtn) console.error('prevBtn not found');
if (!nextBtn) console.error('nextBtn not found');
if (!playBtn) console.error('playBtn not found');
if (!changeFolderBtn) console.error('changeFolderBtn not found');
if (!scanBtn) console.error('scanBtn not found');

let tracks = [];
let currentIndex = 0;
let isPlaying = false;
let lastLoadedTrackSrc = '';

function normalizeUrl(src) {
    try {
        return new URL(src).href;
    } catch {
        return src;
    }
}

function isSameAudioSource(trackSrc) {
    const current = normalizeUrl(audio.src);
    const target = normalizeUrl(trackSrc);
    return current === target;
}

// allow cross-origin requests for webview-served local files if needed
try {
    audio.crossOrigin = 'anonymous';
} catch (e) {
    // ignore if not supported
}
audio.volume = 0.8;

function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showSetup(message) {
    setupView.classList.remove('hidden');
    playerPanel.classList.add('hidden');
    if (message) {
        setupStatus.textContent = message;
        setupStatus.classList.remove('hidden');
    } else {
        setupStatus.classList.add('hidden');
        setupStatus.textContent = '';
    }
}

function showPlayer() {
    setupView.classList.add('hidden');
    playerPanel.classList.remove('hidden');
    setupStatus.classList.add('hidden');
}

function resetScanButton() {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Load Folder';
    changeFolderBtn.disabled = false;
}

function setScanningState() {
    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning...';
    changeFolderBtn.disabled = true;
    setupStatus.classList.add('hidden');
}

function showPlaybackError(message) {
    playbackStatus.textContent = message;
    playbackStatus.classList.remove('hidden');
}

function clearPlaybackError() {
    playbackStatus.textContent = '';
    playbackStatus.classList.add('hidden');
}

function updateCoverArt(coverArt) {
    const cover = document.getElementById('coverArt');
    if (coverArt) {
        cover.style.backgroundImage = `url(${coverArt})`;
        cover.style.backgroundSize = 'cover';
        cover.style.backgroundPosition = 'center';
        cover.textContent = '';
    } else {
        cover.style.backgroundImage = '';
        cover.textContent = '♪';
    }
}

function updateTrackDisplay(track) {
    document.getElementById('trackTitle').textContent = track.title || 'Unknown';
    document.getElementById('trackArtist').textContent = track.artist || 'Unknown Artist';
    document.getElementById('duration').textContent = formatTime(track.duration);
    if (track.coverArt !== undefined) {
        updateCoverArt(track.coverArt);
    }
    clearPlaybackError();
}

function setPlayingState(playing) {
    isPlaying = playing;
    playBtn.textContent = playing ? '⏸' : '▶';
    vscode.postMessage({ command: 'playbackState', isPlaying: playing });
}

function stopPlayback() {
    audio.pause();
    audio.currentTime = 0;
    seekBar.value = '0';
    document.getElementById('currentTime').textContent = '0:00';
    setPlayingState(false);
}

function loadTrackSource(track) {
    if (!track?.src) {
        return false;
    }
    
    console.log('Loading track src:', track.src);
    if (!isSameAudioSource(track.src)) {
        try {
            audio.src = track.src;
            audio.load();
            lastLoadedTrackSrc = track.src;
        } catch (err) {
            console.error('Error setting audio.src or loading:', err);
            return false;
        }
    }
    return true;
}

async function tryPlayAudio() {
    try {
        await audio.play();
        return true;
    } catch (err) {
        console.error('audio.play() failed:', err);
        if (err?.name === 'NotAllowedError') {
            const prevMuted = audio.muted;
            audio.muted = true;
            try {
                await audio.play();
                audio.muted = prevMuted;
                return true;
            } catch (err2) {
                console.error('Muted audio.play() fallback failed:', err2);
                audio.muted = prevMuted;
                throw err2;
            }
        }
        throw err;
    }
}

async function playCurrentTrack() {
    const track = tracks[currentIndex];
    if (!track) {
        return;
    }

    if (!loadTrackSource(track)) {
        showPlaybackError('Could not load this file.');
        setPlayingState(false);
        return;
    }

    try {
        await tryPlayAudio();
        setPlayingState(true);
        clearPlaybackError();
    } catch (err) {
        if (err?.name === 'NotAllowedError') {
            showPlaybackError('Playback blocked by browser policy. Click the player Play button once.');
        } else {
            showPlaybackError('Could not play this file. Try .mp3 format.');
        }
        setPlayingState(false);
    }
}

async function loadAndMaybePlay(track, autoplay) {
    updateTrackDisplay(track);
    loadTrackSource(track);

    if (autoplay) {
        await playCurrentTrack();
    } else {
        setPlayingState(false);
    }
}

function requestScan() {
    console.log('Scan requested');
    setScanningState();
    vscode.postMessage({ command: 'scanFolder' });
}

scanBtn.addEventListener('click', requestScan);
changeFolderBtn.addEventListener('click', requestScan);
console.log('Scan button listeners attached');

playBtn.addEventListener('click', async () => {
    if (!tracks || !tracks.length) {
        console.log('No tracks loaded');
        return;
    }

    vscode.postMessage({ command: 'gesturePlay' });

    if (isPlaying) {
        audio.pause();
        setPlayingState(false);
        return;
    }

    await playCurrentTrack();
});

prevBtn.addEventListener('click', () => {
    console.log('Prev clicked, tracks:', tracks?.length || 0, 'currentIndex:', currentIndex);
    if (tracks && tracks.length) {
        vscode.postMessage({ command: 'prev' });
    }
});

nextBtn.addEventListener('click', () => {
    console.log('Next clicked, tracks:', tracks?.length || 0, 'currentIndex:', currentIndex);
    if (tracks && tracks.length) {
        vscode.postMessage({ command: 'next' });
    }
});

seekBar.addEventListener('input', () => {
    if (!audio.duration) {
        return;
    }
    audio.currentTime = (seekBar.value / 100) * audio.duration;
});

volumeBar.addEventListener('input', () => {
    audio.volume = volumeBar.value / 100;
});

audio.addEventListener('timeupdate', () => {
    if (!audio.duration) {
        return;
    }
    const pct = (audio.currentTime / audio.duration) * 100;
    seekBar.value = String(pct);
    document.getElementById('currentTime').textContent = formatTime(audio.currentTime);
});

audio.addEventListener('ended', () => {
    setPlayingState(false);
    vscode.postMessage({ command: 'next' });
});

audio.addEventListener('play', () => {
    isPlaying = true;
    playBtn.textContent = '⏸';
    vscode.postMessage({ command: 'playbackState', isPlaying: true });
});

audio.addEventListener('pause', () => {
    isPlaying = false;
    playBtn.textContent = '▶';
    vscode.postMessage({ command: 'playbackState', isPlaying: false });
});

audio.addEventListener('error', () => {
    const ae = audio.error;
    console.error('Audio element error event:', ae);
    let msg = 'Audio failed to load. Use .mp3 files for best compatibility.';
    if (ae) {
        msg += ` (code ${ae.code})`;
    }
    showPlaybackError(msg);
    setPlayingState(false);
});

window.addEventListener('message', async (event) => {
    const msg = event.data;

    if (msg.type === 'libraryLoaded') {
        console.log('Library loaded:', msg.tracks?.length || 0, 'tracks');
        resetScanButton();
        tracks = msg.tracks || [];
        currentIndex = 0;

        if (tracks.length > 0) {
            showPlayer();
            libraryInfo.textContent = `${tracks.length} track${tracks.length === 1 ? '' : 's'} loaded`;
            updateTrackDisplay(tracks[0]);
            loadTrackSource(tracks[0]);
            setPlayingState(false);
        } else {
            showSetup('No audio files found. Try another folder with .mp3, .mp4, .flac, or similar files.');
        }
    }

    if (msg.type === 'playTrack') {
        console.log('PlayTrack message received, index:', msg.index, 'autoplay:', msg.autoplay);
        currentIndex = msg.index ?? currentIndex;
        if (msg.track) {
            tracks[currentIndex] = { ...tracks[currentIndex], ...msg.track };
        }
        await loadAndMaybePlay(tracks[currentIndex], !!msg.autoplay);
    }

    if (msg.type === 'toggle') {
        if (!tracks || !tracks.length) {
            console.log('Toggle requested but no tracks loaded');
            return;
        }

        if (isPlaying) {
            audio.pause();
            setPlayingState(false);
            return;
        }

        await playCurrentTrack();
        return;
    }

    if (msg.type === 'gestureRequired') {
        showPlaybackError('Click the main panel Play button once to enable bottom controls.');
        return;
    }

    if (msg.type === 'pause') {
        audio.pause();
        setPlayingState(false);
    }

    if (msg.type === 'stop') {
        stopPlayback();
    }

    if (msg.type === 'scanError') {
        resetScanButton();
        showSetup(msg.message || 'Something went wrong while scanning.');
    }
});

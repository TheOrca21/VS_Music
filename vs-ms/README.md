# VS-Music

A simple music player extension for Visual Studio Code. Play your local music library directly from the editor sidebar.

## Features

- 🎵 **Load Music Folders** – Select any folder containing audio files to create your library
- ⏯️ **Playback Controls** – Play, pause, next, previous, and stop playback
- 🔊 **Volume Control** – Adjust volume with an integrated slider
- 📊 **Seek Bar** – Jump to any point in the current track
- 🎨 **Album Art** – Display cover art embedded in audio metadata
- 📝 **Track Information** – View track title, artist, and duration
- 📁 **Easy Folder Change** – Switch between music folders without reloading

## Supported Formats

The extension supports the following audio formats:
- MP3
- MP4 / M4A
- FLAC
- OGG
- WAV
- AAC
- WMA
- Opus
- WebM

## How to Use

1. **Open the VS-Music Sidebar** – Click the music icon in the activity bar
2. **Load a Folder** – Click "Load Folder" and select a directory with audio files
3. **Play Music** – Click the Play button (▶) to start playing
4. **Control Playback** – Use Previous (⏮), Play/Pause (▶/⏸), and Next (⏭) buttons
5. **Adjust Volume** – Use the volume slider (🔈–🔊)
6. **Seek** – Drag the progress bar to jump to a position in the song

## Keyboard Shortcuts

Bottom controls can be accessed from the status bar once playback has been started from the main panel.

## Requirements

- Visual Studio Code 1.120.0 or higher
- Local audio files (MP3, FLAC, etc.)

## Known Issues

- Playback must be initiated from the main panel before bottom status bar controls are enabled (browser autoplay policy)
- Large music libraries may take a moment to scan

## Release Notes

### 1.0.0

Initial release with core playback features, metadata reading, and album art support.

---

**Enjoy your music! 🎶**


## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**

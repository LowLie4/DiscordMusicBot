// Clase para manejar la cola de reproducción
class MusicQueue {
    constructor() {
        this.songs = [];
        this.currentSong = null;
        this.isPlaying = false;
        this.player = null;
        this.connection = null;
        this._hasAnnouncedNowPlaying = false;
        
        // Crossfade support
        this.crossfadeTimeout = null;
        this.crossfadeInterval = null;
        this.isCrossfading = false;
        this.nextPlayer = null;
        this.nextResource = null;
        this.currentDuration = 0;
        this.currentStartTime = 0;
    }

    addSong(song) {
        this.songs.push(song);
    }

    getNextSong() {
        return this.songs.shift();
    }

    clear() {
        this.songs = [];
        this.currentSong = null;
        this.clearCrossfade();
    }

    // Limpiar timers de crossfade
    clearCrossfade() {
        if (this.crossfadeTimeout) clearTimeout(this.crossfadeTimeout);
        if (this.crossfadeInterval) clearInterval(this.crossfadeInterval);
        if (this.nextPlayer) {
            this.nextPlayer.stop();
            this.nextPlayer = null;
        }
        this.isCrossfading = false;
        this.crossfadeTimeout = null;
        this.crossfadeInterval = null;
        this.nextResource = null;
    }

    // Mezcla la cola aleatoriamente (Fisher-Yates)
    shuffle() {
        for (let i = this.songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.songs[i], this.songs[j]] = [this.songs[j], this.songs[i]];
        }
    }

    isEmpty() {
        return this.songs.length === 0;
    }

    async getNextPlayableSong() {
        // Obtiene la siguiente canción lista para reproducir
        while (this.songs.length > 0) {
            let song = this.songs[0];
            if (!song.pending) {
                // Ya está lista
                return this.songs.shift();
            } else if (song.loading) {
                // Espera a que termine la carga si está en proceso
                await song.loading;
                if (!song.pending) {
                    return this.songs.shift();
                } else {
                    this.songs.shift();
                }
            } else {
                // Lazy loading: buscar en YouTube ahora
                const { searchYouTube } = require('./youtube');
                const cleanText = require('./utils').cleanText;
                const cleanArtist = cleanText(song.artist);
                const cleanName = cleanText(song.title);
                let searchQuery = `${cleanArtist} ${cleanName}`;
                let youtubeVideo = await searchYouTube(searchQuery);
                if (!youtubeVideo) {
                    // Fallback: solo nombre
                    youtubeVideo = await searchYouTube(cleanName);
                }
                if (youtubeVideo && youtubeVideo.videoId) {
                    song.url = `https://www.youtube.com/watch?v=${youtubeVideo.videoId}`;
                    song.thumbnail = youtubeVideo.thumbnail;
                    song.duration = youtubeVideo.timestamp || (youtubeVideo.seconds ? new Date(youtubeVideo.seconds * 1000).toISOString().substr(14, 5) : '-');
                    song.pending = false;
                    return this.songs.shift();
                } else {
                    // No se pudo resolver, la quitamos y pasamos a la siguiente
                    this.songs.shift();
                }
            }
        }
        return null;
    }
}

module.exports = MusicQueue; 
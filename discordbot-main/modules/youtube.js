const ytSearch = require('yt-search');
const ytpl = require('ytpl');
const { spawn } = require('child_process');

// Función para buscar en YouTube
async function searchYouTube(query) {
    try {
        console.log('Buscando en YouTube:', query);
        const searchResults = await ytSearch(query);
        console.log('Resultados de búsqueda de YouTube:', searchResults && searchResults.videos ? searchResults.videos[0] : null);
        return searchResults.videos.length > 0 ? searchResults.videos[0] : null;
    } catch (error) {
        console.error('Error al buscar en YouTube:', error);
        return null;
    }
}

// Función para obtener un stream de audio usando yt-dlp
async function getYtDlpStream(youtubeUrl) {
    return new Promise((resolve, reject) => {
        // Usar python -m yt_dlp para máxima compatibilidad
        const ytdlp = spawn('python', [
            '-m', 'yt_dlp',
            '-f', 'bestaudio[ext=m4a]/bestaudio/best',
            '-o', '-', // output to stdout
            '--quiet',
            '--no-warnings',
            youtubeUrl
        ], { stdio: ['ignore', 'pipe', 'ignore'] });

        ytdlp.on('error', (err) => {
            reject(new Error('No se pudo iniciar yt-dlp. ¿Está Python y yt-dlp instalados?'));
        });

        ytdlp.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`yt-dlp terminó con código ${code}`));
            }
        });

        resolve(ytdlp.stdout);
    });
}

// Función para procesar video individual de YouTube
async function processYouTubeVideo(cleanQuery, interaction) {
    try {
        // Extraer el ID del video de la URL
        const videoIdMatch = cleanQuery.match(/v=([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        let videoInfo = null;
        
        if (videoId) {
            // Construir URL limpia y buscar
            const cleanVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            videoInfo = await searchYouTube(cleanVideoUrl);
            console.log('Búsqueda por URL limpia:', cleanVideoUrl, videoInfo);
        } else {
            // Fallback: búsqueda normal
            videoInfo = await searchYouTube(cleanQuery);
            console.log('Búsqueda normal:', cleanQuery, videoInfo);
        }
        
        console.log('Info video YouTube:', videoInfo);
        if (videoInfo && videoInfo.videoId) {
            // Normalizar la URL de YouTube
            let normalizedUrl = `https://www.youtube.com/watch?v=${videoInfo.videoId}`;
            return {
                title: videoInfo.title,
                artist: videoInfo.author.name,
                url: normalizedUrl,
                thumbnail: videoInfo.thumbnail,
                duration: videoInfo.timestamp ||
                          (videoInfo.seconds ? new Date(videoInfo.seconds * 1000).toISOString().substr(14, 5) : '-'),
                requestedBy: interaction.user.tag,
                source: 'YouTube'
            };
        }
        return null;
    } catch (error) {
        console.error('Error al obtener información de YouTube:', error);
        return null;
    }
}

// Función para procesar playlist de YouTube
async function processYouTubePlaylist(query, interaction) {
    try {
        const playlist = await ytpl(query.trim(), { limit: 100 }); // Usa el valor original
        if (playlist && playlist.items && playlist.items.length > 0) {
            let added = 0;
            const songs = [];
            for (const item of playlist.items) {
                // Solo videos públicos y con duración
                if (item.isPlayable && item.durationSec) {
                    let normalizedUrl = `https://www.youtube.com/watch?v=${item.id}`;
                    const songInfo = {
                        title: item.title,
                        artist: item.author.name,
                        url: normalizedUrl,
                        thumbnail: item.bestThumbnail.url,
                        duration: item.duration,
                        requestedBy: interaction.user.tag,
                        source: 'YouTube Playlist'
                    };
                    songs.push(songInfo);
                    added++;
                }
            }
            return { songs, added };
        } else {
            return { songs: [], added: 0 };
        }
    } catch (err) {
        console.error('Error al procesar la playlist de YouTube:', err);
        throw err;
    }
}

module.exports = {
    searchYouTube,
    getYtDlpStream,
    processYouTubeVideo,
    processYouTubePlaylist
}; 
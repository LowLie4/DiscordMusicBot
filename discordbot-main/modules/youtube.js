const ytSearch = require('yt-search');
const ytpl = require('ytpl');
const { spawn } = require('child_process');

// Cache para búsquedas
const searchCache = new Map();
const SEARCH_TIMEOUT = 15000; // 15 segundos máximo para búsquedas
const CACHE_TTL = 3600000; // 1 hora

function setSearchCache(key, value) {
    searchCache.set(key, { value, timestamp: Date.now() });
}

function getSearchCache(key) {
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.value;
    }
    if (cached) {
        searchCache.delete(key);
    }
    return null;
}

// Función para buscar en YouTube CON CACHÉ Y TIMEOUT
async function searchYouTube(query) {
    try {
        // Verificar caché primero
        const cached = getSearchCache(query);
        if (cached) {
            return cached;
        }

        // Búsqueda con timeout
        const searchPromise = ytSearch(query);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Búsqueda en YouTube excedió el tiempo límite')), SEARCH_TIMEOUT)
        );

        const searchResults = await Promise.race([searchPromise, timeoutPromise]);
        
        // Cachear resultado
        const result = searchResults.videos && searchResults.videos.length > 0 ? searchResults.videos[0] : null;
        if (result) {
            setSearchCache(query, result);
        }
        return result;
    } catch (error) {
        console.error('Error al buscar en YouTube:', error.message);
        return null;
    }
}

// Función para obtener un stream de audio usando yt-dlp CON TIMEOUT
async function getYtDlpStream(youtubeUrl) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ytdlp.kill();
            reject(new Error('yt-dlp excedió el tiempo límite (120 segundos)'));
        }, 120000); // 2 minutos máximo

        const ytdlp = spawn('python', [
            '-m', 'yt_dlp',
            '-f', 'bestaudio[ext=m4a]/bestaudio/best',
            '-o', '-', // output to stdout
            '--quiet',
            '--no-warnings',
            youtubeUrl
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        ytdlp.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error('No se pudo iniciar yt-dlp. ¿Está Python y yt-dlp instalados?'));
        });

        ytdlp.on('close', (code) => {
            clearTimeout(timeout);
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
        } else {
            // Fallback: búsqueda normal
            videoInfo = await searchYouTube(cleanQuery);
        }
        
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
        console.error('❌ Error al obtener información de YouTube:', error.message);
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
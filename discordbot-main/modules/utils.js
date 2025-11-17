// Funciones de utilidad general

// Función para limpiar texto (eliminar paréntesis, feat, etc.)
function cleanText(text) {
    return text
        .replace(/\(.*?\)/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/feat\.?/gi, '')
        .replace(/-.*$/g, '')
        .replace(/Remaster(ed)?/gi, '')
        .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Función para extraer ID de Spotify
function extractSpotifyId(url) {
    const match = url.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/);
    console.log('extractSpotifyId:', url, '->', match ? match[1] : null);
    return match ? match[1] : null;
}

// Función para extraer ID de playlist de Spotify
function extractSpotifyPlaylistId(url) {
    const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

// Función para extraer ID de video de YouTube
function extractYouTubeVideoId(url) {
    const videoIdMatch = url.match(/v=([a-zA-Z0-9_-]{11})/);
    return videoIdMatch ? videoIdMatch[1] : null;
}

module.exports = {
    cleanText,
    extractSpotifyId,
    extractSpotifyPlaylistId,
    extractYouTubeVideoId
}; 
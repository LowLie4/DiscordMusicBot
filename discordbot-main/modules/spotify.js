const SpotifyWebApi = require('spotify-web-api-node');
const { cleanText } = require('./utils');
const { searchYouTube } = require('./youtube');

// Configurar Spotify API
let spotifyApi;

function initializeSpotify(clientId, clientSecret) {
    spotifyApi = new SpotifyWebApi({
        clientId: clientId,
        clientSecret: clientSecret
    });
}

// Función para autenticar con Spotify
async function authenticateSpotify() {
    try {
        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body['access_token']);
        console.log('Spotify autenticado correctamente');
        
        // Renovar token cada 50 minutos
        setTimeout(authenticateSpotify, 50 * 60 * 1000);
    } catch (error) {
        console.error('Error al autenticar Spotify:', error);
    }
}

// Función para obtener información de Spotify
async function getSpotifyTrackInfo(trackId) {
    try {
        const track = await spotifyApi.getTrack(trackId);
        console.log('Respuesta de Spotify API:', track.body);
        return {
            name: track.body.name,
            artist: track.body.artists.map(artist => artist.name).join(', '),
            duration: track.body.duration_ms,
            external_urls: track.body.external_urls.spotify
        };
    } catch (error) {
        console.error('Error al obtener información de Spotify:', error);
        return null;
    }
}

// Función para procesar track de Spotify
async function processSpotifyTrack(trackId, interaction) {
    const spotifyTrack = await getSpotifyTrackInfo(trackId);
    console.log('Info de la pista de Spotify:', spotifyTrack);
    
    if (!spotifyTrack) {
        return null;
    }

    // 1. Buscar con el string original
    let searchQuery = `${spotifyTrack.artist} ${spotifyTrack.name}`;
    let youtubeVideo = await searchYouTube(searchQuery);
    console.log('Intento 1 (original):', searchQuery, youtubeVideo);

    // 2. Limpiar nombre y artista si no encuentra nada
    if (!youtubeVideo) {
        const cleanArtist = cleanText(spotifyTrack.artist);
        const cleanName = cleanText(spotifyTrack.name);

        // 2.1 Artista + nombre limpio
        searchQuery = `${cleanArtist} ${cleanName}`;
        youtubeVideo = await searchYouTube(searchQuery);
        console.log('Intento 2 (limpio):', searchQuery, youtubeVideo);

        // 2.2 Solo nombre limpio
        if (!youtubeVideo) {
            searchQuery = cleanName;
            youtubeVideo = await searchYouTube(searchQuery);
            console.log('Intento 3 (solo nombre limpio):', searchQuery, youtubeVideo);
        }
    }

    if (youtubeVideo && youtubeVideo.videoId) {
        let normalizedUrl = `https://www.youtube.com/watch?v=${youtubeVideo.videoId}`;
        return {
            title: spotifyTrack.name,
            artist: spotifyTrack.artist,
            url: normalizedUrl,
            thumbnail: youtubeVideo.thumbnail,
            duration: youtubeVideo.timestamp ||
                      (youtubeVideo.seconds ? new Date(youtubeVideo.seconds * 1000).toISOString().substr(14, 5) : '-'),
            requestedBy: interaction.user.tag,
            source: 'Spotify → YouTube'
        };
    }
    
    return null;
}

// Función para procesar playlist de Spotify
async function processSpotifyPlaylist(playlistId, interaction) {
    try {
        let offset = 0;
        let total = 0;
        let added = 0;
        const songs = [];
        let processedCount = 0;
        do {
            const data = await spotifyApi.getPlaylistTracks(playlistId, { offset, limit: 100 });
            const tracks = data.body.items;
            total = data.body.total;
            for (const item of tracks) {
                const track = item.track;
                if (!track || !track.name || !track.artists) continue;
                const cleanArtist = cleanText(track.artists.map(a => a.name).join(', '));
                const cleanName = cleanText(track.name);
                if (processedCount === 0) {
                    // Solo la primera canción se procesa completamente
                    let searchQuery = `${cleanArtist} ${cleanName}`;
                    let youtubeVideo = await searchYouTube(searchQuery);
                    if (!youtubeVideo) {
                        searchQuery = cleanName;
                        youtubeVideo = await searchYouTube(searchQuery);
                    }
                    if (youtubeVideo && youtubeVideo.videoId) {
                        let normalizedUrl = `https://www.youtube.com/watch?v=${youtubeVideo.videoId}`;
                        const songInfo = {
                            title: track.name,
                            artist: track.artists.map(a => a.name).join(', '),
                            url: normalizedUrl,
                            thumbnail: youtubeVideo.thumbnail,
                            duration: youtubeVideo.timestamp ||
                                      (youtubeVideo.seconds ? new Date(youtubeVideo.seconds * 1000).toISOString().substr(14, 5) : '-'),
                            requestedBy: interaction.user.tag,
                            source: 'Spotify Playlist → YouTube',
                            pending: false
                        };
                        songs.push(songInfo);
                        added++;
                    } else {
                        // Si no se encuentra en YouTube, igual se agrega como pendiente
                        songs.push({
                            title: track.name,
                            artist: track.artists.map(a => a.name).join(', '),
                            requestedBy: interaction.user.tag,
                            source: 'Spotify Playlist → YouTube',
                            pending: true
                        });
                    }
                } else {
                    // El resto se agregan como pendientes
                    songs.push({
                        title: track.name,
                        artist: track.artists.map(a => a.name).join(', '),
                        requestedBy: interaction.user.tag,
                        source: 'Spotify Playlist → YouTube',
                        pending: true
                    });
                }
                processedCount++;
            }
            offset += 100;
        } while (offset < total);
        return { songs, added };
    } catch (err) {
        console.error('Error al procesar la playlist de Spotify:', err);
        throw err;
    }
}

module.exports = {
    initializeSpotify,
    authenticateSpotify,
    getSpotifyTrackInfo,
    processSpotifyTrack,
    processSpotifyPlaylist
}; 
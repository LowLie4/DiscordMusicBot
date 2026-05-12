const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { spawn } = require('child_process');

// Importar módulos
const MusicQueue = require('./modules/musicQueue');
const { cleanText, extractSpotifyId, extractSpotifyPlaylistId, extractYouTubeVideoId } = require('./modules/utils');
const { searchYouTube, getYtDlpStream, processYouTubeVideo, processYouTubePlaylist } = require('./modules/youtube');
const { initializeSpotify, authenticateSpotify, processSpotifyTrack, processSpotifyPlaylist } = require('./modules/spotify');
const { handleRadio } = require('./modules/radio');
const { updateMusicPanel, setMusicChannel, getMusicConfig } = require('./modules/musicPanel');

// Configuración del bot
const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    }
};

// Sistema de caché para optimizar búsquedas
const searchCache = new Map();
const CACHE_TTL = 3600000; // 1 hora en milisegundos
const MAX_CACHE_ENTRIES = 500;

function setCache(key, value) {
    if (searchCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }
    searchCache.set(key, { value, timestamp: Date.now() });
}

function getCache(key) {
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.value;
    }
    if (cached) {
        searchCache.delete(key);
    }
    return null;
}

// Modo debug (puedes cambiar a true para más logs)
const DEBUG_MODE = process.env.DEBUG === 'true';

// Inicializar cliente de Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// Inicializar Spotify
initializeSpotify(config.spotify.clientId, config.spotify.clientSecret);

// Mapa para almacenar las conexiones de voz y colas de reproducción
const connections = new Map();
const queues = new Map();

// Limpieza automática de colas inactivas cada 5 minutos
setInterval(() => {
    const now = Date.now();
    for (const [guildId, queue] of queues.entries()) {
        // Si la cola está vacía y no se está reproduciendo, eliminarla después de 30 minutos
        if (queue.isEmpty() && !queue.isPlaying && now - (queue.lastActivityTime || 0) > 1800000) {
            const connection = connections.get(guildId);
            if (connection) {
                connection.destroy();
            }
            connections.delete(guildId);
            queues.delete(guildId);
        }
    }
}, 300000); // Verificar cada 5 minutos

// Pre-cargar la siguiente canción pendiente en la cola (ahora con promesa de carga)
async function prepareNextSong(queue) {
    if (queue.songs.length > 0) {
        let song = queue.songs[0];
        if (song.pending && !song.loading) {
            // Guardar la promesa de carga para poder await si hace falta
            song.loading = (async () => {
                try {
                    const { searchYouTube } = require('./modules/youtube');
                    const { cleanText } = require('./modules/utils');
                    const cleanArtist = cleanText(song.artist);
                    const cleanName = cleanText(song.title);
                    let searchQuery = `${cleanArtist} ${cleanName}`;
                    let youtubeVideo = await searchYouTube(searchQuery);
                    if (!youtubeVideo) {
                        youtubeVideo = await searchYouTube(cleanName);
                    }
                    if (youtubeVideo && youtubeVideo.videoId) {
                        song.url = `https://www.youtube.com/watch?v=${youtubeVideo.videoId}`;
                        song.thumbnail = youtubeVideo.thumbnail;
                        song.duration = youtubeVideo.timestamp || (youtubeVideo.seconds ? new Date(youtubeVideo.seconds * 1000).toISOString().substr(14, 5) : '-');
                        song.pending = false;
                    }
                } finally {
                    song.loading = null;
                }
            })();
            await song.loading;
        } else if (song.loading) {
            // Si ya está en proceso de carga, espera a que termine
            await song.loading;
        }
    }
}

// Parsear duración en formato MM:SS o segundos a milisegundos
function parseDuration(duration) {
    if (typeof duration === 'number') {
        return duration * 1000;
    }
    if (typeof duration === 'string') {
        const parts = duration.split(':');
        if (parts.length === 2) {
            const minutes = parseInt(parts[0]);
            const seconds = parseInt(parts[1]);
            return (minutes * 60 + seconds) * 1000;
        }
    }
    return 0;
}

// Función para iniciar crossfade
async function initiateCrossfade(queue, guildId, channel, durationMs) {
    if (queue.isCrossfading || !queue.player || durationMs < 7000) return;
    
    const crossfadeStartTime = durationMs - 7000; // Comienza 7 segundos antes
    
    queue.crossfadeTimeout = setTimeout(async () => {
        if (queue.isEmpty()) return;
        
        try {
            queue.isCrossfading = true;
            const nextSong = await queue.getNextPlayableSong();
            
            if (!nextSong || !nextSong.url) return;
            
            // Preparar siguiente reproductor
            if (!queue.nextPlayer) {
                queue.nextPlayer = createAudioPlayer();
                queue.connection.subscribe(queue.nextPlayer);
            }
            
            // Obtener stream de la siguiente canción
            const nextStream = await getYtDlpStream(nextSong.url);
            queue.nextResource = createAudioResource(nextStream, { inlineVolume: true });
            queue.nextResource.volume.setVolume(0.0);
            
            // Reproducir siguiente con volumen en 0
            queue.nextPlayer.play(queue.nextResource);
            
            // Transición suave de volumen (7 segundos)
            const totalSteps = 70;
            let step = 0;
            
            queue.crossfadeInterval = setInterval(() => {
                if (step >= totalSteps) {
                    clearInterval(queue.crossfadeInterval);
                    // Detener reproductor anterior y cambiar al siguiente
                    if (queue.player) {
                        queue.player.stop();
                    }
                    queue.player = queue.nextPlayer;
                    queue.nextPlayer = null;
                    queue.currentSong = nextSong;
                    queue.isCrossfading = false;
                    
                    updateMusicPanel(nextSong, queue, client).catch(() => {});
                    return;
                }
                
                const progress = step / totalSteps;
                const volumeOut = Math.max(0.1 * (1 - progress), 0);
                const volumeIn = Math.min(0.1 * progress, 0.1);
                
                if (queue.player && queue.player.state) {
                    if (queue.player.state.resource && queue.player.state.resource.volume) {
                        queue.player.state.resource.volume.setVolume(volumeOut);
                    }
                }
                
                if (queue.nextResource && queue.nextResource.volume) {
                    queue.nextResource.volume.setVolume(volumeIn);
                }
                
                step++;
            }, 100); // Actualizar cada 100ms
            
        } catch (error) {
            console.error('[CROSSFADE] Error:', error);
            queue.isCrossfading = false;
            clearInterval(queue.crossfadeInterval);
        }
    }, crossfadeStartTime);
}

// Función para reproducir música usando yt-dlp CON CROSSFADE
async function playMusic(guildId, channel) {
    const queue = queues.get(guildId);
    if (!queue || queue.isEmpty()) {
        if (DEBUG_MODE) console.log('[DEBUG] Cola vacía o no existe para guild', guildId);
        await updateMusicPanel(null, queue, client);
        return;
    }
    if (queue.isProcessing) {
        if (DEBUG_MODE) console.log('[DEBUG] Ya se está procesando música para guild', guildId);
        return;
    }
    queue.isProcessing = true;
    queue.lastActivityTime = Date.now(); // Actualizar tiempo de actividad
    
    try {
        const song = await queue.getNextPlayableSong();
        if (!song || !song.url) {
            if (DEBUG_MODE) console.log('[DEBUG] No se encontró canción reproducible en la cola');
            await channel.send('❌ No se encontró ninguna canción reproducible en la cola. Se detiene la reproducción.');
            queue.isPlaying = false;
            queue.currentSong = null;
            await updateMusicPanel(null, queue, client);
            return;
        }
        queue.currentSong = song;
        queue.clearCrossfade();
        prepareNextSong(queue);
        try {
            if (DEBUG_MODE) console.log('[DEBUG] Reproduciendo:', song.title);
            const audioStream = await getYtDlpStream(song.url);
            const resource = createAudioResource(audioStream, { inlineVolume: true });
            resource.volume.setVolume(0.1);
            
            if (!queue.player) {
                queue.player = createAudioPlayer();
                queue.connection.subscribe(queue.player);
            } else {
                queue.player.removeAllListeners();
            }
            
            queue.player.play(resource);
            queue.isPlaying = true;
            
            // Parsear duración de la canción
            const durationMs = parseDuration(song.duration);
            queue.currentDuration = durationMs;
            queue.currentStartTime = Date.now();
            
            // Iniciar crossfade si hay duración válida
            if (durationMs > 7000) {
                initiateCrossfade(queue, guildId, channel, durationMs);
            }
            
            // Evento cuando termina la canción (solo si no está en crossfade)
            queue.player.on(AudioPlayerStatus.Idle, async () => {
                if (!queue.isCrossfading) {
                    queue.isPlaying = false;
                    if (!queue.isEmpty()) {
                        playMusic(guildId, channel);
                    } else {
                        await updateMusicPanel(null, queue, client);
                    }
                }
            });
            
            queue.player.on('error', error => {
                console.error('[ERROR] Error en el reproductor:', error.message);
                queue.isCrossfading = false;
                queue.isPlaying = false;
                if (!queue.isEmpty()) {
                    playMusic(guildId, channel);
                }
            });
            
            await updateMusicPanel(song, queue, client);
        } catch (error) {
            console.error('[ERROR] Error al reproducir música:', error.message);
            await channel.send('❌ Error al reproducir la canción. Asegúrate de tener yt-dlp y FFmpeg instalados.');
            if (!queue.isEmpty()) {
                playMusic(guildId, channel);
            }
            await updateMusicPanel(null, queue, client);
        }
    } finally {
        queue.isProcessing = false;
    }
}

// Comandos slash
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce música de YouTube o Spotify')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('URL de YouTube/Spotify o término de búsqueda')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Salta la canción actual'),
    
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Muestra la cola de reproducción'),
    new SlashCommandBuilder()
        .setName('cola')
        .setDescription('Muestra la cola de reproducción'),
    
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Detiene la reproducción y limpia la cola'),
    
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pausa la reproducción'),
    
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Reanuda la reproducción'),
    
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Ajusta el volumen (0-100)')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Nivel de volumen')
                .setMinValue(0)
                .setMaxValue(100)
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Muestra la canción actual'),
    
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Limpia la cola de reproducción'),
    
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Desconecta el bot del canal de voz'),
    
    new SlashCommandBuilder()
        .setName('musicconfig')
        .setDescription('Configura el canal de texto para el panel de música')
        .addStringOption(option =>
            option.setName('canal_id')
                .setDescription('ID del canal de texto para el panel de música')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Reproduce una estación de radio en vivo'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Muestra la ayuda y los comandos disponibles'),
    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Elimina una canción específica de la cola')
        .addIntegerOption(option =>
            option.setName('posicion')
                .setDescription('Posición de la canción en la cola (usa /queue para ver)')
                .setMinValue(1)
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Mezcla aleatoriamente el orden de las canciones en la cola'),
];

// Evento cuando el bot está listo
client.once('ready', async () => {
    console.log(`Bot conectado como ${client.user.tag}`);
    
    // Autenticar con Spotify
    await authenticateSpotify();
    
    // Registrar comandos slash
    try {
        console.log('Limpiando comandos antiguos...');
        // Eliminar todos los comandos del servidor para evitar duplicados
        await client.application.commands.set([], config.guildId);
        
        console.log('Registrando comandos slash...');
        await client.application.commands.set(commands, config.guildId);
        console.log(`✅ ${commands.length} Comandos slash registrados correctamente`);
    } catch (error) {
        console.error('❌ Error al registrar comandos:', error);
    }
    // Actualizar panel de música al iniciar
    await updateMusicPanel(null, null, client);
});

// Manejar interacciones de comandos slash
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const musicConfig = getMusicConfig();
        if (!musicConfig.channelId || interaction.channelId !== musicConfig.channelId) return;
        const guildId = interaction.guildId;
        const queue = queues.get(guildId);
        switch (interaction.customId) {
            case 'music_pause':
                if (queue && queue.player) {
                    if (queue.player.state.status === AudioPlayerStatus.Playing) {
                        queue.player.pause();
                        await interaction.reply({ content: '⏸️ Pausado', ephemeral: true });
                    } else {
                        queue.player.unpause();
                        await interaction.reply({ content: '▶️ Reanudado', ephemeral: true });
                    }
                } else {
                    await interaction.reply({ content: 'No hay música para pausar/reanudar.', ephemeral: true });
                }
                break;
            case 'music_skip':
                if (queue && queue.player) {
                    queue.player.stop();
                    // await interaction.reply({ content: '⏭️ Saltado', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'No hay música para saltar.', ephemeral: true });
                }
                break;
            case 'music_stop':
                if (queue) {
                    queue.clear();
                    if (queue.player) queue.player.stop();
                    queue.isPlaying = false;
                    await updateMusicPanel(null, queue, client);
                    await interaction.reply({ content: '⏹️ Reproducción detenida.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'No hay música para detener.', ephemeral: true });
                }
                break;
        }
        return;
    }
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guildId, member, channel } = interaction;

    // Verificar si el usuario está en un canal de voz
    if (!member.voice.channel && ['play', 'skip', 'stop', 'pause', 'resume'].includes(commandName)) {
        return interaction.reply({ content: '❌ Debes estar en un canal de voz para usar este comando.', ephemeral: true });
    }

    try {
        switch (commandName) {
            case 'play':
                await handlePlay(interaction);
                break;
            case 'skip':
                await handleSkip(interaction);
                break;
            case 'queue':
            case 'cola':
                await handleQueue(interaction);
                break;
            case 'remove':
                await handleRemove(interaction);
                break;
            case 'shuffle':
                await handleShuffle(interaction);
                break;
            case 'help':
                await handleHelp(interaction);
                break;
            case 'stop':
                await handleStop(interaction);
                break;
            case 'pause':
                await handlePause(interaction);
                break;
            case 'resume':
                await handleResume(interaction);
                break;
            case 'volume':
                await handleVolume(interaction);
                break;
            case 'nowplaying':
                await handleNowPlaying(interaction);
                break;
            case 'clear':
                await handleClear(interaction);
                break;
            case 'leave':
                await handleLeave(interaction);
                break;
            case 'musicconfig':
                const canalId = interaction.options.getString('canal_id');
                setMusicChannel(canalId);
                await interaction.reply({ content: `Canal de música configurado a <#${canalId}>.`, ephemeral: true });
                // Crear panel vacío
                await updateMusicPanel(null, null, client);
                return;
            case 'radio':
                await handleRadio(interaction, queues, connections, updateMusicPanel, client);
                break;
        }
    } catch (error) {
        console.error('Error al manejar comando:', error);
        if (!interaction.replied) {
            interaction.reply({ content: '❌ Ocurrió un error al procesar el comando.', ephemeral: true });
        }
    }
});

// Evento: mensaje de bienvenida cuando alguien entra al canal de voz con el bot
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Solo nos interesa cuando un usuario entra a un canal de voz
    if (oldState.channelId === newState.channelId) return; // No cambió de canal
    if (!newState.channelId) return; // No está en canal de voz ahora
    if (newState.member.user.bot) return;
    // Buscar si el bot está en ese canal
    const botMember = newState.guild.members.me;
    if (!botMember || !botMember.voice.channelId) return;
    if (botMember.voice.channelId !== newState.channelId) return;

    // Buscar canal de texto configurado
    const musicConfig = getMusicConfig();
    if (!musicConfig.channelId) return;
    const channel = await newState.guild.channels.fetch(musicConfig.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    // Enviar mensaje de bienvenida con ping real
    const embed = new EmbedBuilder()
        .setColor('#00ff99')
        .setTitle('👋 ¡Bienvenido al canal de música!')
        .setDescription(`Disfruta de la música con el bot. Usa \`/play\` para poner tu canción favorita o \`/radio\. para poner una emisora`)
        .setFooter({ text: 'Nixi Bot' });
    channel.send({
        content: `<@${newState.member.id}>`,
        embeds: [embed],
        allowedMentions: { users: [newState.member.id] }
    });
});

// Función para manejar el comando play
async function handlePlay(interaction) {
    const query = interaction.options.getString('query');
    if (DEBUG_MODE) console.log('Query:', JSON.stringify(query));
    const cleanQuery = query.trim().toLowerCase();
    const voiceChannel = interaction.member.voice.channel;
    const guildId = interaction.guildId;

    await interaction.deferReply();

    // Inicializar cola si no existe
    if (!queues.has(guildId)) {
        queues.set(guildId, new MusicQueue());
    }

    const queue = queues.get(guildId);
    queue.lastActivityTime = Date.now(); // Registrar actividad

    // Conectar al canal de voz si no está conectado
    if (!connections.has(guildId)) {
        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            connection.on(VoiceConnectionStatus.Disconnected, () => {
                connections.delete(guildId);
                queues.delete(guildId);
            });

            connections.set(guildId, connection);
            queue.connection = connection;
        } catch (error) {
            console.error('Error al conectar al canal de voz:', error);
            return interaction.editReply('❌ No pude conectarme al canal de voz.');
        }
    }

    let songInfo = null;

    // --- PRIMERO: Playlist de Spotify ---
    if (/spotify\.com\/.*playlist\//.test(cleanQuery)) {
        // Extraer el ID de la playlist usando el query original (sin toLowerCase)
        const playlistId = extractSpotifyPlaylistId(query.trim());
        console.log('ID de playlist extraído:', playlistId);
        if (!playlistId) {
            try {
                await interaction.editReply({ content: '❌ No se pudo extraer el ID de la playlist de Spotify.', ephemeral: true });
            } catch (e) {
                if (e.code === 10008 || e.code === 'InteractionAlreadyReplied') {
                    await interaction.followUp({ content: '❌ No se pudo extraer el ID de la playlist de Spotify.', ephemeral: true });
                } else {
                    throw e;
                }
            }
            return;
        }
        try {
            const result = await processSpotifyPlaylist(playlistId, interaction);
            for (const song of result.songs) {
                queue.addSong(song);
            }
            try {
                await interaction.editReply({ content: `✅ Se añadieron un total de ${result.songs.length} canciones de la playlist de Spotify a la cola.`, ephemeral: true });
            } catch (e) {
                if (e.code === 10008 || e.code === 'InteractionAlreadyReplied') {
                    await interaction.followUp({ content: `✅ Se añadieron un total de ${result.songs.length} canciones de la playlist de Spotify a la cola.`, ephemeral: true });
                } else {
                    throw e;
                }
            }
            if (!queue.isPlaying) {
                playMusic(guildId, interaction.channel);
            }
            // Actualizar panel de música después de añadir playlist
            await updateMusicPanel(queue.currentSong, queue, client);
            return;
        } catch (err) {
            console.error('Error al procesar la playlist de Spotify:', err);
            try {
                await interaction.editReply({ content: '❌ Error al procesar la playlist de Spotify. Esta playlist no esta visible para la API de Spotify.', ephemeral: true });
            } catch (e) {
                if (e.code === 10008 || e.code === 'InteractionAlreadyReplied') {
                    await interaction.followUp({ content: '❌ Error al procesar la playlist de Spotify. Esta playlist no esta visible para la API de Spotify.', ephemeral: true });
                } else {
                    throw e;
                }
            }
            return;
        }
    }

    // --- SEGUNDO: Track de Spotify ---
    if (/spotify\.com\/.*track\//.test(cleanQuery)) {
        console.log('--- INICIO FLUJO SPOTIFY TRACK ---');
        // Extraer el ID del track usando el query original (sin toLowerCase)
        const trackId = extractSpotifyId(query.trim());
        console.log('Track ID extraído:', trackId);
        if (!trackId) {
            console.log('No se pudo extraer el ID de la canción de Spotify');
            await interaction.editReply({ content: '❌ No se pudo extraer el ID de la canción de Spotify.', ephemeral: true });
            return;
        }
        
        songInfo = await processSpotifyTrack(trackId, interaction);
        if (!songInfo) {
            console.log('No se pudo obtener información de la canción de Spotify');
            await interaction.editReply({ content: '❌ No se pudo obtener información de la canción de Spotify.', ephemeral: true });
            return;
        }
        
        if (!songInfo.url) {
            console.log('No se pudo encontrar la canción en YouTube tras todos los intentos.');
            await interaction.editReply({ content: '❌ No se pudo encontrar la canción en YouTube.', ephemeral: true });
            return;
        }
        
        console.log('Canción encontrada y agregada a la cola:', songInfo);
        // Agregar canción a la cola
        queue.addSong(songInfo);

        // Crear embed de confirmación
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Canción agregada a la cola')
            .setDescription(`**${songInfo.title}**\nPor: ${songInfo.artist}`)
            .setThumbnail(songInfo.thumbnail)
            .addFields(
                { name: 'Duración', value: songInfo.duration, inline: true },
                { name: 'Posición en cola', value: `${queue.songs.length}`, inline: true },
                { name: 'Fuente', value: songInfo.source, inline: true }
            )
            .setFooter({ text: `Solicitado por ${songInfo.requestedBy}` });

        await interaction.editReply({ embeds: [embed], ephemeral: true });
        setTimeout(() => {
            if (interaction.channel) {
                interaction.deleteReply().catch(() => {});
            }
        }, 5000); // 5 segundos

        // Reproducir si no hay nada reproduciéndose
        if (!queue.isPlaying) {
            playMusic(guildId, interaction.channel);
        }
        // Actualizar panel de música después de añadir canción
        await updateMusicPanel(queue.currentSong, queue, client);
        console.log('--- FIN FLUJO SPOTIFY TRACK ---');
        return;
    }

    // --- TERCERO: Video individual de YouTube ---
    if (cleanQuery.includes('youtube.com/watch') || cleanQuery.includes('youtu.be/')) {
        songInfo = await processYouTubeVideo(cleanQuery, interaction);
    }
    // --- CUARTO: Playlist de YouTube ---
    else if (/list=/.test(cleanQuery)) {
        try {
            const result = await processYouTubePlaylist(query, interaction);
            for (const song of result.songs) {
                queue.addSong(song);
            }
            await interaction.editReply({ content: `✅ Se añadieron ${result.added} canciones de la playlist a la cola.`, ephemeral: true });
            // Si no hay nada reproduciéndose, empieza
            if (!queue.isPlaying) {
                playMusic(guildId, interaction.channel);
            }
            // Actualizar panel de música después de añadir playlist
            await updateMusicPanel(queue.currentSong, queue, client);
            return;
        } catch (err) {
            console.error('Error al procesar la playlist de YouTube:', err);
            await interaction.editReply({ content: '❌ Error al procesar la playlist de YouTube.', ephemeral: true });
            return;
        }
    }
    // --- QUINTO: Búsqueda genérica en YouTube ---
    else {
        console.log('--- FLUJO ELSE (búsqueda genérica en YouTube) ---');
        const youtubeVideo = await searchYouTube(cleanQuery);
        console.log('Resultado búsqueda YouTube:', youtubeVideo);
        if (youtubeVideo && youtubeVideo.videoId) {
            // Normalizar la URL de YouTube
            let normalizedUrl = `https://www.youtube.com/watch?v=${youtubeVideo.videoId}`;
            songInfo = {
                title: youtubeVideo.title,
                artist: youtubeVideo.author.name,
                url: normalizedUrl,
                thumbnail: youtubeVideo.thumbnail,
                duration: youtubeVideo.duration.timestamp || youtubeVideo.timestamp,
                requestedBy: interaction.user.tag,
                source: 'YouTube'
            };
        }
    }

    if (!songInfo || !songInfo.url) {
        console.error('No se pudo obtener una URL reproducible para la canción:', songInfo);
        return interaction.editReply({ content: '❌ No se pudo encontrar una canción reproducible para tu búsqueda.', ephemeral: true });
    }

    // Agregar canción a la cola
    queue.addSong(songInfo);

    // Crear embed de confirmación
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Canción agregada a la cola')
        .setDescription(`**${songInfo.title}**\nPor: ${songInfo.artist}`)
        .setThumbnail(songInfo.thumbnail)
        .addFields(
            { name: 'Duración', value: songInfo.duration, inline: true },
            { name: 'Posición en cola', value: `${queue.songs.length}`, inline: true },
            { name: 'Fuente', value: songInfo.source, inline: true }
        )
        .setFooter({ text: `Solicitado por ${songInfo.requestedBy}` });

    await interaction.editReply({ embeds: [embed], ephemeral: true });
    setTimeout(() => {
        if (interaction.channel) {
            interaction.deleteReply().catch(() => {});
        }
    }, 5000); // 5 segundos

    // Reproducir si no hay nada reproduciéndose
    if (!queue.isPlaying) {
        playMusic(guildId, interaction.channel);
    }
    // Actualizar panel de música después de añadir canción
    await updateMusicPanel(queue.currentSong, queue, client);
}

// Función para manejar el comando skip
async function handleSkip(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);

    if (!queue || !queue.isPlaying) {
        return interaction.reply({ content: '❌ No hay música reproduciéndose.', ephemeral: true });
    }

    queue.player.stop();
    // No enviar mensaje de confirmación para evitar spam de efímeros
    // await interaction.reply('⏭️ Canción saltada.');
}

// Función para manejar el comando queue
async function handleQueue(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);

    if (!queue || (queue.isEmpty() && !queue.currentSong)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Cola vacía')
            .setDescription('No hay canciones en la cola. Usa `/play` para añadir música.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let queueList = '';
    if (queue.currentSong) {
        queueList += `🎶 **Reproduciendo ahora:**\n`;
        queueList += `> **${queue.currentSong.title}** — *${queue.currentSong.artist}*\n`;
        if (queue.currentSong.duration) queueList += `> ⏱️ ${queue.currentSong.duration}`;
        if (queue.currentSong.requestedBy) queueList += ` | 🙋‍♂️ ${queue.currentSong.requestedBy}`;
        if (queue.currentSong.source) queueList += ` | 🌐 ${queue.currentSong.source}`;
        queueList += '\n\n';
    }

    if (!queue.isEmpty()) {
        queueList += '📋 **En cola:**\n';
        queue.songs.slice(0, 10).forEach((song, index) => {
            const estado = song.pending ? '⏳ (pendiente)' : '✅';
            queueList += `**${index + 1}.** ${song.title} — *${song.artist}* ${estado}`;
            if (song.requestedBy) queueList += ` | 🙋‍♂️ ${song.requestedBy}`;
            if (song.source) queueList += ` | 🌐 ${song.source}`;
            queueList += '\n';
        });
        if (queue.songs.length > 10) {
            queueList += `\n... y ${queue.songs.length - 10} más`;
        }
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📋 Cola de reproducción')
        .setDescription(queueList)
        .setFooter({ text: `Total de canciones: ${queue.songs.length + (queue.currentSong ? 1 : 0)}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Función para manejar el comando stop
async function handleStop(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);

    if (!queue) {
        return interaction.reply({ content: '❌ No hay música reproduciéndose.', ephemeral: true });
    }

    queue.clearCrossfade(); // Limpiar crossfade
    queue.clear();
    queue.isPlaying = false;
    if (queue.player) {
        queue.player.stop();
    }

    await interaction.reply('⏹️ Reproducción detenida y cola limpiada.');
}

// Función para manejar el comando pause
async function handlePause(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);

    if (!queue || !queue.isPlaying) {
        return interaction.reply({ content: '❌ No hay música reproduciéndose.', ephemeral: true });
    }

    queue.player.pause();
    await interaction.reply('⏸️ Reproducción pausada.');
}

// Función para manejar el comando resume
async function handleResume(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);

    if (!queue || !queue.player) {
        return interaction.reply({ content: '❌ No hay música para reanudar.', ephemeral: true });
    }

    queue.player.unpause();
    await interaction.reply('▶️ Reproducción reanudada.');
}

// Función para manejar el comando volume
async function handleVolume(interaction) {
    const volume = interaction.options.getInteger('level');
    await interaction.reply(`🔊 Volumen ajustado a ${volume}%\n*Nota: El control de volumen requiere configuración adicional.*`);
}

// Función para manejar el comando nowplaying
async function handleNowPlaying(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);

    if (!queue || !queue.currentSong) {
        return interaction.reply({ content: '❌ No hay música reproduciéndose.', ephemeral: true });
    }

    const song = queue.currentSong;
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎵 Reproduciendo ahora')
        .setDescription(`**${song.title}**\nPor: ${song.artist}`)
        .setImage(song.thumbnail)
        .addFields(
            { name: 'Duración', value: song.duration, inline: true },
            { name: 'Solicitado por', value: song.requestedBy, inline: true },
            { name: 'Fuente', value: song.source, inline: true }
        )
        .setFooter({ text: `Canciones en cola: ${queue.songs.length}` });

    await interaction.reply({ embeds: [embed] });
}

// Función para manejar el comando clear
async function handleClear(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);

    if (!queue || queue.isEmpty()) {
        return interaction.reply({ content: '❌ La cola ya está vacía.', ephemeral: true });
    }

    const clearedCount = queue.songs.length;
    queue.songs = [];
    
    await interaction.reply(`🗑️ Se limpiaron ${clearedCount} canciones de la cola.`);
}

// Función para manejar el comando leave
async function handleLeave(interaction) {
    const guildId = interaction.guildId;
    const connection = connections.get(guildId);
    const queue = queues.get(guildId);

    if (!connection) {
        return interaction.reply({ content: '❌ No estoy conectado a ningún canal de voz.', ephemeral: true });
    }

    if (queue) {
        queue.clearCrossfade(); // Limpiar crossfade
    }
    
    connection.destroy();
    connections.delete(guildId);
    queues.delete(guildId);

    await interaction.reply('👋 Desconectado del canal de voz.');
}

// Función para manejar el comando help
async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🤖 Ayuda de Nixi Bot')
        .setDescription('Aquí tienes los comandos principales que puedes usar:')
        .addFields(
            { name: '/play <canción o enlace>', value: '🎵 Reproduce música de YouTube o Spotify.' },
            { name: '/skip', value: '⏭️ Salta la canción actual.' },
            { name: '/queue o /cola', value: '📋 Muestra la cola de reproducción.' },
            { name: '/shuffle', value: '🔀 Mezcla aleatoriamente la cola de canciones.' },
            { name: '/stop', value: '⏹️ Detiene la reproducción y limpia la cola.' },
            { name: '/pause', value: '⏸️ Pausa la reproducción.' },
            { name: '/resume', value: '▶️ Reanuda la reproducción.' },
            { name: '/nowplaying', value: '🎶 Muestra la canción actual.' },
            { name: '/clear', value: '🧹 Limpia la cola de reproducción.' },
            { name: '/remove <posición>', value: '🗑️ Elimina una canción específica de la cola.' },
            { name: '/leave', value: '🚪 Desconecta el bot del canal de voz.' },
            { name: '/musicconfig <canal_id>', value: '⚙️ Configura el canal de texto para el panel de música.' },
            { name: '/radio', value: '📻 Reproduce una estación de radio en vivo.' },
        )
        .setFooter({ text: '¡Disfruta de la música! 💪' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Función para manejar el comando remove
async function handleRemove(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);
    const pos = interaction.options.getInteger('posicion');

    if (!queue || queue.isEmpty()) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Cola vacía')
            .setDescription('No hay canciones en la cola.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (pos < 1 || pos > queue.songs.length) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Posición inválida')
            .setDescription(`Debes elegir un número entre 1 y ${queue.songs.length}.`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const removed = queue.songs.splice(pos - 1, 1)[0];
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🗑️ Canción eliminada de la cola')
        .setDescription(`**${removed.title}** — *${removed.artist}* fue eliminada de la cola.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    await updateMusicPanel(queue.currentSong, queue, client);
}

// Función para manejar el comando shuffle
async function handleShuffle(interaction) {
    const guildId = interaction.guildId;
    const queue = queues.get(guildId);

    if (!queue || queue.isEmpty()) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Cola vacía')
            .setDescription('No hay canciones en la cola para mezclar.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const countBefore = queue.songs.length;
    queue.shuffle();
    
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔀 Cola mezclada')
        .setDescription(`Se mezclaron **${countBefore}** canciones aleatoriamente.`)
        .setFooter({ text: 'Usa /queue para ver el nuevo orden' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Manejar errores
client.on('error', console.error);

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

if (process.env.NODE_ENV !== 'gestion') {
    const { fork } = require('child_process');
    fork('gestion.js', [], {
        env: { ...process.env, NODE_ENV: 'gestion' }
    });
}

// Iniciar el bot
client.login(config.token);
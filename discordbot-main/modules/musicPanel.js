const { EmbedBuilder } = require('discord.js');
const fs = require('fs');

const MUSIC_CONFIG_FILE = 'music_config.json';
let musicConfig = { channelId: '1392257622324940993', panelMessageId: null };

// Cargar config si existe
if (fs.existsSync(MUSIC_CONFIG_FILE)) {
    try {
        musicConfig = JSON.parse(fs.readFileSync(MUSIC_CONFIG_FILE, 'utf8'));
    } catch (e) { 
        console.error('Error leyendo config de música:', e); 
    }
}

function saveMusicConfig() {
    fs.writeFileSync(MUSIC_CONFIG_FILE, JSON.stringify(musicConfig, null, 2));
}

// Función para crear o actualizar el panel de música
async function updateMusicPanel(song, queue, client) {
    if (!musicConfig.channelId) return;
    
    const channel = await client.channels.fetch(musicConfig.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    
    let embed;
    if (song) {
        embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 Reproduciendo ahora')
            .setDescription(`**${song.title}**\nPor: *${song.artist}*`)
            // Si es radio, usa setImage para mostrar el gif grande
            [song.source && song.source.toLowerCase().includes('radio') ? 'setImage' : 'setThumbnail'](song.thumbnail)
            .addFields(
                { name: '⏱️ Duración', value: song.duration || '-', inline: true },
                { name: '🙋‍♂️ Solicitado por', value: song.requestedBy || '-', inline: true },
                { name: '🌐 Fuente', value: song.source || '-', inline: true },
                { name: '🎶 En cola', value: queue ? `${queue.songs.length}` : '0', inline: true }
            )
            .setFooter({ text: 'Controla la música con los botones' });
    } else {
        embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 ¡No hay música reproduciéndose!')
            .setDescription(
                '¡Hola! Usa `/play <nombre o enlace>` para poner música en el canal de voz o `/radio` para poner una emisora.\n\n' +
                'Puedes controlar la música con los botones de abajo.\n\n' +
                '✨ ¡Disfruta y comparte tus canciones favoritas!'
            )
            .setImage('https://i.pinimg.com/originals/76/51/21/765121efbcf2a4ad57006ab5f805ed3f.gif')
            .setFooter({ text: 'Usa /play para empezar a escuchar música' });
    }
    
    const row = new (require('discord.js').ActionRowBuilder)().addComponents(
        new (require('discord.js').ButtonBuilder)().setCustomId('music_pause').setLabel('⏸️/▶️').setStyle(1),
        new (require('discord.js').ButtonBuilder)().setCustomId('music_skip').setLabel('⏭️').setStyle(2),
        new (require('discord.js').ButtonBuilder)().setCustomId('music_stop').setLabel('⏹️').setStyle(4)
    );
    
    // Si ya hay panel, edítalo
    if (musicConfig.panelMessageId) {
        try {
            const msg = await channel.messages.fetch(musicConfig.panelMessageId);
            await msg.edit({ embeds: [embed], components: [row] });
            return;
        } catch (e) { 
            /* Si falla, crea uno nuevo */ 
        }
    }
    
    // Si no, crea uno nuevo
    const panelMsg = await channel.send({ embeds: [embed], components: [row] });
    musicConfig.panelMessageId = panelMsg.id;
    saveMusicConfig();
}

// Función para configurar el canal de música
function setMusicChannel(channelId) {
    musicConfig.channelId = channelId;
    musicConfig.panelMessageId = null;
    saveMusicConfig();
}

// Función para obtener la configuración actual
function getMusicConfig() {
    return musicConfig;
}

module.exports = {
    updateMusicPanel,
    setMusicChannel,
    getMusicConfig
}; 
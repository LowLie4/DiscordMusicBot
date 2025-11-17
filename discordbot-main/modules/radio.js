const { EmbedBuilder } = require('discord.js');
const { getYtDlpStream } = require('./youtube');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');

// Configuración de estaciones de radio
const radioStations = {
    flaixfm: {
        name: 'Flaix FM',
        streamUrl: 'https://mdstrm.com/audio/65afe4a0357cec56667ac739/icecast.audio',
        description: 'Música electrónica y dance',
        emoji: '🎧',
        image: 'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2hhYW80c3d4aXZiZDl0bzU0aGlkYmExODh3MWpybHZzdHMweG5uMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/dxlaDHveUTXBqx2e9W/giphy.gif'
    },
    los40: {
        name: 'Los 40',
        streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_SC', // Placeholder
        description: 'La música del momento',
        emoji: '🎵',
        image: 'https://media3.giphy.com/avatars/LOS40/Iv5vQC5rkfbE.gif'
    },
    flaixbac:{
        name: 'Flaix Bac',
        streamUrl: 'https://mdstrm.com/audio/65afe517d47dc208abd053d2/icecast.audio',
        description: 'Música electrónica y dance',
        emoji: '🎧',
        image: 'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExdnl4N2t3dTdscjc1NXZrbnRvbmp4bmtwenBxeHJ2aXZhNjZmb3pndyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/XaGVF6ZmMXj3VEPeca/giphy.gif'
    
    },
    proxima:{
        name: 'ProximaFM',
        streamUrl: 'http://91.187.93.115:8000/;?type=http&nocache=646',
        description: 'Música electrónica y dance',
        emoji: '🎧',
        image: 'https://lh6.googleusercontent.com/proxy/TYgxbLjI4N-HF3PlVEPb57RXTjEJhYwS2FtM9pQUkR1gojqg-8EYhiYDBkb_g1TZ-diE-ShXUafCTttabLcBYnyT6xq0mds3FeDa4U7oX-OaKHrnG7N4evwAWwWxvg'
    }
};

// Función para manejar el comando radio
async function handleRadio(interaction, queues, connections, updateMusicPanel, client) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎧 Estaciones de Radio')
        .setDescription('Selecciona una estación de radio para reproducirla en vivo.');

    const options = Object.entries(radioStations).map(([key, station]) => ({
        label: `${station.emoji} ${station.name} - ${station.description}`,
        value: key
    }));

    const row = new (require('discord.js').ActionRowBuilder)()
        .addComponents(
            new (require('discord.js').StringSelectMenuBuilder)()
                .setCustomId('radio_select')
                .setPlaceholder('Selecciona una estación de radio')
                .addOptions(options)
        );

    await interaction.reply({ embeds: [embed], components: [row] });

    // Crear un collector para manejar la selección
    const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.customId === 'radio_select' && i.user.id === interaction.user.id,
        time: 300000 // 5 minutos
    });

    collector.on('collect', async i => {
        const selectedStationName = i.values[0];
        console.log('Valor seleccionado en radio:', selectedStationName);
        console.log('Estaciones disponibles:', Object.keys(radioStations));
        const selectedStation = radioStations[selectedStationName];
        console.log('Estación encontrada:', selectedStation);

        if (!selectedStation) {
            console.log('No se encontró la estación para:', selectedStationName);
            await i.update({
                content: '❌ Estación de radio no encontrada.',
                embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Error').setDescription('Estación de radio no encontrada.')],
                components: []
            });
            return;
        }

        await i.deferUpdate();
        // Eliminado el editReply de confirmación para una experiencia más limpia
        // await i.editReply({
        //     content: `🎧 Reproduciendo ${selectedStation.emoji} ${selectedStation.name}`,
        //     embeds: [new EmbedBuilder().setColor('#00ff00').setTitle('🎧 Reproduciendo').setDescription(`**${selectedStation.name}**\n${selectedStation.description}`).setImage(selectedStation.image)],
        //     components: []
        // });

        const guildId = i.guildId;
        let queue = queues.get(guildId);
        if (!queue) {
            const MusicQueue = require('./musicQueue');
            queues.set(guildId, new MusicQueue());
            queue = queues.get(guildId);
        }

        // Crear objeto de canción de radio para el panel
        const radioSong = {
            title: `${selectedStation.emoji} ${selectedStation.name}`,
            artist: 'Radio en vivo',
            url: selectedStation.streamUrl,
            thumbnail: selectedStation.image,
            duration: 'En vivo',
            requestedBy: i.user.tag,
            source: 'radio' // <-- Aseguramos que contenga 'radio' en minúsculas
        };

        // Establecer como canción actual
        queue.currentSong = radioSong;
        queue.isPlaying = true;

        if (!connections.has(guildId)) {
            try {
                const voiceChannel = i.member.voice.channel;
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
                console.error('Error al conectar al canal de voz para radio:', error);
                await i.followUp({
                    content: '❌ No pude conectarme al canal de voz para reproducir la radio.',
                    ephemeral: true
                }).catch(console.error);
                return;
            }
        }

        try {
            const stream = await getYtDlpStream(selectedStation.streamUrl);
            const resource = createAudioResource(stream, { inlineVolume: true });
            resource.volume.setVolume(0.1);

            if (!queue.player) {
                queue.player = createAudioPlayer();
                queue.connection.subscribe(queue.player);
            }

            queue.player.play(resource);
            queue.isPlaying = true;

            // Actualizar panel de música con la radio
            await updateMusicPanel(radioSong, queue, client);

            queue.player.on(AudioPlayerStatus.Idle, async () => {
                queue.isPlaying = false;
                queue.currentSong = null;
                await updateMusicPanel(null, queue, client);
                // No enviar mensaje efímero de aviso para evitar spam
                // await i.followUp({
                //     content: `🎧 Reproducción de ${selectedStation.name} detenida.`,
                //     ephemeral: true
                // }).catch(console.error);
            });

            queue.player.on('error', error => {
                console.error('Error en el reproductor de radio:', error);
                queue.isPlaying = false;
                queue.currentSong = null;
                updateMusicPanel(null, queue, client);
                i.followUp({
                    content: `❌ Error al reproducir la radio: ${error.message}`,
                    ephemeral: true
                }).catch(console.error);
            });

            // No enviar mensaje de confirmación tras iniciar la radio
            // await i.followUp({
            //     content: `🎧 Reproduciendo ${selectedStation.emoji} ${selectedStation.name}`,
            //     ephemeral: true
            // }).catch(console.error);

        } catch (error) {
            console.error('Error al reproducir la radio:', error);
            queue.isPlaying = false;
            queue.currentSong = null;
            await updateMusicPanel(null, queue, client);
            await i.followUp({
                content: `❌ Error al reproducir la radio: ${error.message}`,
                ephemeral: true
            }).catch(console.error);
        }

        // collector.stop(); // <-- Eliminado para permitir múltiples selecciones
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({
                content: '⏰ Tiempo de espera agotado. Usa `/radio` de nuevo para seleccionar una estación.',
                embeds: [],
                components: []
            }).catch(console.error);
        } else {
            // Deshabilitar el menú cuando el tiempo expire
            const disabledRow = new (require('discord.js').ActionRowBuilder)()
                .addComponents(
                    new (require('discord.js').StringSelectMenuBuilder)()
                        .setCustomId('radio_select')
                        .setPlaceholder('Selecciona una estación de radio')
                        .addOptions(options)
                        .setDisabled(true)
                );
            interaction.editReply({
                content: '⏰ Tiempo de espera agotado. Usa `/radio` de nuevo para seleccionar una estación.',
                embeds: [],
                components: [disabledRow]
            }).catch(console.error);
        }
    });
}

module.exports = {
    radioStations,
    handleRadio
}; 
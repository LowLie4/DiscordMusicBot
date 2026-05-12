// gestion.js
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const MUSIC_CONFIG_FILE = 'music_config.json';
let musicConfig = { channelId: null, panelMessageId: null };
if (fs.existsSync(MUSIC_CONFIG_FILE)) {
    try {
        musicConfig = JSON.parse(fs.readFileSync(MUSIC_CONFIG_FILE, 'utf8'));
    } catch (e) { console.error('Error leyendo config de música:', e); }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', async () => {
    console.log(`🤖 Bot de gestión conectado como ${client.user.tag}`);
    console.log(`📋 Configuración: Canal=${musicConfig.channelId}, Panel=${musicConfig.panelMessageId}`);

    if (!musicConfig.channelId || !musicConfig.panelMessageId) {
        console.log('⚠️ No hay canal o panel configurado. Edita music_config.json o usa /musicconfig en el bot principal.');
        return;
    }

    console.log('🧹 Ejecutando limpieza inicial...');
    await limpiarCanal();

    console.log('⏰ Configurando limpieza periódica cada 30 segundos...');
    setInterval(limpiarCanal, 30 * 1000); // Cada 30 segundos para pruebas
});

// Función de limpieza
async function limpiarCanal() {
    try {
        console.log('🧹 Iniciando limpieza de canal...');
        const channel = await client.channels.fetch(musicConfig.channelId);
        if (!channel || !channel.isTextBased()) {
            console.log('❌ Canal no encontrado o no es de texto');
            return;
        }

        const now = Date.now();
        console.log('📨 Obteniendo mensajes...');
        const messages = await channel.messages.fetch({ limit: 100 });
        console.log(`📨 Encontrados ${messages.size} mensajes`);

        // Detectar panel por ID o por contenido (título o footer)
        const isPanelMessage = msg => {
            if (musicConfig.panelMessageId && msg.id === musicConfig.panelMessageId) {
                console.log(`📌 Mensaje ${msg.id} es el panel (por ID)`);
                return true;
            }
            if (!msg.embeds || msg.embeds.length === 0) return false;
            const embed = msg.embeds[0];
            // Detectar por título o footer característico
            if (embed.title && embed.title.includes('Reproduciendo ahora')) {
                console.log(`📌 Mensaje ${msg.id} es el panel (por título "Reproduciendo ahora")`);
                return true;
            }
            if (embed.title && embed.title.includes('¡No hay música reproduciéndose!')) {
                console.log(`📌 Mensaje ${msg.id} es el panel (por título "No hay música")`);
                return true;
            }
            if (embed.footer && embed.footer.text && embed.footer.text.includes('Controla la música con los botones')) {
                console.log(`📌 Mensaje ${msg.id} es el panel (por footer "Controla la música")`);
                return true;
            }
            if (embed.footer && embed.footer.text && embed.footer.text.includes('Usa /play para empezar a escuchar música')) {
                console.log(`📌 Mensaje ${msg.id} es el panel (por footer "Usa /play")`);
                return true;
            }
            return false;
        };

        // Excluir mensajes recientes (últimos 30 segundos) y el panel
        let toDelete;
        if (musicConfig.panelMessageId === null) {
            // Si no hay panelMessageId, protege cualquier mensaje que parezca panel
            toDelete = messages.filter(msg => !isPanelMessage(msg) && !msg.pinned && (now - msg.createdTimestamp > 30 * 1000));
        } else {
            toDelete = messages.filter(msg => !isPanelMessage(msg) && !msg.pinned && (now - msg.createdTimestamp > 30 * 1000));
        }

        console.log(`🗑️ Mensajes a borrar: ${toDelete.size}`);

        if (toDelete.size > 0) {
            await channel.bulkDelete(toDelete, true);
            console.log(`✅ Borrados ${toDelete.size} mensajes en el canal de música.`);
        } else {
            console.log('ℹ️ No hay mensajes para borrar');
        }
    } catch (e) {
        console.error('❌ Error limpiando el canal de música:', e);
    }
}

client.login(process.env.DISCORD_TOKEN); 
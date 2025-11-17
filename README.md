# 🎵 Discord Music Bot

Un bot de música avanzado para Discord que permite reproducir música desde YouTube, Spotify y estaciones de radio en vivo. Incluye un panel de música interactivo, gestión de colas y múltiples funcionalidades para mejorar la experiencia musical en tu servidor.

## ✨ Características

- 🎶 **Reproducción de música desde múltiples fuentes**
  - YouTube (vídeos individuales y playlists)
  - Spotify (canciones individuales y playlists)
  - Estaciones de radio en vivo
  - Búsqueda de canciones por nombre

- 🎛️ **Panel de música interactivo**
  - Muestra la canción actual con thumbnail
  - Botones para controlar la reproducción (pausar, saltar, detener)
  - Actualización automática del estado
  - Limpieza automática de mensajes del canal

- 📋 **Gestión avanzada de cola**
  - Cola de reproducción con múltiples canciones
  - Visualización de la cola con `/queue`
  - Eliminar canciones específicas de la cola
  - Limpiar toda la cola

- 🎧 **Controles de reproducción**
  - Play/Pause/Resume
  - Skip de canciones
  - Control de volumen
  - Detener reproducción

- 📻 **Estaciones de radio**
  - Reproducción de estaciones de radio en vivo
  - Múltiples estaciones preconfiguradas
  - Interfaz de selección interactiva

- 🔔 **Mensajes de bienvenida**
  - Notificación automática cuando alguien entra al canal de voz
  - Guía rápida para usar el bot

## 📋 Requisitos Previos

- **Node.js** >= 16.0.0
- **FFmpeg** instalado en el sistema
- **yt-dlp** instalado (se puede instalar automáticamente con Docker)
- **Cuenta de Discord** con un bot creado
- **API de Spotify** (opcional, para funcionalidad de Spotify)

## 🚀 Instalación

### 1. Clonar el repositorio

### 2. Instalar dependencias

```bash
npm install
```

### 3. Instalar FFmpeg y yt-dlp

#### Windows:
- Descarga FFmpeg desde [ffmpeg.org](https://ffmpeg.org/download.html) o usa la versión incluida en `ffmpeg-7.1.1/`
- Instala yt-dlp: `pip install yt-dlp` o descárgalo desde [yt-dlp GitHub](https://github.com/yt-dlp/yt-dlp)

#### Linux/macOS:
```bash
# FFmpeg
sudo apt-get install ffmpeg  # Debian/Ubuntu
brew install ffmpeg          # macOS

# yt-dlp
pip install yt-dlp
# o
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 4. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto basándote en `env_example.sh`:

```bash
# Discord Bot Configuration
DISCORD_TOKEN=tu_token_de_discord_aqui
CLIENT_ID=tu_client_id_aqui
GUILD_ID=tu_guild_id_aqui_opcional

# Spotify API Configuration (opcional)
SPOTIFY_CLIENT_ID=tu_spotify_client_id_aqui
SPOTIFY_CLIENT_SECRET=tu_spotify_client_secret_aqui
```

### 5. Obtener credenciales

#### Discord Bot:
1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Crea una nueva aplicación
3. Ve a "Bot" y crea un bot
4. Copia el token del bot
5. Ve a "OAuth2" > "URL Generator"
6. Selecciona los scopes: `bot` y `applications.commands`
7. Selecciona los permisos necesarios: `Connect`, `Speak`, `Use Voice Activity`, `Send Messages`, `Embed Links`
8. Invita el bot a tu servidor usando la URL generada

#### Spotify API (opcional):
1. Ve a [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Crea una nueva aplicación
3. Copia el Client ID y Client Secret

## 🎮 Uso

### Iniciar el bot

```bash
npm start
```

### Modo desarrollo (con nodemon)

```bash
npm run dev
```

### Usar Docker

```bash
# Construir la imagen
docker build -t discord-music-bot .

# Ejecutar el contenedor
docker run -d --name discord-bot --env-file .env discord-music-bot
```

O usa Docker Compose (ver `docker_compose.txt` para referencia).

## 📖 Comandos

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `/play <canción o enlace>` | Reproduce música de YouTube o Spotify | `/play Bohemian Rhapsody` |
| `/skip` | Salta la canción actual | `/skip` |
| `/queue` o `/cola` | Muestra la cola de reproducción | `/queue` |
| `/pause` | Pausa la reproducción | `/pause` |
| `/resume` | Reanuda la reproducción | `/resume` |
| `/stop` | Detiene la reproducción y limpia la cola | `/stop` |
| `/nowplaying` | Muestra la canción actual | `/nowplaying` |
| `/clear` | Limpia la cola de reproducción | `/clear` |
| `/remove <posición>` | Elimina una canción específica de la cola | `/remove 3` |
| `/volume <0-100>` | Ajusta el volumen | `/volume 50` |
| `/leave` | Desconecta el bot del canal de voz | `/leave` |
| `/radio` | Reproduce una estación de radio en vivo | `/radio` |
| `/musicconfig <canal_id>` | Configura el canal para el panel de música | `/musicconfig 123456789` |
| `/help` | Muestra la ayuda y comandos disponibles | `/help` |

## 🎯 Ejemplos de Uso

### Reproducir una canción de YouTube
```
/play https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### Reproducir una playlist de Spotify
```
/play https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
```

### Buscar y reproducir una canción
```
/play Bohemian Rhapsody Queen
```

### Reproducir radio
```
/radio
```
Luego selecciona una estación del menú desplegable.

## 🏗️ Estructura del Proyecto

```
discord-music-bot/
├── discord_music_bot.js    # Archivo principal del bot
├── gestion.js              # Bot auxiliar para limpieza de mensajes
├── health_check.js         # Health check (si existe)
├── modules/
│   ├── musicQueue.js       # Gestión de cola de reproducción
│   ├── musicPanel.js       # Panel de música interactivo
│   ├── youtube.js          # Funcionalidades de YouTube
│   ├── spotify.js          # Funcionalidades de Spotify
│   ├── radio.js            # Estaciones de radio
│   └── utils.js            # Utilidades varias
├── music_config.json       # Configuración del panel de música
├── package.json            # Dependencias del proyecto
├── pm2_config.js          # Configuración para PM2
├── Dockerfile              # Configuración de Docker
└── README.md               # Este archivo
```

## ⚙️ Configuración Avanzada

### Panel de Música

El panel de música se configura automáticamente cuando usas el comando `/musicconfig`. El archivo `music_config.json` almacena la configuración:

```json
{
  "channelId": "ID_DEL_CANAL",
  "panelMessageId": "ID_DEL_MENSAJE_PANEL"
}
```

### Estaciones de Radio

Puedes agregar más estaciones de radio editando `modules/radio.js` y añadiendo nuevas entradas al objeto `radioStations`.

### Gestión de Mensajes

El archivo `gestion.js` se ejecuta automáticamente para limpiar mensajes antiguos del canal de música, manteniendo solo el panel activo.

## 🐳 Docker

El proyecto incluye un `Dockerfile` que instala automáticamente todas las dependencias necesarias, incluyendo FFmpeg y yt-dlp.

### Construir y ejecutar con Docker

```bash
docker build -t discord-music-bot .
docker run -d --name discord-bot --env-file .env discord-music-bot
```

## 🔧 Solución de Problemas

### El bot no se conecta al canal de voz
- Verifica que el bot tenga permisos para conectarse y hablar en el canal
- Asegúrate de que estés en el mismo canal de voz

### Error al reproducir música
- Verifica que FFmpeg esté instalado correctamente
- Verifica que yt-dlp esté instalado y actualizado
- Revisa los logs del bot para más detalles

### El panel de música no aparece
- Usa `/musicconfig` para configurar el canal
- Verifica que el bot tenga permisos para enviar mensajes y embeds en ese canal

### Spotify no funciona
- Verifica que las credenciales de Spotify estén correctas en el `.env`
- Asegúrate de que la playlist/canción sea pública o accesible por la API

## 📝 Notas

- El bot requiere que los usuarios estén en un canal de voz para usar comandos de reproducción
- Las playlists de Spotify deben ser públicas o accesibles por la API
- El volumen por defecto está configurado en 10% (0.1)
- El bot limpia automáticamente mensajes antiguos del canal de música cada minuto

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request



---

⭐ Si te gusta este proyecto, ¡no olvides darle una estrella!


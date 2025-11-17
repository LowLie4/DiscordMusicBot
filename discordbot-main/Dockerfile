FROM node:20-alpine

# Instala dependencias del sistema
RUN apk add --no-cache ffmpeg python3 py3-pip curl

# Instala yt-dlp usando pip y la opción --break-system-packages
RUN pip3 install --break-system-packages --no-cache-dir yt-dlp

# Crea el directorio de trabajo
WORKDIR /app

# Copia los archivos del proyecto
COPY . .

# Instala dependencias de Node.js
RUN npm install

# Exponer puerto (si lo necesitas)
EXPOSE 3000

# Comando por defecto
CMD ["node", "discord_music_bot.js"]
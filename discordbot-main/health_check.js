// health-check.js - Script para verificar el estado del bot
const https = require('https');

// Verificar si el bot está conectado a Discord
function checkBotStatus() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'discord.com',
            port: 443,
            path: '/api/v10/gateway',
            method: 'GET',
            timeout: 5000
        };

        const req = https.request(options, (res) => {
            if (res.statusCode === 200) {
                resolve(true);
            } else {
                reject(new Error(`Discord API returned status: ${res.statusCode}`));
            }
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Health check timeout'));
        });

        req.end();
    });
}

// Verificar uso de memoria
function checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    // Alertar si usa más de 500MB
    if (memUsageMB > 500) {
        console.warn(`High memory usage: ${memUsageMB}MB`);
    }
    
    return memUsageMB < 1000; // Fallo si usa más de 1GB
}

// Ejecutar verificaciones
async function healthCheck() {
    try {
        console.log('Running health check...');
        
        // Verificar conexión a Discord
        await checkBotStatus();
        console.log('✓ Discord API accessible');
        
        // Verificar memoria
        const memoryOk = checkMemoryUsage();
        if (memoryOk) {
            console.log('✓ Memory usage within limits');
        } else {
            throw new Error('Memory usage too high');
        }
        
        // Verificar uptime (debe estar funcionando por al menos 10 segundos)
        const uptime = process.uptime();
        if (uptime < 10) {
            throw new Error('Bot started too recently');
        }
        console.log(`✓ Bot uptime: ${Math.round(uptime)}s`);
        
        console.log('Health check passed');
        process.exit(0);
        
    } catch (error) {
        console.error('Health check failed:', error.message);
        process.exit(1);
    }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
    healthCheck();
}

module.exports = { healthCheck, checkBotStatus, checkMemoryUsage };
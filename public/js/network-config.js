// Configuración automática de IP para conexiones remotas
window.addEventListener('load', () => {
    detectNetworkAndShowInstructions();
});

function detectNetworkAndShowInstructions() {
    const isLocal = location.hostname === 'localhost' || 
                   location.hostname === '127.0.0.1' || 
                   location.hostname.includes('192.168');
    
    if (isLocal) {
        // Mostrar instrucciones para conexión remota
        addConnectionInstructions();
    }
    
    console.log('🌐 Configuración de red detectada:');
    console.log(`Host: ${location.hostname}`);
    console.log(`Protocol: ${location.protocol}`);
    console.log(`Port: ${location.port}`);
    console.log(`Es local: ${isLocal ? 'Sí' : 'No'}`);
    
    if (location.protocol === 'http:' && !isLocal) {
        console.warn('⚠️ HTTPS requerido para cámara en internet');
    }
}

function addConnectionInstructions() {
    // Crear panel de instrucciones solo si es conexión local
    const instructionsPanel = document.createElement('div');
    instructionsPanel.id = 'network-instructions';
    instructionsPanel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #ff4444;
        color: white;
        padding: 15px;
        border-radius: 8px;
        max-width: 300px;
        z-index: 1000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        font-size: 12px;
        line-height: 1.4;
    `;
    
    instructionsPanel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px;">
            🌐 PARA USAR EN INTERNET:
        </div>
        <div style="margin-bottom: 8px;">
            1. Despliega en <strong>Render.com</strong>
        </div>
        <div style="margin-bottom: 8px;">
            2. O encuentra tu IP pública
        </div>
        <div style="margin-bottom: 8px;">
            3. Configura port forwarding puerto 3000
        </div>
        <div style="margin-bottom: 8px;">
            4. Usa <strong>HTTPS</strong> para cámara móvil
        </div>
        <button onclick="this.parentElement.style.display='none'" 
                style="background:white;color:#ff4444;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;margin-top:8px;">
            Entendido
        </button>
    `;
    
    document.body.appendChild(instructionsPanel);
    
    // Auto-ocultar después de 15 segundos
    setTimeout(() => {
        if (instructionsPanel.parentElement) {
            instructionsPanel.style.opacity = '0';
            instructionsPanel.style.transition = 'opacity 1s';
            setTimeout(() => {
                if (instructionsPanel.parentElement) {
                    instructionsPanel.remove();
                }
            }, 1000);
        }
    }, 15000);
}

// Función para obtener IP pública (para debugging)
function getPublicIP() {
    return fetch('https://api.ipify.org?format=json')
        .then(response => response.json())
        .then(data => {
            console.log(`🌐 Tu IP pública: ${data.ip}`);
            console.log(`📱 URL para móviles: http://${data.ip}:3000`);
            return data.ip;
        })
        .catch(error => {
            console.log('No se pudo obtener IP pública:', error.message);
            return null;
        });
}

// Ejecutar automáticamente
if (typeof window !== 'undefined') {
    getPublicIP();
}
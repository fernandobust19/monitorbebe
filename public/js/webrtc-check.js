// Script para verificar conectividad WebRTC
function checkWebRTCSupport() {
    const checks = {
        webrtc: false,
        getUserMedia: false,
        https: false,
        iceServers: false
    };
    
    // Verificar soporte WebRTC
    if (window.RTCPeerConnection) {
        checks.webrtc = true;
        console.log('✅ WebRTC soportado');
    } else {
        console.log('❌ WebRTC NO soportado');
    }
    
    // Verificar getUserMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        checks.getUserMedia = true;
        console.log('✅ getUserMedia soportado');
    } else {
        console.log('❌ getUserMedia NO soportado');
    }
    
    // Verificar HTTPS
    if (location.protocol === 'https:' || location.hostname === 'localhost') {
        checks.https = true;
        console.log('✅ Protocolo seguro');
    } else {
        console.log('❌ Se requiere HTTPS para funcionalidad completa');
    }
    
    // Test de conectividad ICE
    testIceConnectivity().then(result => {
        checks.iceServers = result;
        if (result) {
            console.log('✅ Servidores ICE funcionando');
        } else {
            console.log('❌ Problemas con servidores ICE');
        }
    });
    
    return checks;
}

async function testIceConnectivity() {
    return new Promise((resolve) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        });
        
        let candidateReceived = false;
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                candidateReceived = true;
                console.log(`ICE candidate recibido: ${event.candidate.type}`);
            }
        };
        
        // Crear canal de datos dummy para activar ICE gathering
        pc.createDataChannel('test');
        
        pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
        }).catch(console.error);
        
        // Timeout después de 5 segundos
        setTimeout(() => {
            pc.close();
            resolve(candidateReceived);
        }, 5000);
    });
}

// Ejecutar verificación automáticamente
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        console.log('🔍 Verificando compatibilidad WebRTC...');
        checkWebRTCSupport();
    });
}
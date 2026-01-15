// Variables globales
let socket;
let remoteVideo;
let peerConnection;
let userInfo = null;
let isReceiving = false;
let isRecording = false;
let mediaRecorder;
let recordedChunks = [];
let connectionStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'receiving'
let remoteStreamRef = null; // Referencia al stream remoto

// Variables para IA - Receptor
let aiAlertCount = 0;
let lastAlertTime = 'Nunca';

// Estados más descriptivos para el usuario
const STATUS_MESSAGES = {
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
    connected: 'Conectado',
    receiving: 'Recibiendo video en vivo',
    error: 'Error de conexión'
};

// --- NUEVAS FUNCIONES Y LÓGICA SIMPLIFICADA ---

// Muestra la UI para que el usuario inicie el video
function showPlayUI() {
    addLogMessage('🎬 Mostrando control de reproducción manual para el usuario.');
    const playVideoBtn = document.getElementById('playVideoBtn');
    const videoOverlay = document.getElementById('videoOverlay');

    if (videoOverlay) videoOverlay.style.display = 'flex';
    
    if (playVideoBtn) {
        playVideoBtn.disabled = false;
        playVideoBtn.textContent = '▶️ Reproducir Video';
        playVideoBtn.classList.add('btn-urgent');
    }
    updateStreamStatus('Toca para reproducir');
}

// Oculta la UI de reproducción una vez que el video funciona
function hidePlayUI() {
    const playVideoBtn = document.getElementById('playVideoBtn');
    const videoOverlay = document.getElementById('videoOverlay');

    if (videoOverlay) videoOverlay.style.display = 'none';

    if (playVideoBtn) {
        playVideoBtn.disabled = true;
        playVideoBtn.classList.remove('btn-urgent');
    }
}


// Configuración WebRTC OPTIMIZADA PARA INTERNET
const rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
};

// Inicialización cuando la página carga
window.addEventListener('load', async () => {
    await initializeApp();
    setupSoundControls(); // Configurar controles de sonido
});

/**
 * Configura los controles de sonido para las alertas de IA
 */
function setupSoundControls() {
    // Botón de prueba de alarma
    const testAlarmBtn = document.getElementById('testAlarmBtn');
    if (testAlarmBtn) {
        testAlarmBtn.addEventListener('click', () => {
            if (window.alarmSounds) {
                window.alarmSounds.playTestSound();
                addLogMessage('🔊 Probando sonidos de alarma...');
            } else {
                addLogMessage('❌ Sistema de sonidos no disponible');
            }
        });
    }
    
    // Botón para activar/desactivar sonidos
    const toggleSoundBtn = document.getElementById('toggleSoundBtn');
    if (toggleSoundBtn) {
        toggleSoundBtn.addEventListener('click', () => {
            if (window.alarmSounds) {
                const isEnabled = window.alarmSounds.isEnabled;
                window.alarmSounds.setEnabled(!isEnabled);
                
                toggleSoundBtn.textContent = !isEnabled ? '🔕 Activar Sonidos' : '🔇 Silenciar Sonidos';
                toggleSoundBtn.className = !isEnabled ? 'btn-success' : 'btn-secondary';
                
                addLogMessage(!isEnabled ? '🔊 Sonidos de alarma activados' : '🔇 Sonidos de alarma silenciados');
            }
        });
    }
}

async function initializeApp() {
    const userInfoStr = sessionStorage.getItem('userInfo');
    if (!userInfoStr) {
        alert('No hay información de sesión. Redirigiendo al inicio.');
        window.location.href = '/';
        return;
    }
    userInfo = JSON.parse(userInfoStr);
    
    initializeDOMElements();
    initializeSocket();
    setupEventListeners();
    updateRoomInfo();
    addLogMessage('Aplicación inicializada correctamente');
}

function initializeDOMElements() {
    remoteVideo = document.getElementById('remoteVideo');
    const videoOverlay = document.getElementById('videoOverlay');
    
    const playVideoBtn = document.getElementById('playVideoBtn');
    const backBtn = document.getElementById('backBtn');
    const muteBtn = document.getElementById('muteBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    
    // --- EVENTOS DE BOTONES (SIMPLIFICADO) ---
    if (playVideoBtn) playVideoBtn.addEventListener('click', forcePlayVideo);
    if (videoOverlay) videoOverlay.addEventListener('click', forcePlayVideo);
    
    backBtn.addEventListener('click', () => { window.location.href = '/'; });
    muteBtn.addEventListener('click', toggleMute);
    volumeSlider.addEventListener('input', adjustVolume);
    
    // Agregar verificación periódica de conexión
    setInterval(() => {
        if (peerConnection && peerConnection.connectionState === 'connected' && remoteVideo.srcObject) {
            // Todo bien, seguir monitoreando
        } else if (peerConnection && peerConnection.connectionState === 'failed') {
            addLogMessage('🔄 Conexión WebRTC falló, reiniciando...');
            setTimeout(() => window.location.reload(), 2000);
        }
    }, 10000);
}

function initializeSocket() {
    socket = io();
    
    socket.emit('register-user', { username: userInfo.username, role: userInfo.role });
    socket.emit('join-room', { roomId: userInfo.roomId });
    
    socket.on('joined-room', (data) => {
        const receptorInfo = data.receptorNumber ? ` - Eres el receptor #${data.receptorNumber}` : '';
        addLogMessage(`Conectado a sala: ${data.roomId}${receptorInfo}`);
        addLogMessage(`Receptores en sala: ${data.totalReceptores}/${data.maxReceptores}`);
        updateConnectionStatus('Conectado');
        updateReceptorCount(data.totalReceptores || 0, data.maxReceptores || 10);
    });
    
    socket.on('room-full', (data) => {
        addLogMessage(`❌ ${data.message}`);
        alert(`Sala llena: ${data.message}\nReceptores actuales: ${data.currentCount}`);
        window.location.href = '/';
    });
    
    socket.on('emisor-disconnected', (data) => {
        addLogMessage('📡 El emisor se ha desconectado');
        alert(data.message);
        updateEmisorStatus('Desconectado');
        performCompleteCleanup();
    });
    
    socket.on('room-update', (update) => {
        addLogMessage(`[Sala] ${update.message}`);
        if (update.totalReceptores !== undefined) {
            addLogMessage(`Total receptores en sala: ${update.totalReceptores}/${update.maxReceptores}`);
            updateReceptorCount(update.totalReceptores, update.maxReceptores);
        }
    });
    
    socket.on('offer', (offer) => handleOffer(offer));
    socket.on('ice-candidate', (candidate) => handleIceCandidate(candidate));

    // Escuchar alertas de IA del emisor
    socket.on('ai-alert', (alertData) => {
        handleAIAlertFromEmisor(alertData);
    });
    
    // Eventos de control manual de IA removidos - IA ahora es completamente automática

    socket.on('connection-update', (update) => {
        addLogMessage(`[${update.event}] ${update.message}`);
        if (update.event === 'offer-sent') {
            updateEmisorStatus('Conectado - Oferta recibida');
        }
    });

    socket.on('pong-room', (data) => {
        const receptoresInfo = data.receptores?.map(r => `${r.username} (#${r.number})`).join(', ') || 'Ninguno';
        addLogMessage(`Ping: Emisor=${data.emisorConnected ? 'Sí' : 'No'}, Receptores=${data.receptoresConnectados}/${data.maxReceptores}`);
        addLogMessage(`Otros receptores: ${receptoresInfo}`);
        updateEmisorStatus(data.emisorConnected ? 'Conectado' : 'Desconectado');
    });
    
    setInterval(() => {
        if (socket && socket.connected) socket.emit('ping-room');
    }, 5000);
}

function setupEventListeners() {
    remoteVideo.addEventListener('playing', () => {
        addLogMessage('🎆 ¡VIDEO REPRODUCIÉNDOSE EN VIVO!');
        updateStreamStatus('Reproduciendo en vivo');
    });
    // ... (otros listeners pueden permanecer igual)
}

// --- LÓGICA DE REPRODUCCIÓN MEJORADA ---
async function forcePlayVideo() {
    if (!remoteVideo.srcObject) {
        addLogMessage('❌ No hay stream para reproducir');
        addLogMessage('🔧 Verificando conexión WebRTC...');
        if (peerConnection) {
            addLogMessage(`Estado PeerConnection: ${peerConnection.connectionState}`);
            addLogMessage(`Estado Signaling: ${peerConnection.signalingState}`);
        }
        return;
    }
    
    addLogMessage('▶️ Intentando reproducir video...');
    addLogMessage(`Video readyState: ${remoteVideo.readyState}`);
    addLogMessage(`Video networkState: ${remoteVideo.networkState}`);
    
    try {
        // Intenta reproducir con sonido
        remoteVideo.muted = false;
        await remoteVideo.play();
        addLogMessage('✅ Video funcionando con sonido.');
        hidePlayUI();
        document.getElementById('playVideoBtn').textContent = '✅ CONECTADO';
        updateStreamStatus('Reproduciendo en vivo con audio');
    } catch (err) {
        addLogMessage(`⚠️ Falló con sonido: ${err.message}. Reintentando en silencio...`);
        try {
            // Si falla, intenta en silencio (política de autoplay)
            remoteVideo.muted = true;
            await remoteVideo.play();
            addLogMessage('✅ Video funcionando en modo silencio.');
            hidePlayUI();
            document.getElementById('playVideoBtn').textContent = '✅ CONECTADO (SILENCIADO)';
            document.getElementById('muteBtn').textContent = '🔇 Activar Audio';
            updateStreamStatus('Reproduciendo en vivo (silenciado)');
        } catch (finalErr) {
            addLogMessage(`❌ Error crítico de reproducción: ${finalErr.message}`);
            addLogMessage('🔧 Depuración adicional:');
            addLogMessage(`- srcObject existe: ${!!remoteVideo.srcObject}`);
            addLogMessage(`- Stream activo: ${remoteVideo.srcObject?.active}`);
            addLogMessage(`- Tracks: ${remoteVideo.srcObject?.getTracks().length}`);
            alert('No se pudo reproducir el video. Revisa los permisos del navegador.');
        }
    }
}

async function handleOffer(offerData) {
    try {
        addLogMessage('🎯 Recibiendo oferta de transmisión');
        addLogMessage(`Oferta SDP tipo: ${offerData.sdp?.type}`);
        addLogMessage(`Timestamp: ${offerData.timestamp}`);
        
        // Crear nueva conexión peer
        peerConnection = new RTCPeerConnection(rtcConfiguration);
        addLogMessage('✅ PeerConnection creada');

        // --- LÓGICA ONTRACK MEJORADA ---
        peerConnection.ontrack = (event) => {
            addLogMessage(`🎉 ¡Evento ontrack disparado! Stream recibido.`);
            addLogMessage(`Número de streams: ${event.streams.length}`);
            
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                addLogMessage(`Stream tracks: ${stream.getTracks().length} (Video: ${stream.getVideoTracks().length}, Audio: ${stream.getAudioTracks().length})`);
                
                // Asegurar que el video se conecte correctamente
                remoteVideo.srcObject = stream;
                remoteStreamRef = stream; // Guardar referencia
                
                // Intentar reproducir inmediatamente con validación
                setTimeout(() => {
                    if (remoteVideo.srcObject) {
                        addLogMessage('✅ Stream asignado correctamente al elemento video');
                        showPlayUI(); // Mostrar UI de reproducción
                        updateStreamStatus('Stream recibido - Listo para reproducir');
                    } else {
                        addLogMessage('❌ Error: Stream no asignado correctamente');
                    }
                }, 100);
            } else {
                addLogMessage('⚠️ No hay streams en el evento ontrack');
            }
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                addLogMessage(`🧊 Enviando ICE candidate: ${event.candidate.type}`);
                socket.emit('ice-candidate', event.candidate);
            } else {
                addLogMessage('🎯 ICE candidate collection completada');
            }
        };
        
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            addLogMessage(`Estado de conexión WebRTC: ${state}`);
            
            switch(state) {
                case 'connected':
                    addLogMessage('✅ ¡Conexión WebRTC establecida exitosamente!');
                    updateEmisorStatus('Conectado y transmitiendo');
                    connectionStatus = 'connected';
                    break;
                case 'disconnected':
                    addLogMessage('⚠️ Conexión WebRTC desconectada');
                    updateEmisorStatus('Desconectado');
                    connectionStatus = 'disconnected';
                    break;
                case 'failed':
                    addLogMessage('❌ Conexión WebRTC falló');
                    updateEmisorStatus('Error de conexión');
                    connectionStatus = 'error';
                    // Intentar reconectar
                    setTimeout(() => {
                        addLogMessage('🔄 Intentando reconectar...');
                        window.location.reload();
                    }, 3000);
                    break;
                case 'connecting':
                    addLogMessage('🔄 Conectando...');
                    updateEmisorStatus('Conectando...');
                    connectionStatus = 'connecting';
                    break;
            }
        };
        
        // Establecer descripción remota (la oferta)
        addLogMessage('📥 Configurando descripción remota (oferta)...');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.sdp));
        addLogMessage('✅ Descripción remota establecida');
        
        // Crear respuesta
        addLogMessage('📤 Creando respuesta SDP...');
        const answer = await peerConnection.createAnswer();
        addLogMessage(`Respuesta SDP tipo: ${answer.type}`);
        
        // Establecer descripción local
        await peerConnection.setLocalDescription(answer);
        addLogMessage('✅ Descripción local establecida');
        
        addLogMessage('📡 Enviando respuesta al emisor...');
        socket.emit('answer', { 
            sdp: answer,
            timestamp: new Date().toISOString(),
            receptorInfo: {
                userAgent: navigator.userAgent,
                supportedCodecs: 'H264, VP8, VP9'
            }
        });
        
        updateConnectionStatusAdvanced('connecting', 'Esperando confirmación');
        
        // Auto-diagnóstico si no recibe video en 15 segundos
        setTimeout(() => {
            if (!remoteVideo.srcObject || remoteVideo.readyState === 0) {
                addLogMessage('⚠️ Sin video después de 15 segundos - ejecutando diagnóstico automático');
                runConnectionDiagnostics();
            }
        }, 15000);
        
    } catch (error) {
        console.error('Error al manejar oferta:', error);
        addLogMessage(`❌ Error al establecer conexión: ${error.message}`);
        addLogMessage(`Stack trace: ${error.stack}`);
    }
}

async function handleIceCandidate(candidate) {
    try {
        if (!peerConnection) {
            addLogMessage('⚠️ PeerConnection no existe para ICE candidate');
            return;
        }
        
        if (candidate && candidate.candidate) {
            addLogMessage(`🧊 Agregando ICE candidate: ${candidate.candidate.substring(0, 50)}...`);
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            addLogMessage('✅ ICE candidate agregado exitosamente');
        } else {
            addLogMessage('🏁 ICE candidate final (null) recibido');
        }
    } catch (error) {
        console.error('Error al agregar ICE candidate:', error);
        addLogMessage(`⚠️ Error ICE candidate: ${error.message}`);
        // No es crítico, continuar
    }
}

// --- FUNCIONES DE CONTROL MEJORADAS (ESTILO REACT) ---

// Toggle mute mejorado con mejor feedback
function toggleMute() {
    if (!remoteVideo) return;
    
    remoteVideo.muted = !remoteVideo.muted;
    const muteBtn = document.getElementById('muteBtn');
    const isMuted = remoteVideo.muted;
    
    if (muteBtn) {
        muteBtn.textContent = isMuted ? '🔇 Activar Audio' : '🔊 Silenciar';
        muteBtn.className = isMuted ? 'btn btn-warning' : 'btn btn-secondary';
    }
    
    addLogMessage(isMuted ? '🔇 Audio silenciado' : '🔊 Audio activado');
    updateStreamStatus(isMuted ? 'Reproduciendo (silenciado)' : 'Reproduciendo con audio');
}

// Cleanup completo al desconectar
function performCompleteCleanup() {
    addLogMessage('🧽 Iniciando limpieza completa...');
    
    // Cerrar conexión peer
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        addLogMessage('✅ Conexión WebRTC cerrada');
    }
    
    // Limpiar video remoto
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        remoteVideo.pause();
    }
    
    // Detener grabación si está activa
    if (isRecording) {
        stopRecording();
    }
    
    // Resetear estados
    isReceiving = false;
    connectionStatus = 'disconnected';
    
    // Actualizar UI
    updateStreamStatus('Desconectado');
    hidePlayUI();
    
    addLogMessage('✨ Limpieza completa finalizada');
}

// Actualizar estados de conexión mejorados
function updateConnectionStatusAdvanced(newStatus, additionalInfo = '') {
    connectionStatus = newStatus;
    const statusDisplay = document.getElementById('connectionStatus');
    
    let displayText = STATUS_MESSAGES[newStatus] || newStatus;
    if (additionalInfo) displayText += ` - ${additionalInfo}`;
    
    if (statusDisplay) {
        statusDisplay.textContent = displayText;
        // Agregar clases CSS para colores dinámicos
        statusDisplay.className = `connection-status status-${newStatus}`;
    }
    
    addLogMessage(`🔄 Estado de conexión: ${displayText}`);
}

// Función para copiar ID de sala (utilidad del React)
function copyRoomIdToClipboard() {
    const roomId = userInfo?.roomId;
    if (roomId && navigator.clipboard) {
        navigator.clipboard.writeText(roomId)
            .then(() => {
                addLogMessage('📋 ID de sala copiado al portapapeles');
                // Mostrar feedback visual temporal
                const copyBtn = document.getElementById('copyRoomIdBtn');
                if (copyBtn) {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✅ ¡Copiado!';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                    }, 2000);
                }
            })
            .catch(() => {
                addLogMessage('⚠️ Error al copiar ID de sala');
            });
    }
}

// Función de diagnóstico para debugging
function runConnectionDiagnostics() {
    addLogMessage('🔧 === DIAGNÓSTICO DE CONEXIÓN ===');
    
    // Estado del socket
    addLogMessage(`Socket conectado: ${socket?.connected ? 'Sí' : 'No'}`);
    addLogMessage(`Usuario info: ${userInfo ? 'OK' : 'Faltante'}`);
    addLogMessage(`Room ID: ${userInfo?.roomId || 'No definido'}`);
    
    // Estado WebRTC
    if (peerConnection) {
        addLogMessage(`PeerConnection state: ${peerConnection.connectionState}`);
        addLogMessage(`Signaling state: ${peerConnection.signalingState}`);
        addLogMessage(`ICE connection state: ${peerConnection.iceConnectionState}`);
        addLogMessage(`ICE gathering state: ${peerConnection.iceGatheringState}`);
        
        // Receivers info
        const receivers = peerConnection.getReceivers();
        addLogMessage(`Receivers: ${receivers.length}`);
        receivers.forEach((receiver, index) => {
            if (receiver.track) {
                addLogMessage(`  Receiver ${index + 1}: ${receiver.track.kind} (${receiver.track.readyState})`);
            }
        });
    } else {
        addLogMessage('PeerConnection: No existe');
    }
    
    // Estado del video
    if (remoteVideo) {
        addLogMessage(`Video srcObject: ${remoteVideo.srcObject ? 'Asignado' : 'Vacío'}`);
        addLogMessage(`Video readyState: ${remoteVideo.readyState}`);
        addLogMessage(`Video networkState: ${remoteVideo.networkState}`);
        addLogMessage(`Video paused: ${remoteVideo.paused}`);
        addLogMessage(`Video muted: ${remoteVideo.muted}`);
        
        if (remoteVideo.srcObject) {
            const stream = remoteVideo.srcObject;
            addLogMessage(`Stream active: ${stream.active}`);
            addLogMessage(`Stream tracks: ${stream.getTracks().length}`);
            stream.getTracks().forEach((track, index) => {
                addLogMessage(`  Track ${index + 1}: ${track.kind} (${track.readyState}, enabled: ${track.enabled})`);
            });
        }
    }
    
    addLogMessage('🔧 === FIN DIAGNÓSTICO ===');
}

// Exponer función de diagnóstico globalmente para debugging manual
window.runDiagnostics = runConnectionDiagnostics;

function adjustVolume() {
    remoteVideo.volume = document.getElementById('volumeSlider').value / 100;
    document.getElementById('volumeDisplay').textContent = `${Math.round(remoteVideo.volume * 100)}%`;
}

function updateRoomInfo() {
    document.getElementById('roomIdDisplay').textContent = userInfo.roomId;
}

function updateConnectionStatus(status) {
    document.getElementById('connectionStatus').textContent = status;
}

function updateEmisorStatus(status) {
    document.getElementById('emisorStatus').textContent = status;
}

function updateStreamStatus(status) {
    document.getElementById('streamStatus').textContent = status;
}

function updateReceptorCount(current, max) {
    const element = document.getElementById('receptorCount');
    if (element) {
        element.textContent = `${current}/${max} conectados`;
    }
}

// Optimización para evitar forced reflows
let logUpdateScheduled = false;
let logUpdateQueue = [];

function addLogMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logData = {
        message: message,
        timestamp: timestamp,
        id: Date.now() + Math.random()
    };
    
    logUpdateQueue.push(logData);
    
    if (!logUpdateScheduled) {
        logUpdateScheduled = true;
        requestAnimationFrame(updateLogDisplay);
    }
    
    console.log(`[${timestamp}] ${message}`);
}

function updateLogDisplay() {
    const logContainer = document.getElementById('logMessages');
    if (!logContainer || logUpdateQueue.length === 0) {
        logUpdateScheduled = false;
        return;
    }
    
    // Crear fragmento para batch updates
    const fragment = document.createDocumentFragment();
    
    logUpdateQueue.forEach(logData => {
        const logElement = document.createElement('div');
        logElement.className = 'log-message';
        logElement.innerHTML = `<span class="timestamp">[${logData.timestamp}]</span> ${logData.message}`;
        fragment.appendChild(logElement);
    });
    
    // Single DOM update
    logContainer.appendChild(fragment);
    
    // Scroll optimization - usar smooth scroll
    logContainer.scrollTo({
        top: logContainer.scrollHeight,
        behavior: 'smooth'
    });
    
    // Clear queue
    logUpdateQueue = [];
    logUpdateScheduled = false;
}

// === FUNCIONES DE IA PARA RECEPTOR ===

/**
 * Maneja alertas de IA recibidas del emisor con mayor detalle y visibilidad
 */
function handleAIAlertFromEmisor(alertData) {
    try {
        const { type, severity, message, timestamp, confidence, details, emisorInfo, actionRecommendations } = alertData;
        
        aiAlertCount++;
        lastAlertTime = new Date(timestamp).toLocaleTimeString();
        
        // LIMPIAR ALERTAS ANTERIORES - solo mostrar la más reciente
        clearPreviousAlerts();
        
        // Reproducir sonido de alarma según severidad con mayor duración
        if (window.alarmSounds) {
            const duration = severity === 'CRITICAL' ? 6000 : 
                            severity === 'HIGH' ? 4000 : 
                            severity === 'MEDIUM' ? 3000 : 2000;
            window.alarmSounds.playAlert(severity.toLowerCase(), duration);
        }
        
        // Mostrar panel de estado de IA si está oculto
        showAIStatusPanel();
        
        // Actualizar estadísticas
        updateAIStats();
        
        // Crear y mostrar alerta visual mejorada con recomendaciones
        createEnhancedAIAlertWithActions(type, severity, message, confidence, timestamp, details, actionRecommendations, emisorInfo);
        
        // Agregar a los logs con más detalles
        const severityEmoji = {
            'CRITICAL': '🚨🚨🚨',
            'HIGH': '⚠️⚠️',
            'MEDIUM': '🟡',
            'LOW': '🔵'
        };
        
        const locationInfo = emisorInfo?.cameraLocation ? ` [${emisorInfo.cameraLocation}]` : '';
        const detailsStr = details ? ` - ${getDetailsString(details)}` : '';
        addLogMessage(`${severityEmoji[severity]} ${message}${locationInfo}${detailsStr}`);
        
        // Mostrar notificación emergente para alertas importantes
        if (severity === 'CRITICAL' || severity === 'HIGH') {
            showEmergencyNotification(message, severity, actionRecommendations);
        }
        
        // Log detallado para debugging
        console.log('👶 Alerta del bebé recibida:', alertData);
        
        // Hacer parpadear la pestaña del navegador para alertas críticas
        if (severity === 'CRITICAL') {
            blinkTab('🚨 ALERTA CRÍTICA - Monitor Bebé');
            
            // Vibrar dispositivo si está disponible
            if (navigator.vibrate) {
                navigator.vibrate([200, 100, 200, 100, 200]);
            }
        }
        
    } catch (error) {
        console.error('Error procesando alerta de IA:', error);
        addLogMessage('❌ Error procesando alerta de IA del emisor');
    }
}

/**
 * Limpiar alertas anteriores para mostrar solo la más reciente
 */
function clearPreviousAlerts() {
    const alertsContainer = document.getElementById('alertsContainer');
    if (alertsContainer) {
        // Remover todas las alertas existentes excepto el mensaje "sin alertas"
        const existingAlerts = alertsContainer.querySelectorAll('.ai-alert, .enhanced-alert');
        existingAlerts.forEach(alert => {
            alert.remove();
        });
        
        // Asegurar que el mensaje "sin alertas" esté oculto si hay alertas
        const noAlertsMsg = alertsContainer.querySelector('.no-alerts');
        if (noAlertsMsg) {
            noAlertsMsg.style.display = 'none';
        }
    }
}

/**
 * Obtener string de detalles formateado
 */
function getDetailsString(details) {
    const detailParts = [];
    if (details.location) detailParts.push(`Ubicación: ${details.location}`);
    if (details.risk) detailParts.push(`Riesgo: ${details.risk}`);
    if (details.lastFaceDetection) detailParts.push(`Sin cara: ${details.lastFaceDetection}s`);
    if (details.hoursAsleep) detailParts.push(`Durmiendo: ${details.hoursAsleep}h`);
    return detailParts.join(', ');
}

/**
 * Muestra el panel de estado de IA
 */
function showAIStatusPanel() {
    const panel = document.getElementById('aiStatusReceptor');
    if (panel) {
        panel.style.display = 'block';
    }
}

/**
 * Actualiza las estadísticas de IA en el receptor
 */
function updateAIStats() {
    const countElement = document.getElementById('alertCountReceptor');
    const timeElement = document.getElementById('lastAlertTimeReceptor');
    
    if (countElement) countElement.textContent = aiAlertCount;
    if (timeElement) timeElement.textContent = lastAlertTime;
}

/**
 * Crea una alerta visual de IA mejorada con más detalles
 */
function createEnhancedAIAlert(type, severity, message, confidence, timestamp, details = {}) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `ai-alert alert-${severity}`;
    
    const time = new Date(timestamp).toLocaleTimeString();
    const confidencePercent = Math.round(confidence * 100);
    
    const severityLabels = {
        'critical': 'CRÍTICA 🚨',
        'high': 'ALTA ⚠️',
        'medium': 'MEDIA 🟡',
        'low': 'BAJA 🔵'
    };
    
    // Crear contenido detallado según el tipo de alerta
    let detailsHtml = '';
    if (details && Object.keys(details).length > 0) {
        detailsHtml = '<div class="alert-details">';
        
        if (details.location) {
            detailsHtml += `<span class="detail-item">📍 Ubicación: ${details.location}</span>`;
        }
        if (details.risk) {
            detailsHtml += `<span class="detail-item">⚠️ Riesgo: ${details.risk}</span>`;
        }
        if (details.activity) {
            detailsHtml += `<span class="detail-item">🏃 Actividad: ${details.activity}</span>`;
        }
        if (details.posture) {
            detailsHtml += `<span class="detail-item">🧘 Postura: ${details.posture}</span>`;
        }
        if (details.overlapPercentage) {
            detailsHtml += `<span class="detail-item">📊 Cobertura: ${details.overlapPercentage}%</span>`;
        }
        if (details.sleepDuration) {
            detailsHtml += `<span class="detail-item">⏰ Duración: ${details.sleepDuration} min</span>`;
        }
        if (details.urgency) {
            detailsHtml += `<span class="detail-item urgency-${details.urgency}">🆘 ${details.urgency.toUpperCase()}</span>`;
        }
        
        detailsHtml += '</div>';
    }
    
    // Instrucciones específicas según el tipo de alerta
    let instructionsHtml = '';
    const instructions = getAlertInstructions(type, severity);
    if (instructions) {
        instructionsHtml = `<div class="alert-instructions">📝 <strong>Qué hacer:</strong> ${instructions}</div>`;
    }
    
    const alertContent = `
        <div class="alert-content">
            <div class="alert-header">
                <h4>Alerta ${severityLabels[severity]}</h4>
                <span class="alert-type">${getAlertTypeLabel(type)}</span>
            </div>
            <div class="alert-message">
                <p><strong>${message}</strong></p>
            </div>
            ${detailsHtml}
            ${instructionsHtml}
            <div class="alert-meta">
                <small>🎯 Confianza: ${confidencePercent}% | 🕰️ ${time}</small>
            </div>
            <div class="alert-actions">
                <button onclick="markAsRead(this.parentElement.parentElement.parentElement)" class="btn-acknowledge">Entendido</button>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn-dismiss">Cerrar</button>
            </div>
        </div>
    `;
    
    alertDiv.innerHTML = alertContent;
    
    // Añadir clases especiales para ciertos tipos
    if (type.includes('covering') || type.includes('suffocation')) {
        alertDiv.classList.add('alert-breathing');
    }
    if (type.includes('edge') || type.includes('fall')) {
        alertDiv.classList.add('alert-fall-risk');
    }
    
    document.body.appendChild(alertDiv);
    
    // Auto-remover alerta después de un tiempo (más tiempo para alertas críticas)
    const autoRemoveTime = severity === 'critical' ? 25000 : 
                          severity === 'high' ? 15000 : 
                          severity === 'medium' ? 10000 : 7000;
    
    setTimeout(() => {
        if (alertDiv && alertDiv.parentElement) {
            alertDiv.remove();
        }
    }, autoRemoveTime);
}

/**
 * Obtiene instrucciones específicas para cada tipo de alerta
 */
function getAlertInstructions(type, severity) {
    const instructions = {
        'covering_risk': 'ACUDI INMEDIATAMENTE - Retira el objeto que cubre al bebé y verifica su respiración',
        'partial_covering': 'Ve a revisar al bebé y asegúrate de que pueda respirar libremente',
        'close_contact': 'Verifica qué o quién está cerca del bebé - puede ser una mano u objeto sobre él',
        'baby_standing': 'Ve a asegurar el área para prevenir caídas - el bebé está de pie',
        'edge_risk': 'ACUDE INMEDIATAMENTE - El bebé está cerca del borde y puede caerse',
        'animal_detection': 'Ve a revisar la interacción entre la mascota y el bebé',
        'baby_crawling': 'Monitorea el movimiento del bebé y asegura el área',
        'no_movement': 'Ve a verificar el estado del bebé - ha estado muy quieto',
        'long_sleep': 'Verifica que el bebé esté bien - ha dormido por mucho tiempo',
        'dangerous_object': 'Retira inmediatamente el objeto peligroso del alcance del bebé',
        'baby_not_visible': 'Ajusta la cámara o verifica dónde está el bebé'
    };
    
    return instructions[type] || 'Monitorea la situación del bebé de cerca';
}

/**
 * Obtiene etiqueta legible para el tipo de alerta
 */
function getAlertTypeLabel(type) {
    const labels = {
        'covering_risk': '🚫 ASFIXIA',
        'partial_covering': '🔴 COBERTURA',
        'close_contact': '🤝 CONTACTO',
        'baby_standing': '🧑 DE PIE',
        'baby_sitting': '🧘 SENTADO',
        'baby_crawling': '👶 GATEANDO',
        'baby_movement': '🔄 MOVIMIENTO',
        'excessive_movement': '🏃 HIPERACTIVIDAD',
        'no_movement': '😴 SIN MOVIMIENTO',
        'long_sleep': '😴 DURMIENDO',
        'position_change': '🔄 CAMBIO POSICIÓN',
        'edge_risk': '🛡️ RIESGO CAÍDA',
        'animal_detection': '🐾 MASCOTA',
        'dangerous_object': '⚠️ OBJETO PELIGROSO',
        'multiple_people': '👥 VARIAS PERSONAS',
        'baby_not_visible': '🔍 NO VISIBLE'
    };
    
    return labels[type] || '🔔 ALERTA';
}

/**
 * Marca una alerta como leída
 */
function markAsRead(alertElement) {
    alertElement.classList.add('alert-read');
    const acknowledgeBtn = alertElement.querySelector('.btn-acknowledge');
    if (acknowledgeBtn) {
        acknowledgeBtn.textContent = '✅ Leído';
        acknowledgeBtn.disabled = true;
    }
    
    // Auto-remover después de marcar como leído
    setTimeout(() => {
        if (alertElement && alertElement.parentElement) {
            alertElement.style.opacity = '0.6';
            alertElement.style.transform = 'scale(0.95)';
        }
    }, 2000);
}

/**
 * Hace parpadear el título de la pestaña para alertas críticas
 */
function blinkTab(alertTitle) {
    const originalTitle = document.title;
    let isAlertTitle = false;
    
    const blinkInterval = setInterval(() => {
        document.title = isAlertTitle ? originalTitle : alertTitle;
        isAlertTitle = !isAlertTitle;
    }, 1000);
    
    // Detener parpadeo después de 10 segundos
    setTimeout(() => {
        clearInterval(blinkInterval);
        document.title = originalTitle;
    }, 10000);
    
    // Detener parpadeo si el usuario hace foco en la ventana
    window.addEventListener('focus', () => {
        clearInterval(blinkInterval);
        document.title = originalTitle;
    }, { once: true });
}

/**
 * Sistema de IA automático - configuración manual removida
 * La IA ahora se configura automáticamente desde el emisor
 */

/**
 * Sistema de IA automático - configuración manual removida
 * La IA ahora se configura automáticamente desde el emisor
 */

/**
 * Funciones de control de IA mejoradas
 */
// Funciones de control manual de IA removidas - IA ahora es completamente automática desde el emisor

/**
 * Crea una alerta visual de IA mejorada con recomendaciones de acción
 */
function createEnhancedAIAlertWithActions(type, severity, message, confidence, timestamp, details = {}, actionRecommendations = [], emisorInfo = {}) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `ai-alert alert-${severity.toLowerCase()} enhanced-alert`;
    
    const time = new Date(timestamp).toLocaleTimeString();
    const confidencePercent = Math.round(confidence * 100);
    
    const severityLabels = {
        'CRITICAL': 'CRÍTICA 🚨',
        'HIGH': 'ALTA ⚠️',
        'MEDIUM': 'MEDIA 🟡',
        'LOW': 'BAJA 🔵'
    };
    
    // Crear contenido con recomendaciones de acción
    let actionsHtml = '';
    if (actionRecommendations && actionRecommendations.length > 0) {
        actionsHtml = '<div class="action-recommendations"><h5>🎯 Acciones Recomendadas:</h5><ul>';
        actionRecommendations.forEach(action => {
            actionsHtml += `<li class="action-item">${action}</li>`;
        });
        actionsHtml += '</ul></div>';
    }
    
    let detailsHtml = '';
    if (details && Object.keys(details).length > 0) {
        detailsHtml = '<div class="alert-details">';
        
        if (details.location) {
            detailsHtml += `<span class="detail-item">📍 Ubicación: ${details.location}</span>`;
        }
        if (details.timeSinceLastDetection) {
            detailsHtml += `<span class="detail-item">⏱️ Tiempo sin detectar: ${details.timeSinceLastDetection}s</span>`;
        }
        if (details.overlapPercentage) {
            detailsHtml += `<span class="detail-item">📊 Cobertura: ${details.overlapPercentage}%</span>`;
        }
        if (details.risk) {
            detailsHtml += `<span class="detail-item risk-${details.risk}">⚠️ Nivel de Riesgo: ${details.risk.toUpperCase()}</span>`;
        }
        detailsHtml += '</div>';
    }
    
    alertDiv.innerHTML = `
        <div class="alert-header">
            <h4>${severityLabels[severity]} - ${message}</h4>
            <span class="alert-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
        </div>
        <div class="alert-info">
            <div class="alert-meta">
                <span class="alert-time">🕐 ${time}</span>
                <span class="alert-confidence">📊 Confianza: ${confidencePercent}%</span>
                ${emisorInfo.cameraLocation ? `<span class="alert-location">📍 ${emisorInfo.cameraLocation}</span>` : ''}
            </div>
            ${detailsHtml}
            ${actionsHtml}
        </div>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto-remover para alertas de baja prioridad
    if (severity === 'LOW' || severity === 'MEDIUM') {
        setTimeout(() => {
            if (alertDiv.parentElement) {
                alertDiv.remove();
            }
        }, 15000);
    }
    
    // Hacer que las alertas críticas parpadeén
    if (severity === 'CRITICAL') {
        alertDiv.classList.add('blink-critical');
    }
}

/**
 * Muestra una notificación de emergencia prominente
 */
function showEmergencyNotification(message, severity, actionRecommendations = []) {
    // Remover notificaciones de emergencia existentes
    const existing = document.querySelectorAll('.emergency-notification');
    existing.forEach(el => el.remove());
    
    const emergencyDiv = document.createElement('div');
    emergencyDiv.className = `emergency-notification ${severity.toLowerCase()}`;
    emergencyDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        min-width: 400px;
        max-width: 80vw;
        padding: 20px;
        background: ${severity === 'CRITICAL' ? '#ff4444' : '#ff8800'};
        color: white;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        animation: emergencyPulse 2s infinite;
    `;
    
    let actionsHtml = '';
    if (actionRecommendations.length > 0) {
        actionsHtml = '<div style="margin-top: 10px;"><strong>Acciones Inmediatas:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
        actionRecommendations.slice(0, 3).forEach(action => {
            actionsHtml += `<li>${action}</li>`;
        });
        actionsHtml += '</ul></div>';
    }
    
    emergencyDiv.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
                <h3 style="margin: 0; font-size: 18px;">${severity === 'CRITICAL' ? '🚨 ALERTA CRÍTICA' : '⚠️ ALERTA IMPORTANTE'}</h3>
                <p style="margin: 5px 0 0 0; font-size: 16px;">${message}</p>
                ${actionsHtml}
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: rgba(255,255,255,0.3); border: none; color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 20px;">&times;</button>
        </div>
    `;
    
    document.body.appendChild(emergencyDiv);
    
    // Auto-remover después de 30 segundos para CRITICAL, 20 para HIGH
    const autoRemoveTime = severity === 'CRITICAL' ? 30000 : 20000;
    setTimeout(() => {
        if (emergencyDiv.parentElement) {
            emergencyDiv.remove();
        }
    }, autoRemoveTime);
}

// El resto de funciones como toggleFullscreen, recording, etc. se omiten por brevedad pero no se eliminan

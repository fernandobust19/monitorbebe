// Variables globales
let socket;
let localVideo;
let localStream;
let peerConnections = new Map(); // receptorId -> RTCPeerConnection
let userInfo = null;
let isStreaming = false;
let currentCameraIndex = 0;
let availableCameras = [];
let connectionStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'streaming'
let connectedReceptores = new Map(); // receptorId -> {username, number}

// Variables para IA de monitoreo
let aiMonitorEnabled = false;
let aiMonitorInitialized = false;

// Sistema de reconocimiento inteligente del bebé
let babyRecognitionSystem = {
    isLearning: false,
    isLearned: false,
    babyProfile: null,
    learningProgress: 0,
    capturedSamples: [],
    requiredSamples: 10,
    learningInterval: null
};

let aiSettings = {
    caregivers: [],
    routines: {
        feeding: { enabled: false, time: '09:00' },
        sleep: { enabled: false, time: '21:00' },
        play: { enabled: false, time: '15:00' }
    },
    sensitivity: {
        movement: 'medium',
        stranger: 'medium',
        object: 'medium'
    },
    specialCare: {
        premature: false,
        sick: false,
        active: false,
        sleepy: false
    }
};

// Función para generar IDs cortos (estilo React)
function generateShortRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Estados más descriptivos para el usuario (inspirado en React)
const STATUS_MESSAGES = {
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
    connected: 'Conectado',
    streaming: 'Transmitiendo en vivo',
    waiting: 'Esperando receptor...',
    error: 'Error de conexión'
};

// Configuración WebRTC OPTIMIZADA PARA INTERNET
const rtcConfiguration = {
    iceServers: [
        // Múltiples servidores TURN para garantizar conectividad en internet
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443', 
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        // Backup TURN servers
        {
            urls: 'turn:relay.backups.cz',
            username: 'webrtc',
            credential: 'webrtc'
        },
        // STUN servers como respaldo
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 15, // Más candidatos para internet
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all' // Priorizar TURN pero permitir directo si es posible
};

// Inicialización cuando la página carga
window.addEventListener('load', async () => {
    await initializeApp();
});

async function initializeApp() {
    // Obtener información del usuario desde sessionStorage
    const userInfoStr = sessionStorage.getItem('userInfo');
    if (!userInfoStr) {
        alert('No hay información de sesión. Redirigiendo al inicio.');
        window.location.href = '/';
        return;
    }
    
    userInfo = JSON.parse(userInfoStr);
    
    // Inicializar elementos del DOM
    initializeDOMElements();
    
    // Conectar socket
    initializeSocket();
    
    // Obtener dispositivos de cámara disponibles
    await getAvailableCameras();
    
    // Configurar eventos
    setupEventListeners();
    
    // Mostrar información de la sala
    updateRoomInfo();
    
    // Inicializar IA automáticamente al cargar la aplicación
    setTimeout(async () => {
        addLogMessage('🤖 Inicializando sistema de IA automáticamente...');
        const aiInitialized = await initializeAI();
        if (aiInitialized) {
            addLogMessage('✅ IA lista para monitoreo automático del bebé');
            
            // Cargar perfil del bebé guardado
            loadSavedBabyProfile();
        } else {
            addLogMessage('⚠️ Error al inicializar IA - se reintentará al iniciar cámara');
        }
    }, 1000);
    
    addLogMessage('Aplicación inicializada correctamente');
}

function initializeDOMElements() {
    localVideo = document.getElementById('localVideo');
    
    // Elementos de control
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const startStreamBtn = document.getElementById('startStreamBtn');
    const stopStreamBtn = document.getElementById('stopStreamBtn');
    const backBtn = document.getElementById('backBtn');
    
    // Eventos de botones
    startBtn.addEventListener('click', startCamera);
    stopBtn.addEventListener('click', stopCamera);
    switchCameraBtn.addEventListener('click', switchCamera);
    startStreamBtn.addEventListener('click', startStreaming);
    stopStreamBtn.addEventListener('click', stopStreaming);
    backBtn.addEventListener('click', () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (peerConnection) {
            peerConnection.close();
        }
        sessionStorage.removeItem('userInfo');
        window.location.href = '/';
    });
}

function initializeSocket() {
    socket = io();
    
    // Registrar usuario automáticamente
    socket.emit('register-user', {
        username: userInfo.username,
        role: userInfo.role
    });
    
    // Unirse a la sala
    socket.emit('join-room', { roomId: userInfo.roomId });
    
    // Eventos del socket
    socket.on('joined-room', (data) => {
        addLogMessage(`Conectado a sala: ${data.roomId} (${data.receptoresConectados}/${data.maxReceptores} receptores)`);
        updateConnectionStatus('Conectado');
    });
    
    socket.on('receptor-connected', (data) => {
        const receptorInfo = `${data.username} (#${data.receptorNumber})`;
        addLogMessage(`Nuevo receptor conectado: ${receptorInfo}`);
        addLogMessage(`Total receptores: ${data.totalReceptores}/${data.maxReceptores || 10}`);
        
        // Guardar información del receptor
        connectedReceptores.set(data.receptorId, {
            username: data.username,
            number: data.receptorNumber
        });
        
        // Si ya estamos transmitiendo, crear conexión inmediatamente para el nuevo receptor
        if (isStreaming && localStream) {
            addLogMessage(`🔄 Creando conexión para nuevo receptor ${receptorInfo}...`);
            setTimeout(() => {
                recreatePeerConnection(data.receptorId);
            }, 1000);
        }
        
        updateReceptorStatus(`${data.totalReceptores} receptor(es) conectado(s)`);
        document.getElementById('startStreamBtn').disabled = false;
    });
    
    socket.on('receptor-disconnected', (data) => {
        addLogMessage(`Receptor desconectado: ${data.username} (#${data.receptorNumber})`);
        addLogMessage(`Receptores restantes: ${data.remainingReceptores}`);
        
        // Limpiar conexión del receptor desconectado
        if (peerConnections.has(data.receptorId)) {
            peerConnections.get(data.receptorId).close();
            peerConnections.delete(data.receptorId);
        }
        
        connectedReceptores.delete(data.receptorId);
        updateReceptorStatus(`${data.remainingReceptores} receptor(es) conectado(s)`);
        
        if (data.remainingReceptores === 0) {
            document.getElementById('startStreamBtn').disabled = true;
        }
    });
    
    socket.on('answer', (answerData) => {
        handleAnswer(answerData);
    });
    
    socket.on('ice-candidate', (candidateData) => {
        handleIceCandidate(candidateData);
    });
    
    socket.on('connection-update', (update) => {
        addLogMessage(`[${update.event}] ${update.message}`);
        if (update.event === 'answer-received') {
            const receptorMsg = update.receptorNumber ? ` (Receptor #${update.receptorNumber})` : '';
            updateReceptorStatus(`Conectado - Señalización completa${receptorMsg}`);
        }
    });
    
    socket.on('room-update', (update) => {
        addLogMessage(`[Sala] ${update.message}`);
        if (update.totalReceptores !== undefined) {
            updateReceptorStatus(`${update.totalReceptores} receptor(es) en sala`);
        }
    });
    
    socket.on('pong-room', (data) => {
        const receptoresInfo = data.receptores?.map(r => `${r.username} (#${r.number})`).join(', ') || 'Ninguno';
        addLogMessage(`Ping: Emisor=${data.emisorConnected ? 'Sí' : 'No'}, Receptores=${data.receptoresConnectados}/${data.maxReceptores} [${receptoresInfo}]`);
        updateReceptorStatus(`${data.receptoresConnectados} receptor(es) conectado(s)`);
    });
    
    // Escuchar solicitudes de control de IA desde receptores
    socket.on('ai-control-request', (request) => {
        addLogMessage('� Receptor solicita cambio de estado de IA con configuración personalizada');
        
        // Actualizar configuración si se proporciona
        if (request.settings) {
            aiSettings = { ...aiSettings, ...request.settings };
            addLogMessage('🛠️ Configuración de cuidado actualizada desde receptor');
            
            // Mostrar cuidadores configurados
            if (aiSettings.caregivers.length > 0) {
                const names = aiSettings.caregivers.map(c => `${c.name} (${c.type})`).join(', ');
                addLogMessage(`👥 Cuidadores autorizados: ${names}`);
            }
            
            // Configurar el monitor IA con los nuevos ajustes
            if (window.babyAIMonitor) {
                window.babyAIMonitor.updateSettings(aiSettings);
            }
        }
        
        if (request.action === 'toggle') {
            toggleAIMonitoring();
            
            // Enviar respuesta al receptor con información de cuidadores
            setTimeout(() => {
                socket.emit('ai-control-response', {
                    success: true,
                    status: aiMonitorEnabled ? 'enabled' : 'disabled',
                    caregivers: aiSettings.caregivers,
                    message: aiMonitorEnabled ? 'IA activada con configuración personalizada' : 'IA desactivada'
                });
            }, 1000);
        }
    });
    
    // Escuchar actualizaciones de configuración directas
    socket.on('ai-config-update', (newSettings) => {
        aiSettings = { ...aiSettings, ...newSettings };
        addLogMessage('⚙️ Configuración de cuidado actualizada desde receptor');
        
        if (window.babyAIMonitor) {
            window.babyAIMonitor.updateSettings(aiSettings);
        }
        
        if (aiSettings.caregivers.length > 0) {
            const names = aiSettings.caregivers.map(c => c.name).join(', ');
            addLogMessage(`👥 Cuidadores configurados: ${names}`);
        }
    });
    
    // Escuchar solicitudes de prueba de IA
    socket.on('ai-test-request', (request) => {
        addLogMessage('🤖 Receptor solicita prueba de IA');
        
        const stats = window.babyAIMonitor ? window.babyAIMonitor.getStats() : null;
        
        socket.emit('ai-test-response', {
            success: aiMonitorInitialized,
            aiStatus: aiMonitorEnabled ? 'monitoring' : 'stopped',
            analysisCount: stats ? stats.totalAnalyses || 0 : 0,
            message: aiMonitorInitialized ? 'Sistema de IA operativo' : 'Sistema de IA no inicializado'
        });
    });
    
    // Ping periódico para verificar estado
    setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('ping-room');
        }
    }, 5000);
}

async function getAvailableCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput');
        
        addLogMessage(`${availableCameras.length} cámaras disponibles`);
        
        if (availableCameras.length > 1) {
            document.getElementById('switchCameraBtn').style.display = 'inline-block';
        }
    } catch (error) {
        console.error('Error al obtener cámaras:', error);
        addLogMessage('Error al acceder a las cámaras');
    }
}

function setupEventListeners() {
    // Configuración de calidad
    const videoQuality = document.getElementById('videoQuality');
    const frameRate = document.getElementById('frameRate');
    
    videoQuality.addEventListener('change', () => {
        if (localStream && isStreaming) {
            addLogMessage('Reinicia la cámara para aplicar la nueva calidad');
        }
    });
    
    frameRate.addEventListener('change', () => {
        if (localStream && isStreaming) {
            addLogMessage('Reinicia la cámara para aplicar la nueva configuración de FPS');
        }
    });
}

async function startCamera() {
    try {
        // Verificar si estamos en HTTPS (requerido para cámara en internet)
        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost';
        addLogMessage(`Protocolo: ${location.protocol} - Seguro: ${isSecure}`);
        
        if (!isSecure && location.hostname !== 'localhost') {
            throw new Error('HTTPS es requerido para acceder a la cámara en internet');
        }
        
        const constraints = getVideoConstraints();
        addLogMessage('Solicitando permisos de cámara y micrófono...');
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        
        // Verificar tracks obtenidos
        const videoTracks = localStream.getVideoTracks();
        const audioTracks = localStream.getAudioTracks();
        
        addLogMessage(`✅ Cámara obtenida: ${videoTracks.length} video, ${audioTracks.length} audio`);
        
        videoTracks.forEach(track => {
            addLogMessage(`Video: ${track.label} (${track.getSettings().width}x${track.getSettings().height})`);
        });
        
        audioTracks.forEach(track => {
            addLogMessage(`Audio: ${track.label}`);
        });
        
        // Actualizar controles
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('switchCameraBtn').disabled = false;
        
        addLogMessage('✅ Cámara iniciada correctamente');
        
        // Si hay receptor conectado, habilitar transmisión
        if (document.getElementById('receptorStatus').textContent.includes('Conectado')) {
            document.getElementById('startStreamBtn').disabled = false;
            addLogMessage('🎆 Listo para transmitir - hay receptor conectado');
        }
        
        // Inicializar y activar IA automáticamente cuando la cámara está lista
        setTimeout(async () => {
            if (!aiMonitorInitialized) {
                addLogMessage('🤖 Inicializando IA para monitoreo automático...');
                await initializeAI();
            }
            
            if (aiMonitorInitialized && localVideo && localVideo.videoWidth > 0) {
                addLogMessage('👶 Iniciando reconocimiento automático del bebé...');
                const monitoringStarted = startAIMonitoring();
                if (monitoringStarted) {
                    addLogMessage('✅ Monitoreo automático del bebé ACTIVADO');
                } else {
                    addLogMessage('⚠️ No se pudo iniciar el monitoreo automático');
                }
            }
        }, 2000); // Dar tiempo a que el video se estabilice
        
    } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        
        let errorMsg = 'Error al acceder a la cámara: ';
        
        if (error.name === 'NotAllowedError') {
            errorMsg += 'Permisos denegados. Permite el acceso a cámara y micrófono.';
        } else if (error.name === 'NotFoundError') {
            errorMsg += 'No se encontró cámara o micrófono.';
        } else if (error.name === 'NotSupportedError') {
            errorMsg += 'Navegador no soportado. Usa Chrome o Safari.';
        } else if (error.name === 'NotReadableError') {
            errorMsg += 'Cámara en uso por otra aplicación.';
        } else if (error.message.includes('HTTPS')) {
            errorMsg += 'Se requiere HTTPS para usar la cámara en internet.';
        } else {
            errorMsg += error.message;
        }
        
        addLogMessage(`❌ ${errorMsg}`);
        alert(`❌ ${errorMsg}\n\nPasos para solucionarlo:\n1. Permite acceso a cámara y micrófono\n2. Asegúrate de estar en HTTPS\n3. Cierra otras apps que usen la cámara`);
    }
}

function stopCamera() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        localVideo.srcObject = null;
        
        // Si estaba transmitiendo, detener
        if (isStreaming) {
            stopStreaming();
        }
        
        // Detener monitoreo de IA automáticamente
        if (aiMonitorEnabled) {
            addLogMessage('🛑 Deteniendo monitoreo de IA automáticamente...');
            stopAIMonitoring();
        }
    }
    
    // Actualizar controles
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('switchCameraBtn').disabled = true;
    document.getElementById('startStreamBtn').disabled = true;
    
    addLogMessage('Cámara detenida');
}

async function switchCamera() {
    if (availableCameras.length <= 1) return;
    
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    
    // Detener stream actual
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    try {
        const constraints = getVideoConstraints();
        constraints.video.deviceId = { exact: availableCameras[currentCameraIndex].deviceId };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        
        // Si estaba transmitiendo, actualizar el stream en la conexión
        if (isStreaming && peerConnection) {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
        }
        
        addLogMessage(`Cambiado a cámara: ${availableCameras[currentCameraIndex].label || 'Cámara ' + (currentCameraIndex + 1)}`);
        
    } catch (error) {
        console.error('Error al cambiar cámara:', error);
        addLogMessage('Error al cambiar cámara');
    }
}

async function startStreaming() {
    if (!localStream) {
        addLogMessage('Primero inicia la cámara');
        return;
    }
    
    if (connectedReceptores.size === 0) {
        addLogMessage('No hay receptores conectados');
        return;
    }
    
    try {
        addLogMessage('Iniciando transmisión a múltiples receptores...');
        addLogMessage(`Receptores objetivo: ${connectedReceptores.size}`);
        
        // Limpiar conexiones existentes
        peerConnections.forEach(pc => pc.close());
        peerConnections.clear();
        
        // Crear conexiones para cada receptor conectado
        let connectionCount = 0;
        for (const [receptorId, receptorInfo] of connectedReceptores) {
            addLogMessage(`Creando conexión para ${receptorInfo.username} (#${receptorInfo.number})`);
            const pc = createPeerConnection(receptorId);
            peerConnections.set(receptorId, pc);
            connectionCount++;
        }
        
        addLogMessage(`✅ Creadas ${connectionCount} conexiones peer`);
        
        // Crear y enviar ofertas a todos los receptores
        let offersCreated = 0;
        for (const [receptorId, pc] of peerConnections) {
            try {
                const receptorInfo = getReceptorInfo(receptorId);
                addLogMessage(`Creando oferta para ${receptorInfo}...`);
                
                const offer = await pc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                
                await pc.setLocalDescription(offer);
                addLogMessage(`Oferta creada para ${receptorInfo}`);
                
                offersCreated++;
            } catch (error) {
                addLogMessage(`❌ Error creando oferta para receptor ${receptorId}: ${error.message}`);
            }
        }
        
        // Enviar una sola señal al servidor que distribuirá a todos los receptores
        if (offersCreated > 0) {
            // Usar la primera conexión para obtener la oferta
            const firstPc = Array.from(peerConnections.values())[0];
            const offer = firstPc.localDescription;
            
            addLogMessage(`Enviando oferta a ${offersCreated} receptores...`);
            socket.emit('offer', {
                sdp: offer,
                timestamp: new Date().toISOString()
            });
        }
        
        isStreaming = true;
        document.getElementById('startStreamBtn').disabled = true;
        document.getElementById('stopStreamBtn').disabled = false;
        
        addLogMessage(`✨ Transmisión iniciada para ${connectionCount} receptores`);
        updateStreamingStatus(`Transmitiendo a ${connectionCount} receptores`);
        
        // Asegurar que la IA esté activa al iniciar streaming
        if (localVideo && localVideo.videoWidth > 0) {
            setTimeout(async () => {
                if (!aiMonitorInitialized) {
                    addLogMessage('🤖 Inicializando IA para transmisión...');
                    await initializeAI();
                }
                
                if (aiMonitorInitialized && !aiMonitorEnabled) {
                    addLogMessage('👶 Activando monitoreo continuo del bebé para transmisión...');
                    const monitoringStarted = startAIMonitoring();
                    if (monitoringStarted) {
                        addLogMessage('✅ Monitoreo continuo ACTIVADO durante transmisión');
                    }
                }
            }, 1000); // Menos tiempo de espera para activación inmediata
        }
        
    } catch (error) {
        console.error('Error al iniciar streaming:', error);
        addLogMessage(`❌ Error al iniciar streaming: ${error.message}`);
    }
}

function stopStreaming() {
    addLogMessage('Deteniendo transmisión...');
    
    // Detener monitoreo de IA
    if (aiMonitorEnabled) {
        stopAIMonitoring();
    }
    
    // Cerrar todas las conexiones peer
    let closedConnections = 0;
    peerConnections.forEach((pc, receptorId) => {
        const receptorInfo = getReceptorInfo(receptorId);
        addLogMessage(`Cerrando conexión con ${receptorInfo}`);
        pc.close();
        closedConnections++;
    });
    
    peerConnections.clear();
    addLogMessage(`✅ Cerradas ${closedConnections} conexiones`);
    
    isStreaming = false;
    document.getElementById('startStreamBtn').disabled = false;
    document.getElementById('stopStreamBtn').disabled = true;
    
    updateStreamingStatus('Detenido');
    addLogMessage('Transmisión detenida');
}

async function handleAnswer(answerData) {
    try {
        const receptorId = answerData.receptorInfo?.receptorId;
        const receptorNumber = answerData.receptorInfo?.receptorNumber || '?';
        const receptorUsername = answerData.receptorInfo?.username || 'Desconocido';
        const receptorInfo = `${receptorUsername} (#${receptorNumber})`;
        
        addLogMessage(`📨 Recibiendo respuesta del ${receptorInfo}`);
        
        // Extraer SDP de manera robusta
        let answer;
        if (answerData && answerData.sdp) {
            answer = answerData.sdp;
        } else if (answerData && typeof answerData === 'object' && answerData.type) {
            answer = answerData; // Es directamente el SDP
        } else {
            throw new Error('Formato de respuesta SDP inválido');
        }
        
        addLogMessage(`Tipo de respuesta: ${answer.type}`);
        
        // Buscar la conexión peer correcta para este receptor
        let targetPc = null;
        if (receptorId && peerConnections.has(receptorId)) {
            targetPc = peerConnections.get(receptorId);
            addLogMessage(`✅ Conexión encontrada para ${receptorInfo}`);
        } else {
            // Buscar por estado de signaling si no hay ID específico
            for (const [id, pc] of peerConnections) {
                if (pc.signalingState === 'have-local-offer') {
                    targetPc = pc;
                    addLogMessage(`⚠️ Usando conexión disponible para ${receptorInfo} (ID no específico)`);
                    break;
                }
            }
        }
        
        if (!targetPc) {
            addLogMessage(`❌ No se encontró PeerConnection válida para ${receptorInfo}`);
            addLogMessage(`Conexiones disponibles: ${Array.from(peerConnections.keys()).join(', ')}`);
            // Crear nueva conexión si no existe
            if (receptorId) {
                addLogMessage(`🔧 Creando nueva conexión para ${receptorInfo}...`);
                targetPc = createPeerConnection(receptorId);
                peerConnections.set(receptorId, targetPc);
                
                // Crear nueva oferta para este receptor
                const offer = await targetPc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await targetPc.setLocalDescription(offer);
                
                // Enviar nueva oferta
                socket.emit('offer', {
                    sdp: offer,
                    timestamp: new Date().toISOString(),
                    targetReceptor: receptorId
                });
                
                addLogMessage(`📤 Nueva oferta enviada a ${receptorInfo}`);
                return; // Esperar nueva respuesta
            } else {
                throw new Error(`No se puede crear conexión sin ID para ${receptorInfo}`);
            }
        }
        
        // Verificar estado de la conexión
        addLogMessage(`Estado de signaling para ${receptorInfo}: ${targetPc.signalingState}`);
        
        if (targetPc.signalingState !== 'have-local-offer') {
            if (targetPc.signalingState === 'stable') {
                addLogMessage(`⚠️ Conexión ya establecida para ${receptorInfo}, ignorando respuesta duplicada`);
                return;
            } else {
                addLogMessage(`⚠️ Estado inesperado para ${receptorInfo}: ${targetPc.signalingState}`);
                // Intentar proceder de todos modos
            }
        }
        
        await targetPc.setRemoteDescription(answer);
        addLogMessage(`✅ Descripción remota establecida para ${receptorInfo}`);
        
        // Procesar candidates pendientes después de establecer descripción remota
        if (window.pendingIceCandidates && window.pendingIceCandidates.has(receptorId)) {
            const pending = window.pendingIceCandidates.get(receptorId);
            if (pending.length > 0) {
                addLogMessage(`📦 Procesando ${pending.length} ICE candidates pendientes para ${receptorInfo}`);
                for (const pendingCandidate of pending) {
                    try {
                        // Validar formato antes de procesar
                        if (pendingCandidate && pendingCandidate.candidate && pendingCandidate.sdpMid !== undefined) {
                            await targetPc.addIceCandidate(new RTCIceCandidate(pendingCandidate));
                        } else {
                            addLogMessage(`⚠️ Candidate pendiente inválido omitido para ${receptorInfo}`);
                        }
                    } catch (err) {
                        addLogMessage(`❌ Error en candidate pendiente: ${err.message}`);
                    }
                }
                window.pendingIceCandidates.set(receptorId, []);
                addLogMessage(`✅ Candidates pendientes procesados para ${receptorInfo}`);
            }
        }
        
        addLogMessage(`✅ Conexión WebRTC completada con ${receptorInfo}`);
        
        // Actualizar contador de conexiones activas
        const activeConnections = Array.from(peerConnections.values())
            .filter(pc => pc.connectionState === 'connected').length;
        
        if (activeConnections > 0) {
            updateStreamingStatus(`Transmitiendo a ${activeConnections} receptor(es)`);
        }
        
    } catch (error) {
        console.error('Error al manejar respuesta:', error);
        addLogMessage(`❌ Error al establecer conexión: ${error.message}`);
        
        // Reinicio específico para el receptor que falló
        const receptorId = answerData.receptorInfo?.receptorId;
        const receptorUsername = answerData.receptorInfo?.username || 'receptor';
        
        if (receptorId && isStreaming) {
            addLogMessage(`🔄 Reintentando conexión con ${receptorUsername} en 3 segundos...`);
            setTimeout(() => {
                recreatePeerConnection(receptorId);
            }, 3000);
        }
    }
}

async function handleIceCandidate(candidateData) {
    try {
        if (!candidateData.receptorId && !candidateData.emisorId) {
            addLogMessage('⚠️ ICE candidate sin ID de receptor/emisor');
            return;
        }
        
        // Si viene del receptor (tiene emisorId), usar la primera conexión disponible
        // Si viene del emisor (tiene receptorId), usar esa conexión específica
        const receptorId = candidateData.receptorId || Array.from(peerConnections.keys())[0];
        
        if (!receptorId) {
            addLogMessage('⚠️ No hay conexiones peer disponibles para ICE candidate');
            return;
        }
        
        const peerConnection = peerConnections.get(receptorId);
        if (!peerConnection) {
            addLogMessage(`⚠️ No se encontró PeerConnection para receptor ${receptorId}`);
            return;
        }
        
        // Normalizar el formato del candidate
        let candidate = candidateData.candidate || candidateData;
        
        // Si el candidate es un objeto complejo, extraer solo las propiedades necesarias
        if (candidate && typeof candidate === 'object') {
            // Si ya es un RTCIceCandidate, extraer sus propiedades
            if (candidate.candidate && candidate.sdpMid !== undefined) {
                candidate = {
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    usernameFragment: candidate.usernameFragment
                };
            } else if (!candidate.candidate) {
                // Si no tiene la propiedad candidate, es probable que sea el objeto completo
                addLogMessage('⚠️ Formato de candidate inválido, omitiendo...');
                return;
            }
        }
        
        if (peerConnection.remoteDescription === null) {
            addLogMessage(`⚠️ ICE candidate recibido pero no hay descripción remota para ${receptorId}. Almacenando...`);
            // Almacenar candidate para agregarlo después
            if (!window.pendingIceCandidates) {
                window.pendingIceCandidates = new Map();
            }
            if (!window.pendingIceCandidates.has(receptorId)) {
                window.pendingIceCandidates.set(receptorId, []);
            }
            window.pendingIceCandidates.get(receptorId).push(candidate);
            return;
        }
        
        // Validar que el candidate tenga el formato correcto antes de agregarlo
        if (!candidate || !candidate.candidate || candidate.sdpMid === undefined) {
            addLogMessage('⚠️ ICE candidate con formato inválido, omitiendo...');
            return;
        }
        
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        
        const receptorInfo = getReceptorInfo(receptorId);
        addLogMessage(`✅ ICE candidate agregado para ${receptorInfo}: ${candidate.type || 'unknown'}`);
        
        // Procesar candidates pendientes si existen
        if (window.pendingIceCandidates && window.pendingIceCandidates.has(receptorId)) {
            const pending = window.pendingIceCandidates.get(receptorId);
            if (pending.length > 0) {
                addLogMessage(`📦 Procesando ${pending.length} candidates pendientes para ${receptorInfo}`);
                for (const pendingCandidate of pending) {
                    try {
                        // Validar formato antes de procesar
                        if (pendingCandidate && pendingCandidate.candidate && pendingCandidate.sdpMid !== undefined) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(pendingCandidate));
                            addLogMessage(`✅ Candidate pendiente procesado para ${receptorInfo}`);
                        } else {
                            addLogMessage(`⚠️ Candidate pendiente inválido omitido para ${receptorInfo}`);
                        }
                    } catch (err) {
                        addLogMessage(`❌ Error en candidate pendiente para ${receptorInfo}: ${err.message}`);
                    }
                }
                window.pendingIceCandidates.set(receptorId, []);
            }
        }
        
    } catch (error) {
        console.error('Error al agregar ICE candidate:', error);
        addLogMessage(`⚠️ Error ICE candidate: ${error.message}`);
        // No fallar completamente por un candidate malo
    }
}

function getVideoConstraints() {
    const quality = document.getElementById('videoQuality').value;
    const frameRate = parseInt(document.getElementById('frameRate').value);
    
    // Detectar si es móvil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    let constraints = {
        video: {
            frameRate: { ideal: frameRate, max: frameRate },
            // Configuración específica para móviles
            facingMode: isMobile ? 'user' : undefined,
            // Códecs compatibles
            googEchoCancellation: true,
            googAutoGainControl: true,
            googNoiseSuppression: true,
            googHighpassFilter: true,
            googTypingNoiseDetection: true
        },
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            // Configuración específica para móviles
            sampleRate: isMobile ? 44100 : 48000,
            channelCount: 1
        }
    };
    
    // Configurar resolución según calidad y dispositivo
    switch (quality) {
        case 'low':
            constraints.video.width = { ideal: 320, max: 320 };
            constraints.video.height = { ideal: 240, max: 240 };
            break;
        case 'medium':
            if (isMobile) {
                constraints.video.width = { ideal: 480, max: 640 };
                constraints.video.height = { ideal: 360, max: 480 };
            } else {
                constraints.video.width = { ideal: 640, max: 640 };
                constraints.video.height = { ideal: 480, max: 480 };
            }
            break;
        case 'high':
            if (isMobile) {
                constraints.video.width = { ideal: 720, max: 1280 };
                constraints.video.height = { ideal: 540, max: 720 };
            } else {
                constraints.video.width = { ideal: 1280, max: 1280 };
                constraints.video.height = { ideal: 720, max: 720 };
            }
            break;
    }
    
    // Log para debugging
    addLogMessage(`Dispositivo: ${isIOS ? 'iOS' : isAndroid ? 'Android' : 'Desktop'}`);
    addLogMessage(`Configuración: ${constraints.video.width.ideal}x${constraints.video.height.ideal}@${frameRate}fps`);
    
    return constraints;
}

function updateRoomInfo() {
    document.getElementById('roomIdDisplay').textContent = userInfo.roomId;
}

function updateConnectionStatus(status) {
    document.getElementById('connectionStatus').textContent = status;
}

function updateReceptorStatus(status) {
    document.getElementById('receptorStatus').textContent = status;
}

function updateStreamingStatus(status) {
    const statusElement = document.getElementById('streamingStatus');
    if (statusElement) {
        statusElement.textContent = status;
    }
    addLogMessage(`📡 Estado transmisión: ${status}`);
}

async function checkConnectionType() {
    if (!peerConnection) return;
    
    try {
        const stats = await peerConnection.getStats();
        
        stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                addLogMessage(`🔗 Tipo de conexión activa: ${report.localCandidateId} -> ${report.remoteCandidateId}`);
            }
            
            if (report.type === 'local-candidate') {
                addLogMessage(`🏠 Candidato local: ${report.candidateType} (${report.protocol})`);
            }
            
            if (report.type === 'remote-candidate') {
                addLogMessage(`🌍 Candidato remoto: ${report.candidateType} (${report.protocol})`);
            }
        });
        
    } catch (error) {
        addLogMessage(`Error al verificar tipo de conexión: ${error.message}`);
    }
}

async function checkTransmissionStats() {
    if (!peerConnection) return;
    
    try {
        const stats = await peerConnection.getStats();
        let videoBytesSent = 0;
        let audioBytesSent = 0;
        
        stats.forEach(report => {
            if (report.type === 'outbound-rtp') {
                if (report.mediaType === 'video') {
                    videoBytesSent = report.bytesSent || 0;
                    addLogMessage(`📹 Video bytes enviados: ${videoBytesSent}`);
                    if (report.framesEncoded) {
                        addLogMessage(`🎥 Frames codificados: ${report.framesEncoded}`);
                    }
                }
                if (report.mediaType === 'audio') {
                    audioBytesSent = report.bytesSent || 0;
                    addLogMessage(`🎤 Audio bytes enviados: ${audioBytesSent}`);
                }
            }
        });
        
        if (videoBytesSent === 0) {
            addLogMessage('⚠️ No se están enviando datos de video - Reiniciando...');
            // Reiniciar transmisión si no se envían datos
            setTimeout(() => {
                stopStreaming();
                setTimeout(() => startStreaming(), 2000);
            }, 1000);
        } else {
            addLogMessage('✅ Transmisión de video activa y funcionando');
            // Continuar monitoreando
            setTimeout(() => checkTransmissionStats(), 5000);
        }
        
    } catch (error) {
        addLogMessage(`Error al verificar estadísticas: ${error.message}`);
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

// --- FUNCIONES DE IA PARA MONITOREO DE BEBÉ ---

async function initializeAI() {
    if (aiMonitorInitialized) return true;
    
    try {
        addLogMessage('🤖 Inicializando sistema de IA para monitoreo...');
        
        // Esperar un momento para asegurar que los scripts se carguen
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verificar dependencias paso a paso
        addLogMessage('🔍 Verificando dependencias de IA...');
        
        if (!window.tf) {
            throw new Error('❌ TensorFlow.js no está cargado. Verifica tu conexión a internet y recarga la página.');
        }
        addLogMessage('✅ TensorFlow.js disponible');
        
        if (!window.cocoSsd) {
            throw new Error('❌ COCO-SSD no está cargado. Verifica tu conexión a internet.');
        }
        addLogMessage('✅ COCO-SSD disponible');
        
        if (!window.Pose) {
            addLogMessage('⚠️ MediaPipe Pose no disponible, usando modo básico');
        } else {
            addLogMessage('✅ MediaPipe Pose disponible');
        }
        
        if (!window.BabyAIMonitorV2) {
            throw new Error('❌ Clase BabyAIMonitorV2 no encontrada. Verifica que ai-baby-monitor-v2.js esté cargado correctamente.');
        }
        addLogMessage('✅ BabyAIMonitor V2 disponible');
        
        // Crear instancia si no existe
        if (!window.babyAIMonitor) {
            addLogMessage('🏗️ Creando instancia de BabyAIMonitor V2...');
            window.babyAIMonitor = new window.BabyAIMonitorV2();
            addLogMessage('✅ Instancia V2 creada exitosamente');
        }
        
        addLogMessage('⏳ Cargando modelos de IA (esto puede tomar unos segundos)...');
        const success = await window.babyAIMonitor.initialize();
        
        if (success) {
            aiMonitorInitialized = true;
            addLogMessage('🎉 ¡Sistema de IA inicializado correctamente! Protección del bebé activada');
            
            // Actualizar botón de IA
            const aiToggle = document.getElementById('aiMonitorToggle');
            if (aiToggle) {
                aiToggle.textContent = '✅ IA Lista - Clic para Activar';
                aiToggle.className = 'btn-success';
            }
            
            return true;
        } else {
            throw new Error('❌ Falló la inicialización de los modelos de IA');
        }
        
    } catch (error) {
        console.error('Error al inicializar IA:', error);
        addLogMessage(`❌ ${error.message}`);
        
        // Mostrar ayuda específica al usuario
        if (error.message.includes('TensorFlow') || error.message.includes('COCO-SSD') || error.message.includes('PoseDetection')) {
            addLogMessage('💡 Solución: Verifica tu conexión a internet y recarga la página');
            addLogMessage('🔧 Si el problema persiste, prueba con otro navegador');
        } else if (error.message.includes('BabyAIMonitor')) {
            addLogMessage('💡 Solución: Recarga la página completamente (Ctrl+F5)');
        }
        
        // Actualizar botón de IA
        const aiToggle = document.getElementById('aiMonitorToggle');
        if (aiToggle) {
            aiToggle.textContent = '❌ Error IA - Reintentar';
            aiToggle.className = 'btn-warning';
        }
        
        return false;
    }
}

function startAIMonitoring() {
    if (!aiMonitorInitialized || !localVideo) {
        addLogMessage('⚠️ IA no inicializada o video no disponible');
        return false;
    }
    
    try {
        const success = window.babyAIMonitor.startMonitoring(localVideo, handleAIAlert);
        if (success) {
            aiMonitorEnabled = true;
            addLogMessage('👶 Monitoreo inteligente del bebé ACTIVADO');
            
            // Actualizar UI
            const aiToggle = document.getElementById('aiMonitorToggle');
            if (aiToggle) {
                aiToggle.textContent = '🔴 Detener IA';
                aiToggle.className = 'btn-danger';
            }
            
            return true;
        }
    } catch (error) {
        console.error('Error al iniciar monitoreo IA:', error);
        addLogMessage(`❌ Error al iniciar monitoreo IA: ${error.message}`);
    }
    
    return false;
}

function stopAIMonitoring() {
    if (!aiMonitorEnabled) return;
    
    try {
        window.babyAIMonitor.stopMonitoring();
        aiMonitorEnabled = false;
        addLogMessage('⏹️ Monitoreo inteligente del bebé DESACTIVADO');
        
        // Actualizar UI
        const aiToggle = document.getElementById('aiMonitorToggle');
        if (aiToggle) {
            aiToggle.textContent = '🤖 Activar IA';
            aiToggle.className = 'btn-primary';
        }
        
    } catch (error) {
        console.error('Error al detener monitoreo IA:', error);
        addLogMessage(`❌ Error al detener IA: ${error.message}`);
    }
}

function handleAIAlert(type, data) {
    console.log('🚨 ALERTA IA:', type, data);
    
    // Log discreto en el emisor para seguimiento
    addLogMessage(`🔍 [${type.toUpperCase()}] ${data.message}`);
    
    // Preparar datos completos de alerta para enviar al receptor
    const alertData = {
        type: type,
        severity: data.severity || 'medium',
        message: data.message,
        confidence: data.confidence || 0.8,
        timestamp: new Date().toISOString(),
        roomId: userInfo.roomId,
        details: data.details || {},
        location: data.location || 'centro',
        emisorInfo: {
            username: userInfo.username,
            cameraLocation: userInfo.location || 'Habitación del bebé'
        },
        actionRecommendations: getActionRecommendations(type, data.severity)
    };
    
    // Enviar alerta inmediatamente al receptor
    socket.emit('ai-alert', alertData);
    
    // Log de confirmación de envío
    addLogMessage(`📡 Notificación enviada al receptor: ${data.severity.toUpperCase()}`);
    
    console.log('📡 Alerta completa enviada al receptor:', alertData);
}

// Nueva función para proporcionar recomendaciones de acción
function getActionRecommendations(alertType, severity) {
    const recommendations = {
        'baby_obstruction': {
            'CRITICAL': ['Verificar inmediatamente al bebé', 'Asegurar vías respiratorias despejadas'],
            'HIGH': ['Comprobar posición del bebé', 'Verificar que no hay objetos cercanos'],
            'MEDIUM': ['Observar al bebé por unos minutos', 'Verificar comodidad']
        },
        'dangerous_object': {
            'CRITICAL': ['Remover objeto peligroso inmediatamente', 'Revisar área del bebé'],
            'HIGH': ['Identificar y evaluar objeto', 'Mantener supervisión'],
            'MEDIUM': ['Verificar seguridad del entorno']
        },
        'movement_anomaly': {
            'CRITICAL': ['Verificar estado del bebé inmediatamente'],
            'HIGH': ['Observar patrones de movimiento'],
            'MEDIUM': ['Continuar supervisión']
        },
        'no_baby_detected': {
            'CRITICAL': ['Localizar al bebé inmediatamente'],
            'HIGH': ['Verificar ubicación del bebé'],
            'MEDIUM': ['Comprobar área de la cámara']
        }
    };
    
    return recommendations[alertType]?.[severity] || ['Verificar situación del bebé'];
}

function showAIAlertNotification(type, data) {
    // Crear notificación visual
    const notification = document.createElement('div');
    notification.className = `ai-alert alert-${data.severity.toLowerCase()}`;
    notification.innerHTML = `
        <div class="alert-content">
            <h4>🚨 ALERTA DE SEGURIDAD</h4>
            <p>${data.message}</p>
            <small>${new Date().toLocaleTimeString()}</small>
            <button onclick="this.parentElement.parentElement.remove()">Cerrar</button>
        </div>
    `;
    
    // Agregar al DOM
    document.body.appendChild(notification);
    
    // Auto-remover después de 10 segundos para alertas menores
    if (data.severity !== 'CRITICAL') {
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }
}

function playAlertSound(severity) {
    // Crear audio context para sonido de alerta
    if (typeof AudioContext !== 'undefined') {
        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Configurar frecuencia según severidad
        const frequency = severity === 'CRITICAL' ? 800 : 
                         severity === 'HIGH' ? 600 : 400;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        
        // Configurar volumen y duración
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 1);
    }
}

function toggleAIMonitoring() {
    const aiToggle = document.getElementById('aiMonitorToggle');
    
    if (!aiMonitorInitialized) {
        // Mostrar feedback de que está inicializando
        if (aiToggle) {
            aiToggle.textContent = '⏳ Inicializando IA...';
            aiToggle.className = 'btn-warning';
            aiToggle.disabled = true;
        }
        
        initializeAI().then(success => {
            if (aiToggle) {
                aiToggle.disabled = false;
            }
            
            if (success) {
                startAIMonitoring();
            } else {
                if (aiToggle) {
                    aiToggle.textContent = '❌ Error IA - Reintentar';
                    aiToggle.className = 'btn-danger';
                }
            }
        });
    } else if (aiMonitorEnabled) {
        stopAIMonitoring();
    } else {
        startAIMonitoring();
    }
}

// --- FUNCIONES DE MANEJO MEJORADAS PARA MÚLTIPLES RECEPTORES ---

// Crear una nueva conexión peer para un receptor
function createPeerConnection(receptorId) {
    const pc = new RTCPeerConnection(rtcConfiguration);
    
    // Agregar tracks del stream local
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }
    
    // Manejar ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            const candidate = event.candidate;
            addLogMessage(`🧊 ICE candidate para receptor ${getReceptorInfo(receptorId)}: ${candidate.type}`);
            socket.emit('ice-candidate', candidate);
        }
    };
    
    // Monitorear estado de conexión
    pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        const receptorInfo = getReceptorInfo(receptorId);
        addLogMessage(`🔄 Estado WebRTC ${receptorInfo}: ${state}`);
        
        if (state === 'connected') {
            addLogMessage(`✅ Conexión establecida con ${receptorInfo}`);
        } else if (state === 'failed') {
            addLogMessage(`❌ Conexión falló con ${receptorInfo}`);
            // Intentar reconectar
            setTimeout(() => {
                if (isStreaming) {
                    addLogMessage(`🔄 Reintentando conexión con ${receptorInfo}...`);
                    recreatePeerConnection(receptorId);
                }
            }, 3000);
        }
    };
    
    return pc;
}

// Obtener información del receptor para logs
function getReceptorInfo(receptorId) {
    const receptor = connectedReceptores.get(receptorId);
    return receptor ? `${receptor.username} (#${receptor.number})` : `Receptor ${receptorId.substring(0, 8)}`;
}

// Recrear conexión peer para un receptor específico
async function recreatePeerConnection(receptorId) {
    if (peerConnections.has(receptorId)) {
        peerConnections.get(receptorId).close();
        peerConnections.delete(receptorId);
    }
    
    const newPc = createPeerConnection(receptorId);
    peerConnections.set(receptorId, newPc);
    
    // Crear nueva oferta para este receptor
    try {
        const offer = await newPc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await newPc.setLocalDescription(offer);
        
        // Enviar solo a este receptor específico (el servidor manejará el routing)
        socket.emit('offer', {
            sdp: offer,
            timestamp: new Date().toISOString(),
            targetReceptor: receptorId
        });
    } catch (error) {
        addLogMessage(`❌ Error al recrear conexión con ${getReceptorInfo(receptorId)}: ${error.message}`);
    }
}

// Toggle mute/unmute del audio local
function toggleLocalMute() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach(track => {
            track.enabled = !track.enabled;
        });
        
        const isMuted = !audioTracks[0]?.enabled;
        const muteBtn = document.getElementById('muteLocalBtn');
        if (muteBtn) {
            muteBtn.textContent = isMuted ? '🔇 Audio Desactivado' : '🎤 Audio Activo';
        }
        addLogMessage(isMuted ? '🔇 Audio local silenciado' : '🎤 Audio local activado');
        return isMuted;
    }
}

// Toggle video on/off del stream local
function toggleLocalVideo() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach(track => {
            track.enabled = !track.enabled;
        });
        
        const isVideoOff = !videoTracks[0]?.enabled;
        const videoBtn = document.getElementById('toggleVideoBtn');
        if (videoBtn) {
            videoBtn.textContent = isVideoOff ? '📹 Video Desactivado' : '🎥 Video Activo';
        }
        addLogMessage(isVideoOff ? '📹 Video local desactivado' : '🎥 Video local activado');
        return isVideoOff;
    }
}

// Cleanup completo al desconectar (estilo React hangUp)
function performCompleteCleanup() {
    addLogMessage('🧽 Iniciando limpieza completa...');
    
    // Cerrar conexión peer
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        addLogMessage('✅ Conexión WebRTC cerrada');
    }
    
    // Detener todos los tracks del stream local
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
            addLogMessage(`✅ Track detenido: ${track.kind}`);
        });
        localStream = null;
    }
    
    // Limpiar video local
    if (localVideo) {
        localVideo.srcObject = null;
    }
    
    // Resetear estados
    isStreaming = false;
    connectionStatus = 'disconnected';
    
    // Actualizar UI
    updateStreamingStatus('Desconectado');
    updateButtonStates();
    
    addLogMessage('✨ Limpieza completa finalizada');
}

// Actualizar estados de conexión de forma más descriptiva
function updateConnectionStatusAdvanced(newStatus, additionalInfo = '') {
    connectionStatus = newStatus;
    const statusDisplay = document.getElementById('connectionStatus');
    
    let displayText = STATUS_MESSAGES[newStatus] || newStatus;
    if (additionalInfo) displayText += ` - ${additionalInfo}`;
    
    if (statusDisplay) {
        statusDisplay.textContent = displayText;
        statusDisplay.className = `status-${newStatus}`; // Para CSS dinámico
    }
    
    addLogMessage(`🔄 Estado: ${displayText}`);
}

// Función para copiar ID de sala al portapapeles (del código React)
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

// === FUNCIONES PARA MÚLTIPLES RECEPTORES ===

// Función para habilitar modo multi-receptor
function enableMultiReceptorMode() {
    addLogMessage('🔀 Modo múltiples receptores activado');
    // Las funciones ya están actualizadas en el socket handler
}

// ===========================================
// SISTEMA DE RECONOCIMIENTO INTELIGENTE DEL BEBÉ
// ===========================================

/**
 * Iniciar el proceso de aprendizaje del bebé
 */
function startBabyLearning() {
    if (!localVideo || !localVideo.videoWidth) {
        alert('❌ Primero inicia la cámara para poder reconocer al bebé');
        return;
    }
    
    if (!aiMonitorInitialized) {
        alert('❌ Primero se debe inicializar el sistema de IA');
        return;
    }
    
    babyRecognitionSystem.isLearning = true;
    babyRecognitionSystem.learningProgress = 0;
    babyRecognitionSystem.capturedSamples = [];
    
    // Actualizar UI
    updateRecognitionUI();
    
    // Mostrar panel de progreso
    const progressPanel = document.getElementById('learningProgress');
    if (progressPanel) progressPanel.style.display = 'block';
    
    addLogMessage('🎯 Iniciando aprendizaje del bebé...');
    
    // Comenzar captura de muestras
    let sampleCount = 0;
    babyRecognitionSystem.learningInterval = setInterval(async () => {
        if (sampleCount >= babyRecognitionSystem.requiredSamples) {
            completeBabyLearning();
            return;
        }
        
        const sample = await captureBabySample();
        if (sample) {
            babyRecognitionSystem.capturedSamples.push(sample);
            sampleCount++;
            babyRecognitionSystem.learningProgress = (sampleCount / babyRecognitionSystem.requiredSamples) * 100;
            
            updateLearningProgress();
            updateLearningTips(sampleCount);
        }
        
    }, 2000); // Capturar una muestra cada 2 segundos
}

/**
 * Completar el proceso de aprendizaje del bebé
 */
function completeBabyLearning() {
    clearInterval(babyRecognitionSystem.learningInterval);
    
    if (babyRecognitionSystem.capturedSamples.length < 5) {
        alert('❌ No se capturaron suficientes muestras. Inténtalo de nuevo.');
        resetBabyLearning();
        return;
    }
    
    // Procesar muestras y crear perfil del bebé
    babyRecognitionSystem.babyProfile = createBabyProfile(babyRecognitionSystem.capturedSamples);
    babyRecognitionSystem.isLearned = true;
    babyRecognitionSystem.isLearning = false;
    
    // Guardar en localStorage
    localStorage.setItem('babyProfile', JSON.stringify(babyRecognitionSystem.babyProfile));
    
    // Actualizar UI
    updateRecognitionUI();
    
    // Ocultar panel de progreso
    const progressPanel = document.getElementById('learningProgress');
    if (progressPanel) progressPanel.style.display = 'none';
    
    addLogMessage('🎉 ¡Bebé reconocido exitosamente! IA personalizada activada');
    
    // Actualizar sistema de IA con el perfil del bebé
    if (window.babyAIMonitor) {
        window.babyAIMonitor.setBabyProfile(babyRecognitionSystem.babyProfile);
    }
}

/**
 * Resetear el aprendizaje del bebé
 */
function resetBabyLearning() {
    if (babyRecognitionSystem.learningInterval) {
        clearInterval(babyRecognitionSystem.learningInterval);
    }
    
    babyRecognitionSystem.isLearning = false;
    babyRecognitionSystem.isLearned = false;
    babyRecognitionSystem.babyProfile = null;
    babyRecognitionSystem.learningProgress = 0;
    babyRecognitionSystem.capturedSamples = [];
    
    // Limpiar localStorage
    localStorage.removeItem('babyProfile');
    
    // Actualizar UI
    updateRecognitionUI();
    
    // Ocultar panel de progreso
    const progressPanel = document.getElementById('learningProgress');
    if (progressPanel) progressPanel.style.display = 'none';
    
    addLogMessage('🔄 Reconocimiento del bebé reiniciado');
    
    // Actualizar sistema de IA
    if (window.babyAIMonitor) {
        window.babyAIMonitor.setBabyProfile(null);
    }
}

/**
 * Actualizar UI del sistema de reconocimiento
 */
function updateRecognitionUI() {
    const statusElement = document.getElementById('recognitionStatus');
    const learnedElement = document.getElementById('babyLearned');
    const learnBtn = document.getElementById('learnBabyBtn');
    const resetBtn = document.getElementById('resetLearningBtn');
    
    if (babyRecognitionSystem.isLearning) {
        if (statusElement) statusElement.textContent = 'Aprendiendo...';
        if (learnedElement) learnedElement.textContent = 'En proceso';
        if (learnBtn) {
            learnBtn.textContent = '⏳ Aprendiendo...';
            learnBtn.disabled = true;
        }
    } else if (babyRecognitionSystem.isLearned) {
        if (statusElement) statusElement.textContent = 'Bebé reconocido ✅';
        if (learnedElement) learnedElement.textContent = 'Sí';
        if (learnBtn) {
            learnBtn.textContent = '✅ Bebé Reconocido';
            learnBtn.disabled = false;
        }
        if (resetBtn) resetBtn.disabled = false;
    } else {
        if (statusElement) statusElement.textContent = 'No entrenado';
        if (learnedElement) learnedElement.textContent = 'No';
        if (learnBtn) {
            learnBtn.textContent = '🎯 Reconocer Mi Bebé';
            learnBtn.disabled = false;
        }
        if (resetBtn) resetBtn.disabled = true;
    }
}

/**
 * Actualizar barra de progreso
 */
function updateLearningProgress() {
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = `${babyRecognitionSystem.learningProgress}%`;
    }
}

/**
 * Actualizar consejos durante el aprendizaje
 */
function updateLearningTips(sampleCount) {
    const tipsElement = document.getElementById('learningTips');
    if (!tipsElement) return;
    
    const tips = [
        'Mantén al bebé visible en el centro',
        'Asegúrate de que esté bien iluminado',
        'Evita movimientos bruscos',
        'Muestra diferentes posiciones del bebé',
        'Mantén la cámara estable',
        'El bebé puede estar con o sin gorra',
        'Puede estar acostado o despierto',
        'Incluye momentos de alimentación',
        'Capturando características finales...',
        '¡Casi terminado!'
    ];
    
    if (sampleCount < tips.length) {
        tipsElement.textContent = tips[sampleCount];
    }
}

/**
 * Cargar perfil del bebé guardado
 */
function loadSavedBabyProfile() {
    const saved = localStorage.getItem('babyProfile');
    if (saved) {
        try {
            babyRecognitionSystem.babyProfile = JSON.parse(saved);
            babyRecognitionSystem.isLearned = true;
            updateRecognitionUI();
            
            // Actualizar sistema de IA con el perfil cargado
            if (window.babyAIMonitor) {
                window.babyAIMonitor.setBabyProfile(babyRecognitionSystem.babyProfile);
            }
            
            addLogMessage('👶 Perfil del bebé cargado desde memoria');
            return true;
        } catch (error) {
            console.error('Error cargando perfil del bebé:', error);
            localStorage.removeItem('babyProfile');
        }
    }
    return false;
}

/**
 * Capturar una muestra del bebé para aprendizaje
 */
async function captureBabySample() {
    if (!window.babyAIMonitor || !window.babyAIMonitor.detectionModel) {
        return null;
    }
    
    try {
        // Usar el canvas del sistema de IA para análisis
        const canvas = window.babyAIMonitor.canvas;
        const ctx = window.babyAIMonitor.ctx;
        
        if (!canvas || !ctx) return null;
        
        // Actualizar canvas con frame actual
        canvas.width = localVideo.videoWidth;
        canvas.height = localVideo.videoHeight;
        ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
        
        // Detectar personas en el frame
        const predictions = await window.babyAIMonitor.detectionModel.detect(canvas);
        const people = predictions.filter(p => p.class === 'person' && p.score > 0.6);
        
        if (people.length === 1) {
            // Idealmente solo una persona (el bebé) en el frame
            const person = people[0];
            const bbox = person.bbox;
            
            // Extraer características del bebé
            const characteristics = extractBabyCharacteristics(bbox, canvas);
            
            return {
                timestamp: Date.now(),
                bbox: bbox,
                characteristics: characteristics,
                confidence: person.score,
                frameSize: { width: canvas.width, height: canvas.height }
            };
        }
        
        return null;
        
    } catch (error) {
        console.error('Error capturando muestra del bebé:', error);
        return null;
    }
}

/**
 * Extraer características específicas del bebé
 */
function extractBabyCharacteristics(bbox, canvas) {
    const [x, y, width, height] = bbox;
    
    // Características básicas
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const area = width * height;
    const aspectRatio = width / height;
    
    return {
        // Características físicas
        size: { width, height, area },
        aspectRatio,
        position: { centerX, centerY },
        relativeSize: area / (canvas.width * canvas.height),
        
        // Posición típica en la imagen
        preferredZone: {
            horizontal: centerX / canvas.width,
            vertical: centerY / canvas.height
        }
    };
}

/**
 * Crear perfil del bebé a partir de las muestras capturadas
 */
function createBabyProfile(samples) {
    if (!samples.length) return null;
    
    // Promediar características
    const profile = {
        id: `baby_${Date.now()}`,
        learnedAt: new Date().toISOString(),
        sampleCount: samples.length,
        
        // Tamaño promedio
        avgSize: {
            width: samples.reduce((sum, s) => sum + s.bbox[2], 0) / samples.length,
            height: samples.reduce((sum, s) => sum + s.bbox[3], 0) / samples.length,
            area: samples.reduce((sum, s) => sum + s.characteristics.size.area, 0) / samples.length
        },
        
        // Proporción típica
        avgAspectRatio: samples.reduce((sum, s) => sum + s.characteristics.aspectRatio, 0) / samples.length,
        
        // Tamaño relativo típico en la imagen
        avgRelativeSize: samples.reduce((sum, s) => sum + s.characteristics.relativeSize, 0) / samples.length,
        
        // Zona preferida en la imagen
        preferredZone: {
            horizontal: samples.reduce((sum, s) => sum + s.characteristics.preferredZone.horizontal, 0) / samples.length,
            vertical: samples.reduce((sum, s) => sum + s.characteristics.preferredZone.vertical, 0) / samples.length
        },
        
        // Rangos de tolerancia
        tolerances: {
            sizeVariation: 0.4,    // 40% de variación en tamaño para bebés que crecen
            positionVariation: 0.3, // 30% de variación en posición 
            aspectRatioVariation: 0.3 // 30% de variación en proporciones (acostado vs parado)
        }
    };
    
    return profile;
}
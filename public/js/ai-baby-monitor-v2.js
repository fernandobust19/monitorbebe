/**
 * Sistema de monitoreo inteligente de bebés con Google MediaPipe
 * Optimizado para mejor rendimiento y menos forced reflows
 */

class BabyAIMonitorV2 {
    constructor(aiSettings = {}) {
        this.isInitialized = false;
        this.isMonitoring = false;
        this.pose = null;
        this.detectionModel = null;
        this.canvas = null;
        this.ctx = null;
        this.alertCallback = null;
        this.videoElement = null;
        this.settings = aiSettings;
        
        // Inicializar detección de cuidadores si está disponible
        this.caregiverDetection = typeof CaregiverDetection !== 'undefined' ? 
                                 new CaregiverDetection(this.settings) : null;
        
        // Configuración optimizada para detección sensible y continua
        this.config = {
            detectionInterval: 800, // Cada 0.8 segundos para detección más continua
            confidenceThreshold: 0.35, // Más sensible para detectar personas/bebés
            dangerZoneRadius: 0.25, // Zona de peligro más amplia
            movementThreshold: 0.06, // Más sensible al movimiento
            coverageThreshold: 0.6, // Umbral más bajo para detección de cobertura
            babyDetectionSensitivity: 0.4, // Nueva configuración para detección de bebés
            continuousMonitoring: true, // Activar monitoreo continuo
            alertCooldownTime: 3000 // Reducir tiempo entre alertas a 3 segundos
        };
        
        // Almacenar estadísticas y historial
        this.analysisCount = 0;
        this.lastAnalysisTime = null;
        this.detectionHistory = [];
        
        // Estado de seguimiento
        this.lastBabyPosition = null;
        this.lastMovementTime = Date.now();
        this.alertCooldown = new Map();
        
        console.log('🤖 Sistema de IA V2 con Google MediaPipe inicializado');
    }
    
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        
        // Actualizar detección de cuidadores
        if (this.caregiverDetection) {
            this.caregiverDetection.updateSettings(this.settings);
        }
        
        console.log('⚙️ Configuración de IA actualizada:', this.settings);
    }

    async initialize() {
        try {
            console.log('🚀 Inicializando sistema avanzado de IA...');
            
            // Inicializar Google MediaPipe Pose
            if (window.Pose) {
                console.log('📡 Configurando MediaPipe Pose...');
                this.pose = new window.Pose({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
                    }
                });
                
                this.pose.setOptions({
                    modelComplexity: 0, // 0=lite, 1=full, 2=heavy - usamos lite para mejor rendimiento
                    smoothLandmarks: true,
                    enableSegmentation: false,
                    smoothSegmentation: false,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                
                console.log('✅ MediaPipe Pose configurado');
            }
            
            // Cargar modelo de detección COCO-SSD (más ligero)
            if (window.cocoSsd) {
                console.log('📦 Cargando modelo de detección de objetos...');
                this.detectionModel = await window.cocoSsd.load({
                    base: 'lite_mobilenet_v2' // Versión más ligera
                });
                console.log('✅ Modelo de detección cargado (versión ligera)');
            }
            
            // Crear canvas optimizado
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d', {
                alpha: false,
                desynchronized: true // Mejor rendimiento
            });
            
            this.isInitialized = true;
            console.log('🎉 Sistema de IA V2 inicializado correctamente');
            
            return true;
            
        } catch (error) {
            console.error('❌ Error al inicializar IA V2:', error);
            return false;
        }
    }

    startMonitoring(videoElement, alertCallback) {
        if (!this.isInitialized) {
            console.error('⚠️ Sistema de IA no inicializado');
            return false;
        }

        this.videoElement = videoElement;
        this.alertCallback = alertCallback;
        this.isMonitoring = true;
        
        console.log('👶 Iniciando monitoreo inteligente continuo del bebé...');
        
        // Activar inmediatamente el reconocimiento automático del bebé
        this.enableAutomaticBabyDetection = true;
        this.lastBabyDetectionTime = Date.now();
        
        // Iniciar análisis periódico optimizado con detección continua
        this.startPeriodicAnalysis();
        
        // Iniciar verificación de presencia continua del bebé
        this.startContinuousBabyCheck();
        
        return true;
    }

    stopMonitoring() {
        this.isMonitoring = false;
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
        }
        if (this.continuousBabyCheckInterval) {
            clearInterval(this.continuousBabyCheckInterval);
        }
        console.log('⏹️ Monitoreo detenido');
    }

    // Nueva función para verificación continua de la presencia del bebé
    startContinuousBabyCheck() {
        this.babyDetectionHistory = [];
        this.lastBabyDetectionTime = Date.now();
        
        // Verificar cada 5 segundos si el bebé está presente
        this.continuousBabyCheckInterval = setInterval(() => {
            if (this.isMonitoring) {
                this.checkContinuousBabyPresence();
            }
        }, 5000);
        
        console.log('🔄 Verificación continua del bebé activada');
    }

    checkContinuousBabyPresence() {
        const now = Date.now();
        const timeSinceLastDetection = now - this.lastBabyDetectionTime;
        
        // Si ha pasado más de 15 segundos sin detectar el bebé, enviar alerta
        if (timeSinceLastDetection > 15000) {
            this.sendAlert('no_baby_detected', {
                message: 'No se detecta al bebé en el campo de visión',
                severity: 'HIGH',
                confidence: 0.9,
                details: {
                    lastDetection: this.lastBabyDetectionTime,
                    timeSinceLastDetection: Math.round(timeSinceLastDetection / 1000)
                }
            });
            
            // Resetear el tiempo para evitar spam de alertas
            this.lastBabyDetectionTime = now - 10000;
        }
    }

    startPeriodicAnalysis() {
        // Usar setInterval optimizado en lugar de requestAnimationFrame constante
        this.analysisInterval = setInterval(async () => {
            if (this.isMonitoring && this.videoElement && this.videoElement.videoWidth > 0) {
                await this.analyzeFrame();
            }
        }, this.config.detectionInterval);
    }

    async analyzeFrame() {
        try {
            this.analysisCount++;
            
            // Optimización: solo analizar si el video está realmente reproduciéndose
            if (this.videoElement.paused || this.videoElement.ended) return;
            
            // Configurar canvas una sola vez por tamaño
            if (this.canvas.width !== this.videoElement.videoWidth) {
                this.canvas.width = this.videoElement.videoWidth;
                this.canvas.height = this.videoElement.videoHeight;
                console.log(`📐 Canvas configurado: ${this.canvas.width}x${this.canvas.height}`);
            }
            
            // Dibujar frame actual
            this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
            
            // Detección de objetos (cada análisis para máxima sensibilidad)
            if (this.detectionModel) {
                await this.analyzeObjects();
            }
            
            // Detección de poses/movimiento (cada análisis)
            await this.analyzePose();
            
            // Guardar en historial optimizado (solo últimos 20)
            this.saveAnalysisToHistory();
            
        } catch (error) {
            console.error('Error en análisis de frame:', error);
        }
    }

    async analyzeObjects() {
        try {
            const predictions = await this.detectionModel.detect(this.canvas);
            
            let people = [];
            let animals = 0;
            let objects = [];
            let babyDetected = false;
            let coveringObjects = [];
            
            // Analizar todas las detecciones
            predictions.forEach(prediction => {
                if (prediction.score > this.config.confidenceThreshold) {
                    objects.push(prediction);
                    
                    if (prediction.class === 'person') {
                        people.push({
                            bbox: prediction.bbox,
                            confidence: prediction.score,
                            area: this.calculateArea(prediction.bbox),
                            class: 'person'
                        });
                        
                        // Detectar si es un bebé
                        const babyAnalysis = this.analyzeBabyState(prediction.bbox);
                        if (babyAnalysis.isBaby) {
                            babyDetected = true;
                            this.analyzebabyActivity(babyAnalysis, prediction.bbox);
                        }
                    } 
                    // Detectar objetos que pueden cubrir al bebé
                    else if (['blanket', 'pillow', 'towel', 'cloth'].includes(prediction.class) || 
                             prediction.class.includes('bed') || prediction.class.includes('couch')) {
                        coveringObjects.push(prediction);
                    }
                    // Animales
                    else if (['cat', 'dog', 'bird', 'horse', 'sheep', 'cow', 'bear'].includes(prediction.class)) {
                        animals++;
                        this.triggerAlert('animal_detection', {
                            severity: 'critical',
                            message: `🐾 ¡${prediction.class} cerca del bebé! Riesgo para la seguridad`,
                            confidence: prediction.score,
                            area: this.calculateArea(prediction.bbox),
                            details: { animalType: prediction.class, location: this.getLocationInImage(prediction.bbox) }
                        });
                    }
                    // Objetos peligrosos
                    else if (['knife', 'scissors', 'fork', 'bottle', 'cup', 'wine glass'].includes(prediction.class)) {
                        this.triggerAlert('dangerous_object', {
                            severity: 'high',
                            message: `⚠️ Objeto peligroso detectado: ${prediction.class}`,
                            confidence: prediction.score,
                            details: { objectType: prediction.class, location: this.getLocationInImage(prediction.bbox) }
                        });
                    }
                }
            });
            
            // Análisis de cobertura del bebé
            if (babyDetected && coveringObjects.length > 0) {
                this.analyzeCoveringRisk(people.find(p => this.analyzeBabyState(p.bbox).isBaby), coveringObjects);
            }
            
            // Análisis de proximidad entre personas
            if (people.length > 1) {
                const proximityAnalysis = this.analyzeProximity(people);
                
                if (proximityAnalysis.hasCloseContact) {
                    this.triggerAlert('close_contact', {
                        severity: 'critical',
                        message: '😱 ¡ALERTA! Contacto muy cercano - Posible mano/objeto sobre el bebé',
                        confidence: 0.9,
                        distance: proximityAnalysis.minDistance,
                        details: { contactType: 'physical_proximity', risk: 'high' }
                    });
                }
                
                if (people.length > 2) {
                    this.triggerAlert('multiple_people', {
                        severity: 'medium',
                        message: `👥 Múltiples personas (${people.length}) en la habitación del bebé`,
                        confidence: 0.8,
                        count: people.length,
                        details: { crowdLevel: people.length > 3 ? 'high' : 'medium' }
                    });
                }
            }
            
            // Alerta si no detectamos bebé por mucho tiempo (reducido para mayor sensibilidad)
            if (!babyDetected && this.analysisCount > 3) {
                this.triggerAlert('baby_not_visible', {
                    severity: 'high',
                    message: '🔍 ¡Bebé no visible! Verificar posición de la cámara o ubicación',
                    confidence: 0.7,
                    details: { reason: 'not_detected', duration: this.analysisCount }
                });
            }
            
            return { people: people.length, animals, objects, babyDetected, coveringObjects: coveringObjects.length };
            
        } catch (error) {
            console.error('Error en detección de objetos:', error);
            return { people: 0, animals: 0, objects: [], babyDetected: false, coveringObjects: 0 };
        }
    }

    async analyzePose() {
        try {
            // Análisis de movimiento más sensible
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const currentPosition = this.extractDetailedMovement(imageData);
            
            if (this.lastBabyPosition && currentPosition) {
                const movement = this.calculateMovement(this.lastBabyPosition, currentPosition);
                
                console.log('🎯 Movimiento detectado:', movement.toFixed(3));
                
                if (movement > this.config.movementThreshold) {
                    this.lastMovementTime = Date.now();
                    
                    if (movement > 0.2) { // Movimiento significativo
                        this.triggerAlert('baby_movement', {
                            severity: 'medium',
                            message: '🔄 Bebé en movimiento - actividad detectada',
                            confidence: Math.min(0.9, movement * 2),
                            movement: movement
                        });
                    }
                    
                    if (movement > 0.4) { // Movimiento muy activo
                        this.triggerAlert('excessive_movement', {
                            severity: 'high',
                            message: '🏃‍♂️ ¡Bebé muy activo! Movimiento intenso detectado',
                            confidence: 0.8,
                            movement: movement
                        });
                    }
                } else {
                    // Bebé muy quieto por mucho tiempo
                    const timeSinceMovement = Date.now() - this.lastMovementTime;
                    if (timeSinceMovement > 180000) { // 3 minutos sin movimiento
                        this.triggerAlert('no_movement', {
                            severity: 'high',
                            message: '😴 Bebé sin movimiento por tiempo prolongado',
                            confidence: 0.7,
                            timeWithoutMovement: Math.floor(timeSinceMovement / 60000) // en minutos
                        });
                    }
                }
                
                // Detectar cambios bruscos en posición
                const positionChange = this.calculatePositionChange(this.lastBabyPosition, currentPosition);
                if (positionChange > 0.3) {
                    this.triggerAlert('position_change', {
                        severity: 'medium',
                        message: '🔄 Cambio de posición del bebé detectado',
                        confidence: 0.6,
                        change: positionChange
                    });
                }
            }
            
            this.lastBabyPosition = currentPosition;
            return currentPosition;
            
        } catch (error) {
            console.error('Error en análisis de pose:', error);
            return null;
        }
    }

    extractDetailedMovement(imageData) {
        // Análisis más detallado de movimiento por regiones
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // Dividir imagen en regiones para mejor análisis
        const regions = {
            center: { x: width * 0.3, y: height * 0.3, w: width * 0.4, h: height * 0.4 },
            top: { x: width * 0.2, y: height * 0.1, w: width * 0.6, h: height * 0.3 },
            bottom: { x: width * 0.2, y: height * 0.6, w: width * 0.6, h: height * 0.3 }
        };
        
        const regionData = {};
        
        Object.keys(regions).forEach(regionName => {
            const region = regions[regionName];
            let totalMovement = 0;
            let pixelCount = 0;
            let centerX = 0;
            let centerY = 0;
            
            for (let y = region.y; y < region.y + region.h && y < height; y += 3) {
                for (let x = region.x; x < region.x + region.w && x < width; x += 3) {
                    const i = (y * width + x) * 4;
                    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    
                    if (brightness > 80) { // Detectar áreas con contenido
                        totalMovement += brightness;
                        centerX += x * brightness;
                        centerY += y * brightness;
                        pixelCount++;
                    }
                }
            }
            
            regionData[regionName] = pixelCount > 0 ? {
                centerX: centerX / totalMovement,
                centerY: centerY / totalMovement,
                intensity: totalMovement / pixelCount,
                pixelCount: pixelCount
            } : null;
        });
        
        return regionData;
    }
    
    calculatePositionChange(pos1, pos2) {
        if (!pos1 || !pos2 || !pos1.center || !pos2.center) return 0;
        
        const dx = (pos1.center.centerX || 0) - (pos2.center.centerX || 0);
        const dy = (pos1.center.centerY || 0) - (pos2.center.centerY || 0);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Normalizar por tamaño de imagen
        return distance / Math.sqrt(this.canvas.width * this.canvas.width + this.canvas.height * this.canvas.height);
    }

    calculateMovement(pos1, pos2) {
        if (!pos1 || !pos2) return 0;
        
        // Calcular movimiento en múltiples regiones
        let totalMovement = 0;
        let regionCount = 0;
        
        ['center', 'top', 'bottom'].forEach(region => {
            if (pos1[region] && pos2[region]) {
                const dx = (pos1[region].centerX || 0) - (pos2[region].centerX || 0);
                const dy = (pos1[region].centerY || 0) - (pos2[region].centerY || 0);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Normalizar por tamaño de imagen
                const normalizedDistance = distance / Math.sqrt(
                    this.canvas.width * this.canvas.width + 
                    this.canvas.height * this.canvas.height
                );
                
                totalMovement += normalizedDistance;
                regionCount++;
            }
        });
        
        return regionCount > 0 ? totalMovement / regionCount : 0;
    }

    analyzeBabyState(bbox) {
        const [x, y, width, height] = bbox;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const area = width * height;
        
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        
        // Detección más sensible y automática del bebé
        const isInBabyArea = (
            centerX > imageWidth * 0.15 && centerX < imageWidth * 0.85 &&
            centerY > imageHeight * 0.2 && centerY < imageHeight * 0.95
        );
        
        // Criterios más amplios para detectar bebés
        const isAppropriateSize = (
            width < imageWidth * 0.75 && height < imageHeight * 0.8 &&
            area > (imageWidth * imageHeight * 0.02) // Mínimo 2% del área total
        );
        
        // Detectar automáticamente como bebé si cumple criterios básicos
        const isBaby = isInBabyArea && isAppropriateSize;
        
        if (isBaby) {
            // Actualizar tiempo de última detección del bebé
            this.lastBabyDetectionTime = Date.now();
            
            // Analizar postura del bebé basado en proporciones
            const aspectRatio = width / height;
            let posture = 'unknown';
            let activity = 'resting';
            
            if (aspectRatio > 1.2) {
                posture = 'lying_horizontal';
                activity = 'sleeping_or_resting';
            } else if (aspectRatio < 0.6) {
                posture = 'standing_or_sitting';
                activity = height > imageHeight * 0.4 ? 'standing' : 'sitting';
            } else {
                posture = 'sitting_or_crawling';
                activity = 'active';
            }
            
            // Determinar posición en la imagen
            let position = 'center';
            if (centerX < imageWidth * 0.33) position = 'left';
            else if (centerX > imageWidth * 0.67) position = 'right';
            
            if (centerY < imageHeight * 0.33) position += '_top';
            else if (centerY > imageHeight * 0.67) position += '_bottom';
            
            return {
                isBaby: true,
                posture,
                activity,
                position,
                area,
                aspectRatio,
                location: { x: centerX, y: centerY }
            };
        }
        
        return { isBaby: false };
    }
    
    analyzebabyActivity(babyState, bbox) {
        // Análisis detallado de la actividad del bebé
        const currentTime = Date.now();
        
        // Detectar diferentes estados y actividades
        switch (babyState.activity) {
            case 'standing':
                this.triggerAlert('baby_standing', {
                    severity: 'medium',
                    message: '🧑 ¡Bebé de pie! Vigilar para prevenir caídas',
                    confidence: 0.8,
                    details: { 
                        posture: babyState.posture, 
                        location: babyState.position,
                        risk: 'fall_risk'
                    }
                });
                break;
                
            case 'sitting':
                this.triggerAlert('baby_sitting', {
                    severity: 'low',
                    message: '🧘 Bebé sentado - posición estable',
                    confidence: 0.7,
                    details: { posture: babyState.posture, location: babyState.position }
                });
                break;
                
            case 'active':
                if (babyState.aspectRatio > 0.8 && babyState.aspectRatio < 1.1) {
                    this.triggerAlert('baby_crawling', {
                        severity: 'medium', 
                        message: '👶 Bebé gateando - monitoreando movimiento',
                        confidence: 0.7,
                        details: { 
                            activity: 'crawling', 
                            direction: this.detectMovementDirection(),
                            location: babyState.position
                        }
                    });
                }
                break;
                
            case 'sleeping_or_resting':
                // Verificar si ha estado durmiendo por mucho tiempo
                if (this.lastActivityTime && (currentTime - this.lastActivityTime > 1800000)) { // 30 min
                    this.triggerAlert('long_sleep', {
                        severity: 'medium',
                        message: '😴 Bebé durmiendo por tiempo prolongado - verificar estado',
                        confidence: 0.6,
                        details: { sleepDuration: Math.floor((currentTime - this.lastActivityTime) / 60000) }
                    });
                }
                break;
        }
        
        // Detectar si el bebé se acerca a los bordes (riesgo de caída)
        if (this.isNearEdge(babyState.location)) {
            this.triggerAlert('edge_risk', {
                severity: 'high',
                message: '⚠️ ¡PELIGRO! Bebé cerca del borde - riesgo de caída',
                confidence: 0.8,
                details: { 
                    location: babyState.position,
                    risk: 'fall_danger',
                    urgency: 'high'
                }
            });
        }
        
        this.lastBabyState = babyState;
        this.lastActivityTime = currentTime;
    }
    
    analyzeCoveringRisk(baby, coveringObjects) {
        if (!baby) return;
        
        coveringObjects.forEach(coverObj => {
            const distance = this.calculateDistance(baby.bbox, coverObj.bbox);
            const overlap = this.calculateOverlap(baby.bbox, coverObj.bbox);
            
            if (overlap > 0.3) { // 30% de superposición
                this.triggerAlert('covering_risk', {
                    severity: 'critical',
                    message: '🚨 ¡PELIGRO DE ASFIXIA! Bebé cubierto por objeto - verificar respiración',
                    confidence: 0.9,
                    details: {
                        coveringObject: coverObj.class,
                        overlapPercentage: Math.round(overlap * 100),
                        risk: 'suffocation',
                        urgency: 'immediate'
                    }
                });
            } else if (overlap > 0.1) {
                this.triggerAlert('partial_covering', {
                    severity: 'high',
                    message: `⚠️ Bebé parcialmente cubierto por ${coverObj.class} - vigilar de cerca`,
                    confidence: 0.7,
                    details: {
                        coveringObject: coverObj.class,
                        overlapPercentage: Math.round(overlap * 100),
                        risk: 'potential_suffocation'
                    }
                });
            }
        });
    }
    
    isNearEdge(location) {
        const edgeThreshold = 0.1; // 10% del borde
        const { x, y } = location;
        
        return (
            x < this.canvas.width * edgeThreshold ||
            x > this.canvas.width * (1 - edgeThreshold) ||
            y < this.canvas.height * edgeThreshold ||
            y > this.canvas.height * (1 - edgeThreshold)
        );
    }
    
    detectMovementDirection() {
        if (!this.lastBabyState || !this.lastBabyState.location) return 'unknown';
        
        const currentPos = this.lastBabyPosition;
        const lastPos = this.lastBabyState.location;
        
        if (!currentPos || !lastPos) return 'unknown';
        
        const dx = (currentPos.center?.centerX || 0) - lastPos.x;
        const dy = (currentPos.center?.centerY || 0) - lastPos.y;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'right' : 'left';
        } else {
            return dy > 0 ? 'down' : 'up';
        }
    }
    
    calculateOverlap(bbox1, bbox2) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;
        
        const overlapX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
        const overlapY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
        const overlapArea = overlapX * overlapY;
        
        const area1 = w1 * h1;
        const area2 = w2 * h2;
        const unionArea = area1 + area2 - overlapArea;
        
        return unionArea > 0 ? overlapArea / Math.min(area1, area2) : 0;
    }
    
    getLocationInImage(bbox) {
        const [x, y, width, height] = bbox;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        
        let location = '';
        
        // Determinar posición horizontal
        if (centerX < imageWidth * 0.33) location += 'izquierda';
        else if (centerX > imageWidth * 0.67) location += 'derecha';
        else location += 'centro';
        
        // Determinar posición vertical
        if (centerY < imageHeight * 0.33) location += '_superior';
        else if (centerY > imageHeight * 0.67) location += '_inferior';
        else location += '_medio';
        
        return location;
    }

    analyzeProximity(people) {
        let minDistance = Infinity;
        let hasCloseContact = false;
        
        // Buscar al bebé usando el nuevo sistema de análisis
        const baby = people.find(person => this.analyzeBabyState(person.bbox).isBaby) || 
                     people.reduce((smallest, current) => 
                         current.area < smallest.area ? current : smallest);
        
        if (!baby) return { hasCloseContact: false, minDistance: Infinity };
        
        // Calcular distancias entre el bebé y otras personas
        people.forEach(person => {
            if (person !== baby) {
                const distance = this.calculateDistance(baby.bbox, person.bbox);
                minDistance = Math.min(minDistance, distance);
                
                // Si la distancia es muy pequeña, es contacto cercano
                if (distance < 40) { // Más sensible: 40 pixels
                    hasCloseContact = true;
                }
            }
        });
        
        return { hasCloseContact, minDistance };
    }

    calculateDistance(bbox1, bbox2) {
        const center1 = {
            x: bbox1[0] + bbox1[2] / 2,
            y: bbox1[1] + bbox1[3] / 2
        };
        const center2 = {
            x: bbox2[0] + bbox2[2] / 2,
            y: bbox2[1] + bbox2[3] / 2
        };
        
        return Math.sqrt(
            Math.pow(center1.x - center2.x, 2) + 
            Math.pow(center1.y - center2.y, 2)
        );
    }

    calculateArea(bbox) {
        return bbox[2] * bbox[3]; // width * height
    }

    triggerAlert(type, data) {
        const cooldownKey = `${type}_${data.severity}`;
        const now = Date.now();
        
        // Cooldown para evitar spam
        if (this.alertCooldown.has(cooldownKey)) {
            const lastAlert = this.alertCooldown.get(cooldownKey);
            if (now - lastAlert < 15000) return; // 15 segundos de cooldown
        }
        
        this.alertCooldown.set(cooldownKey, now);
        
        if (this.alertCallback) {
            this.alertCallback(type, data);
        }
        
        // Auto-limpiar cooldown
        setTimeout(() => {
            this.alertCooldown.delete(cooldownKey);
        }, 30000);
    }

    saveAnalysisToHistory() {
        // Mantener solo los últimos 20 análisis para optimizar memoria
        if (this.detectionHistory.length >= 20) {
            this.detectionHistory.shift();
        }
        
        this.detectionHistory.push({
            timestamp: Date.now(),
            analysisCount: this.analysisCount
        });
    }

    getStats() {
        return {
            isMonitoring: this.isMonitoring,
            isInitialized: this.isInitialized,
            totalAnalyses: this.analysisCount,
            memoryOptimized: true,
            version: '2.0_MediaPipe'
        };
    }
}

// Exportar la clase globalmente  
window.BabyAIMonitorV2 = BabyAIMonitorV2;

// Instancia global optimizada
window.babyAIMonitor = new BabyAIMonitorV2();
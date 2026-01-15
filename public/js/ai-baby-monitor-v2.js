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
        
        // Configuración optimizada para detección inteligente enfocada en la cara
        this.config = {
            detectionInterval: 1200, // Reducir frecuencia para evitar falsas alarmas
            confidenceThreshold: 0.5, // Más conservador para evitar falsos positivos
            dangerZoneRadius: 0.25, // Zona de peligro más amplia
            movementThreshold: 0.08, // Menos sensible al movimiento normal
            coverageThreshold: 0.7, // Umbral más alto para cobertura preocupante
            babyDetectionSensitivity: 0.6, // Más conservador para detectar bebés
            faceAreaThreshold: 0.15, // Nueva: área mínima visible de la cara
            noFaceAlertDelay: 20000, // Solo alertar después de 20 segundos sin cara
            continuousMonitoring: true,
            alertCooldownTime: 8000 // Más tiempo entre alertas para evitar spam
        };
        
        // Almacenar estadísticas y historial
        this.analysisCount = 0;
        this.lastAnalysisTime = null;
        this.detectionHistory = [];
        
        // Estado de seguimiento
        this.lastBabyPosition = null;
        this.lastMovementTime = Date.now();
        this.alertCooldown = new Map();
        
        // Nuevo: seguimiento específico de cara y cuerpo
        this.faceDetectionHistory = [];
        this.lastFaceDetectionTime = Date.now();
        this.lastBodyDetectionTime = Date.now();
        this.currentAlert = null; // Para mostrar solo una alerta a la vez
        
        // Sistema de perfil personalizado del bebé
        this.babyProfile = null;
        this.recognitionMode = 'generic'; // 'generic' o 'personalized'
        
        console.log('🤖 Sistema de IA V2 con Google MediaPipe inicializado');
    }
    
    /**
     * Establecer perfil personalizado del bebé
     */
    setBabyProfile(profile) {
        this.babyProfile = profile;
        this.recognitionMode = profile ? 'personalized' : 'generic';
        
        if (profile) {
            console.log('👶 Perfil personalizado del bebé cargado:', profile.id);
            console.log(`📊 Aprendido: ${profile.learnedAt}, Muestras: ${profile.sampleCount}`);
        } else {
            console.log('🔄 Modo genérico de detección activado');
        }
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
        const timeSinceLastFace = now - this.lastFaceDetectionTime;
        const timeSinceLastBody = now - this.lastBodyDetectionTime;
        
        // Solo alertar si NO se detecta la cara por más del tiempo configurado
        // Si el cuerpo se detecta, el bebé está presente (puede estar con cobija)
        if (timeSinceLastFace > this.config.noFaceAlertDelay) {
            // Si tampoco se detecta el cuerpo, es más preocupante
            if (timeSinceLastBody > 10000) {
                this.sendAlert('no_baby_detected', {
                    message: '👶 Bebé no visible en el campo de visión',
                    severity: 'HIGH',
                    confidence: 0.8,
                    details: {
                        lastFaceDetection: Math.round(timeSinceLastFace / 1000),
                        lastBodyDetection: Math.round(timeSinceLastBody / 1000),
                        reason: 'complete_absence'
                    }
                });
                // Resetear para evitar spam
                this.lastFaceDetectionTime = now - 15000;
            } else {
                // Solo la cara no es visible, pero el cuerpo sí (probablemente dormido con cobija)
                this.sendAlert('face_not_visible', {
                    message: '😴 Carita del bebé no visible - verificar que puede respirar bien',
                    severity: 'MEDIUM',
                    confidence: 0.7,
                    details: {
                        lastFaceDetection: Math.round(timeSinceLastFace / 1000),
                        bodyStillVisible: true,
                        reason: 'face_obscured'
                    }
                });
                // Resetear con menos tiempo ya que es menos crítico
                this.lastFaceDetectionTime = now - 12000;
            }
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
                        
                        // Detectar si es un bebé y analizar cara vs cuerpo
                        const babyAnalysis = this.analyzeBabyState(prediction.bbox);
                        if (babyAnalysis.isBaby) {
                            babyDetected = true;
                            
                            // Actualizar tiempos de detección
                            this.lastBodyDetectionTime = Date.now();
                            
                            // Detectar si la cara es visible
                            if (this.isFaceVisible(prediction.bbox, babyAnalysis)) {
                                this.lastFaceDetectionTime = Date.now();
                            }
                            
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
                
                if (proximityAnalysis.hasCloseContact && proximityAnalysis.minDistance < 0.1) {
                    this.triggerAlert('very_close_contact', {
                        severity: 'high',  // Reducido de crítico
                        message: '⚠️ Persona muy cerca del bebé - verificar situación',
                        confidence: 0.8,
                        distance: proximityAnalysis.minDistance,
                        details: { contactType: 'close_proximity', risk: 'medium' }
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
            
            // Solo actualizar tiempo de detección si detectamos el bebé
            if (babyDetected) {
                this.lastBabyDetectionTime = Date.now();
            }
            // La verificación de ausencia se hace en checkContinuousBabyPresence() de forma menos agresiva
            
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
        const aspectRatio = width / height;
        
        const imageWidth = this.canvas.width;
        const imageHeight = this.canvas.height;
        const relativeSize = area / (imageWidth * imageHeight);
        
        let isBaby = false;
        let confidence = 0;
        
        if (this.recognitionMode === 'personalized' && this.babyProfile) {
            // === MODO PERSONALIZADO - Usar perfil específico del bebé ===
            isBaby = this.matchesBabyProfile(bbox, aspectRatio, relativeSize, centerX, centerY);
            confidence = this.calculateProfileMatchConfidence(bbox, aspectRatio, relativeSize);
        } else {
            // === MODO GENÉRICO - Detección general ===
            const isInBabyArea = (
                centerX > imageWidth * 0.1 && centerX < imageWidth * 0.9 &&
                centerY > imageHeight * 0.15 && centerY < imageHeight * 0.95
            );
            
            const isAppropriateSize = (
                width < imageWidth * 0.8 && height < imageHeight * 0.85 &&
                area > (imageWidth * imageHeight * 0.015) // Mínimo 1.5% del área total
            );
            
            isBaby = isInBabyArea && isAppropriateSize;
            confidence = isBaby ? 0.7 : 0.3;
        }
        
        if (isBaby) {
            // Actualizar tiempo de última detección del bebé
            this.lastBabyDetectionTime = Date.now();
            
            // === ANÁLISIS INTELIGENTE DE POSTURA PARA BEBÉ ===
            let posture = 'unknown';
            let activity = 'resting';
            let ageCategory = this.determineAgeCategory(relativeSize, aspectRatio);
            
            // Análisis específico por edad y postura
            if (ageCategory === 'newborn') {
                // RECIÉN NACIDO - principalmente acostado
                if (aspectRatio > 1.1) {
                    posture = 'lying_horizontal';
                    activity = 'sleeping_or_resting';
                } else if (aspectRatio > 0.8) {
                    posture = 'lying_curled';
                    activity = 'sleeping_or_resting';
                } else {
                    // Un recién nacido NO debería estar "de pie"
                    posture = 'held_vertical'; // Probablemente cargado
                    activity = 'being_fed_or_held';
                }
            } else if (ageCategory === 'infant') {
                // BEBÉ MAYOR - puede sentarse y moverse más
                if (aspectRatio > 1.3) {
                    posture = 'lying_horizontal';
                    activity = 'sleeping_or_resting';
                } else if (aspectRatio < 0.6) {
                    posture = 'sitting_or_supported';
                    activity = 'sitting_alert';
                } else if (aspectRatio < 0.8) {
                    posture = 'crawling_or_moving';
                    activity = 'active';
                } else {
                    posture = 'lying_or_resting';
                    activity = 'resting';
                }
            } else {
                // BEBÉ ACTIVO - puede estar de pie, gateando, etc.
                if (aspectRatio > 1.2) {
                    posture = 'lying_horizontal';
                    activity = 'sleeping_or_resting';
                } else if (aspectRatio < 0.6) {
                    posture = 'standing_or_walking';
                    activity = height > imageHeight * 0.5 ? 'standing' : 'sitting';
                } else {
                    posture = 'crawling_or_playing';
                    activity = 'active';
                }
            }
            
            // Determinar posición en la imagen
            let position = 'center';
            if (centerX < imageWidth * 0.33) position = 'left';
            else if (centerX > imageWidth * 0.67) position = 'right';
            
            if (centerY < imageHeight * 0.33) position += '_top';
            else if (centerY > imageHeight * 0.67) position += '_bottom';
            
            return {
                isBaby: true,
                confidence: confidence,
                posture,
                activity,
                position,
                area,
                aspectRatio,
                ageCategory,
                relativeSize,
                location: { x: centerX, y: centerY },
                
                // Información adicional para contexto
                feedingContext: this.detectFeedingContext(bbox),
                sleepingContext: this.detectSleepingContext(posture, activity),
                safetyContext: this.detectSafetyContext(position, posture)
            };
        }
        
        return { isBaby: false, confidence: 0 };
    }
    
    /**
     * Verificar si la detección coincide con el perfil personalizado del bebé
     */
    matchesBabyProfile(bbox, aspectRatio, relativeSize, centerX, centerY) {
        if (!this.babyProfile) return false;
        
        const profile = this.babyProfile;
        const tolerances = profile.tolerances;
        
        // Verificar tamaño relativo
        const sizeMatch = Math.abs(relativeSize - profile.avgRelativeSize) <= 
                         (profile.avgRelativeSize * tolerances.sizeVariation);
        
        // Verificar proporción (más flexible para diferentes posturas)
        const aspectRatioMatch = Math.abs(aspectRatio - profile.avgAspectRatio) <= 
                                (profile.avgAspectRatio * tolerances.aspectRatioVariation);
        
        // Verificar posición típica (zona preferida)
        const normalizedX = centerX / this.canvas.width;
        const normalizedY = centerY / this.canvas.height;
        
        const positionMatchX = Math.abs(normalizedX - profile.preferredZone.horizontal) <= tolerances.positionVariation;
        const positionMatchY = Math.abs(normalizedY - profile.preferredZone.vertical) <= tolerances.positionVariation;
        
        // El bebé debe coincidir en al menos 2 de 3 criterios principales
        const matchCount = (sizeMatch ? 1 : 0) + (aspectRatioMatch ? 1 : 0) + 
                          ((positionMatchX && positionMatchY) ? 1 : 0);
        
        return matchCount >= 2;
    }
    
    /**
     * Calcular confianza de coincidencia con el perfil
     */
    calculateProfileMatchConfidence(bbox, aspectRatio, relativeSize) {
        if (!this.babyProfile) return 0.5;
        
        const profile = this.babyProfile;
        const [x, y, width, height] = bbox;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        
        // Calcular similitud en diferentes aspectos
        const sizeSimilarity = 1 - Math.min(1, Math.abs(relativeSize - profile.avgRelativeSize) / profile.avgRelativeSize);
        const aspectSimilarity = 1 - Math.min(1, Math.abs(aspectRatio - profile.avgAspectRatio) / profile.avgAspectRatio);
        
        const normalizedX = centerX / this.canvas.width;
        const normalizedY = centerY / this.canvas.height;
        const positionSimilarityX = 1 - Math.min(1, Math.abs(normalizedX - profile.preferredZone.horizontal));
        const positionSimilarityY = 1 - Math.min(1, Math.abs(normalizedY - profile.preferredZone.vertical));
        const positionSimilarity = (positionSimilarityX + positionSimilarityY) / 2;
        
        // Promedio ponderado de las similitudes
        const confidence = (sizeSimilarity * 0.4 + aspectSimilarity * 0.35 + positionSimilarity * 0.25);
        
        return Math.max(0.6, Math.min(0.95, confidence)); // Entre 60% y 95%
    }
    
    /**
     * Determinar categoría de edad basada en tamaño y proporciones
     */
    determineAgeCategory(relativeSize, aspectRatio) {
        // Bebé muy pequeño en la imagen = recién nacido
        if (relativeSize < 0.05) return 'newborn';
        
        // Bebé mediano con proporciones típicas de bebé que no camina
        if (relativeSize < 0.15 && aspectRatio > 0.7) return 'infant';
        
        // Bebé más grande o activo
        return 'active_baby';
    }
    
    /**
     * Detectar contexto de alimentación
     */
    detectFeedingContext(bbox) {
        // Analizar si el bebé podría estar siendo alimentado
        const aspectRatio = bbox[2] / bbox[3];
        const position = bbox[1] / this.canvas.height;
        
        // Bebé en posición vertical en la parte superior podría estar siendo alimentado
        const isPossiblyFeeding = aspectRatio < 0.8 && position < 0.4;
        
        return {
            possiblyFeeding: isPossiblyFeeding,
            context: isPossiblyFeeding ? 'vertical_position_suggests_feeding' : 'normal_position'
        };
    }
    
    /**
     * Detectar contexto de sueño
     */
    detectSleepingContext(posture, activity) {
        const isSleeping = activity === 'sleeping_or_resting' && 
                          (posture.includes('lying') || posture.includes('curled'));
        
        return {
            isSleeping: isSleeping,
            sleepPosition: isSleeping ? posture : null
        };
    }
    
    /**
     * Detectar contexto de seguridad
     */
    detectSafetyContext(position, posture) {
        const isNearEdge = position.includes('left') || position.includes('right') || 
                          position.includes('top') || position.includes('bottom');
        
        const isInPotentiallyUnsafePosition = posture === 'standing_or_walking' && isNearEdge;
        
        return {
            nearEdge: isNearEdge,
            potentiallyUnsafe: isInPotentiallyUnsafePosition,
            recommendation: isInPotentiallyUnsafePosition ? 'monitor_closely' : 'normal_monitoring'
        };
    }
    
    isFaceVisible(bbox, babyAnalysis) {
        // Analizar la zona superior del bounding box del bebé para detectar cara
        const [x, y, width, height] = bbox;
        
        // La cara típicamente está en el tercio superior del bounding box
        const faceRegion = {
            x: x + width * 0.1,  // 10% de margen a los lados
            y: y,                 // Parte superior
            width: width * 0.8,   // 80% del ancho
            height: height * 0.35 // Tercio superior (35% de la altura)
        };
        
        // Extraer región de la cara del canvas
        try {
            const faceImageData = this.ctx.getImageData(
                faceRegion.x, faceRegion.y, 
                faceRegion.width, faceRegion.height
            );
            
            const data = faceImageData.data;
            let visiblePixels = 0;
            let totalPixels = 0;
            let skinTonePixels = 0;
            
            // Analizar píxeles para detectar características faciales
            for (let i = 0; i < data.length; i += 16) { // Muestrear cada 4to píxel para velocidad
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const alpha = data[i + 3];
                
                if (alpha > 200) { // Píxel visible
                    totalPixels++;
                    
                    // Detectar tonos de piel (rangos aproximados)
                    if ((r > 80 && r < 255) && (g > 50 && g < 220) && (b > 30 && b < 180)) {
                        if ((r > g) && (g > b) || (r > 150 && g > 100)) {
                            skinTonePixels++;
                            visiblePixels++;
                        }
                    }
                    // También contar píxeles de cabello (colores oscuros)
                    else if (r < 100 && g < 100 && b < 100 && (r + g + b) > 60) {
                        visiblePixels++;
                    }
                }
            }
            
            const faceVisibilityRatio = totalPixels > 0 ? visiblePixels / totalPixels : 0;
            const skinRatio = totalPixels > 0 ? skinTonePixels / totalPixels : 0;
            
            // Considerar cara visible si hay suficiente contenido facial visible
            const isFaceVisible = faceVisibilityRatio > this.config.faceAreaThreshold || 
                                 skinRatio > 0.08; // Al menos 8% de píxeles de tono de piel
            
            return isFaceVisible;
            
        } catch (error) {
            console.warn('Error analizando visibilidad de cara:', error);
            // En caso de error, asumir que la cara es visible para evitar falsas alarmas
            return true;
        }
    }
    
    analyzebabyActivity(babyState, bbox) {
        // === ANÁLISIS INTELIGENTE DE ACTIVIDAD DEL BEBÉ ===
        const currentTime = Date.now();
        const ageCategory = babyState.ageCategory || 'infant';
        
        // === CONTEXTO INTELIGENTE ===
        // No alertar si el bebé está siendo alimentado
        if (babyState.feedingContext && babyState.feedingContext.possiblyFeeding) {
            this.lastActiveTime = currentTime; // Resetear timers
            this.lastStandingTime = null;
            return; // Actividad normal de alimentación
        }
        
        // No alertar excesivamente si está durmiendo en posición segura
        if (babyState.sleepingContext && babyState.sleepingContext.isSleeping) {
            if (babyState.sleepingContext.sleepPosition === 'lying_horizontal') {
                // Posición de sueño segura, solo verificar tiempo excesivo
                this.checkExcessiveSleep(currentTime);
                return;
            }
        }
        
        // === ANÁLISIS POR EDAD Y ACTIVIDAD ===
        switch (ageCategory) {
            case 'newborn':
                this.analyzeNewbornActivity(babyState, currentTime);
                break;
            case 'infant':
                this.analyzeInfantActivity(babyState, currentTime);
                break;
            case 'active_baby':
                this.analyzeActiveBabyActivity(babyState, currentTime);
                break;
        }
        
        // === VERIFICACIONES DE SEGURIDAD UNIVERSALES ===
        if (babyState.safetyContext && babyState.safetyContext.potentiallyUnsafe) {
            this.triggerAlert('safety_concern', {
                severity: 'high',
                message: '⚠️ Bebé en posición potencialmente insegura - verificar',
                confidence: 0.8,
                details: { 
                    position: babyState.position,
                    posture: babyState.posture,
                    risk: 'position_safety'
                }
            });
        }
        
        this.lastBabyState = babyState;
        this.lastActivityTime = currentTime;
    }
    
    /**
     * Análisis específico para recién nacidos
     */
    analyzeNewbornActivity(babyState, currentTime) {
        switch (babyState.activity) {
            case 'standing':
            case 'standing_or_walking':
                // ¡UN RECIÉN NACIDO NO DEBERÍA ESTAR DE PIE!
                this.triggerAlert('newborn_unexpected_position', {
                    severity: 'high',
                    message: '🚨 Posición inusual para recién nacido - verificar si está siendo cargado',
                    confidence: 0.9,
                    details: { 
                        ageCategory: 'newborn',
                        expectedPosition: 'lying_down',
                        actualPosition: babyState.posture,
                        suggestion: 'verify_being_held_or_fed'
                    }
                });
                break;
                
            case 'being_fed_or_held':
                // Posición normal para alimentación
                this.lastActiveTime = currentTime;
                break;
                
            case 'sleeping_or_resting':
                // Normal para recién nacidos
                this.checkExcessiveSleep(currentTime);
                break;
        }
    }
    
    /**
     * Análisis específico para bebés (3-12 meses)
     */
    analyzeInfantActivity(babyState, currentTime) {
        switch (babyState.activity) {
            case 'sitting_alert':
                // Normal para bebés que ya se sientan
                this.lastActiveTime = currentTime;
                this.lastStandingTime = null;
                break;
                
            case 'active':
                // Movimiento normal, solo alertar si es excesivo o cerca de bordes
                if (this.isNearEdge(babyState.location)) {
                    this.triggerAlert('baby_near_edge', {
                        severity: 'medium',
                        message: '👶 Bebé activo cerca del borde - supervisar de cerca',
                        confidence: 0.7,
                        details: { 
                            position: babyState.position,
                            activity: babyState.activity
                        }
                    });
                }
                this.lastActiveTime = currentTime;
                break;
                
            case 'sleeping_or_resting':
                this.checkExcessiveSleep(currentTime);
                break;
        }
    }
    
    /**
     * Análisis específico para bebés activos (12+ meses)
     */
    analyzeActiveBabyActivity(babyState, currentTime) {
        switch (babyState.activity) {
            case 'standing':
                // Para bebés activos, estar de pie es más normal
                // Solo alertar si está mucho tiempo en posición riesgosa
                if (!this.lastStandingTime) this.lastStandingTime = currentTime;
                if (currentTime - this.lastStandingTime > 60000 && this.isNearEdge(babyState.location)) { // 1 minuto
                    this.triggerAlert('active_baby_edge_risk', {
                        severity: 'medium',
                        message: '⚠️ Bebé de pie cerca del borde por mucho tiempo',
                        confidence: 0.8,
                        details: { 
                            standingDuration: Math.round((currentTime - this.lastStandingTime) / 1000),
                            risk: 'fall_risk'
                        }
                    });
                }
                break;
                
            case 'active':
                // Movimiento normal para bebés activos
                if (this.isNearEdge(babyState.location)) {
                    // Solo alertar ocasionalmente para bebés muy activos cerca de bordes
                    if (!this.lastEdgeWarning || currentTime - this.lastEdgeWarning > 60000) {
                        this.triggerAlert('active_baby_edge_activity', {
                            severity: 'low',
                            message: '👶 Bebé muy activo cerca del borde',
                            confidence: 0.6,
                            details: { 
                                activity: 'active_near_edge'
                            }
                        });
                        this.lastEdgeWarning = currentTime;
                    }
                }
                this.lastActiveTime = currentTime;
                this.lastStandingTime = null;
                break;
                
            case 'sleeping_or_resting':
                this.checkExcessiveSleep(currentTime);
                break;
        }
    }
    
    /**
     * Verificar sueño excesivo (común a todas las edades)
     */
    checkExcessiveSleep(currentTime) {
        // Solo verificar si ha estado durmiendo por MUY mucho tiempo
        if (this.lastActivityTime && (currentTime - this.lastActivityTime > 14400000)) { // 4 horas
            this.triggerAlert('very_long_sleep', {
                severity: 'low', // Reducido porque dormir mucho puede ser normal
                message: '😴 Bebé durmiendo por mucho tiempo - verificar bienestar ocasionalmente',
                confidence: 0.4, // Baja confianza porque puede ser normal
                details: { 
                    sleepDuration: Math.floor((currentTime - this.lastActivityTime) / 60000),
                    hoursAsleep: Math.floor((currentTime - this.lastActivityTime) / 3600000)
                }
            });
        }
    }
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
            if (now - lastAlert < this.config.alertCooldownTime) return;
        }
        
        this.alertCooldown.set(cooldownKey, now);
        
        // Usar sendAlert para manejo unificado
        this.sendAlert(type, data);
        
        // Auto-limpiar cooldown
        setTimeout(() => {
            this.alertCooldown.delete(cooldownKey);
        }, 30000);
    }
    
    sendAlert(type, data) {
        // Solo una alerta activa a la vez - la nueva reemplaza la anterior
        if (this.currentAlert) {
            console.log(`🔄 Reemplazando alerta anterior: ${this.currentAlert.type} con nueva: ${type}`);
        }
        
        // Crear nueva alerta
        this.currentAlert = {
            type: type,
            ...data,
            timestamp: new Date().toISOString(),
            id: Date.now() // ID único para tracking
        };
        
        // Enviar alerta al callback (emisor)
        if (this.alertCallback) {
            this.alertCallback(type, this.currentAlert);
        }
        
        console.log(`🚨 Nueva alerta activa: ${type} - ${data.message}`);
        
        // Limpiar alerta después de un tiempo para permitir nuevas
        setTimeout(() => {
            if (this.currentAlert && this.currentAlert.id === this.currentAlert.id) {
                this.currentAlert = null;
                console.log(`✅ Alerta ${type} limpiada`);
            }
        }, 30000); // Limpiar después de 30 segundos
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
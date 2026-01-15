// Sistema de monitoreo inteligente de bebés con IA
class BabyAIMonitor {
    constructor() {
        this.isInitialized = false;
        this.isMonitoring = false;
        this.detectionModel = null;
        this.poseModel = null;
        this.canvas = null;
        this.ctx = null;
        this.alertCallback = null;
        this.videoElement = null;
        
        // Configuración de detección
        this.config = {
            detectionInterval: 1000, // Analizar cada 1 segundo
            confidenceThreshold: 0.5,
            dangerZoneRadius: 0.3, // 30% del ancho de la imagen
            movementThreshold: 0.1,
            coverageThreshold: 0.7, // 70% del bebé cubierto = peligro
        };
        
        // Estado de seguimiento
        this.lastBabyPosition = null;
        this.lastMovementTime = Date.now();
        this.alertCooldown = new Map(); // Para evitar spam de alertas
        this.detectionHistory = [];
        
        console.log('🤖 Sistema de IA para monitoreo de bebé inicializado');
    }

    async initialize() {
        try {
            console.log('🔄 Cargando modelos de IA...');
            
            // Cargar modelo de detección de objetos (COCO-SSD)
            this.detectionModel = await cocoSsd.load();
            console.log('✅ Modelo de detección de objetos cargado');
            
            // Cargar modelo de detección de poses (MoveNet)
            this.poseModel = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                {
                    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
                    enableSmoothing: true,
                }
            );
            console.log('✅ Modelo de detección de poses cargado');
            
            // Crear canvas para análisis
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
            
            this.isInitialized = true;
            console.log('🤖 IA del monitor de bebé lista');
            return true;
            
        } catch (error) {
            console.error('❌ Error al inicializar IA:', error);
            return false;
        }
    }

    startMonitoring(videoElement, alertCallback) {
        if (!this.isInitialized) {
            console.error('❌ IA no inicializada. Llama a initialize() primero');
            return false;
        }

        this.videoElement = videoElement;
        this.alertCallback = alertCallback;
        this.isMonitoring = true;

        console.log('👶 Iniciando monitoreo inteligente del bebé');
        this.monitoringLoop();
        return true;
    }

    stopMonitoring() {
        this.isMonitoring = false;
        this.lastBabyPosition = null;
        this.alertCooldown.clear();
        console.log('⏹️ Monitoreo inteligente detenido');
    }

    async monitoringLoop() {
        if (!this.isMonitoring || !this.videoElement) {
            return;
        }

        try {
            await this.analyzeFrame();
        } catch (error) {
            console.error('❌ Error en análisis de frame:', error);
        }

        // Continuar el loop
        setTimeout(() => this.monitoringLoop(), this.config.detectionInterval);
    }

    async analyzeFrame() {
        if (!this.videoElement || this.videoElement.videoWidth === 0) {
            return;
        }

        // Configurar canvas con las dimensiones del video
        this.canvas.width = this.videoElement.videoWidth;
        this.canvas.height = this.videoElement.videoHeight;
        
        // Dibujar frame actual en el canvas
        this.ctx.drawImage(this.videoElement, 0, 0);

        // Detectar objetos y personas
        const detections = await this.detectionModel.detect(this.canvas);
        
        // Detectar poses humanas
        const poses = await this.poseModel.estimatePoses(this.canvas);

        // Analizar las detecciones
        this.analyzeDetections(detections, poses);
    }

    analyzeDetections(detections, poses) {
        const currentTime = Date.now();
        
        // Filtrar detecciones relevantes
        const people = detections.filter(d => d.class === 'person' && d.score > this.config.confidenceThreshold);
        const animals = detections.filter(d => ['cat', 'dog', 'bird'].includes(d.class) && d.score > this.config.confidenceThreshold);
        const blankets = detections.filter(d => ['bed', 'couch', 'pillow'].includes(d.class) && d.score > this.config.confidenceThreshold);

        // Identificar al bebé (persona más pequeña o con pose específica)
        const baby = this.identifyBaby(people, poses);

        if (baby) {
            // Detectar peligros específicos
            this.detectCoverageRisk(baby, blankets);
            this.detectMovementAnomalies(baby);
            this.detectIntrusions(baby, people.filter(p => p !== baby));
            this.detectAnimalThreats(baby, animals);
            
            this.lastBabyPosition = baby;
            this.lastMovementTime = currentTime;
        } else if (this.lastBabyPosition && (currentTime - this.lastMovementTime) > 30000) {
            // Bebé no visible por más de 30 segundos
            this.triggerAlert('BABY_NOT_VISIBLE', {
                severity: 'HIGH',
                message: '⚠️ Bebé no visible en la cámara por más de 30 segundos',
                timestamp: new Date().toISOString()
            });
        }

        // Guardar historial
        this.detectionHistory.push({
            timestamp: currentTime,
            baby: baby,
            people: people.length,
            animals: animals.length,
            poses: poses.length
        });

        // Mantener solo los últimos 60 análisis (1 minuto)
        if (this.detectionHistory.length > 60) {
            this.detectionHistory.shift();
        }
    }

    identifyBaby(people, poses) {
        if (people.length === 0) return null;

        // Si solo hay una persona, asumimos que es el bebé
        if (people.length === 1) {
            return people[0];
        }

        // Encontrar la persona más pequeña (más probable que sea el bebé)
        let baby = people.reduce((smallest, current) => {
            const smallestArea = smallest.bbox[2] * smallest.bbox[3];
            const currentArea = current.bbox[2] * current.bbox[3];
            return currentArea < smallestArea ? current : smallest;
        });

        return baby;
    }

    detectCoverageRisk(baby, blankets) {
        for (const blanket of blankets) {
            const overlap = this.calculateOverlap(baby.bbox, blanket.bbox);
            const babyArea = baby.bbox[2] * baby.bbox[3];
            const coverageRatio = overlap / babyArea;

            if (coverageRatio > this.config.coverageThreshold) {
                this.triggerAlert('BABY_COVERED', {
                    severity: 'CRITICAL',
                    message: '🚨 ¡PELIGRO! Bebé puede estar cubierto o tapado',
                    coverage: Math.round(coverageRatio * 100),
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    detectMovementAnomalies(baby) {
        if (!this.lastBabyPosition) return;

        // Calcular movimiento
        const movement = this.calculateMovement(this.lastBabyPosition.bbox, baby.bbox);
        
        // Detectar movimiento excesivo (posible peligro)
        if (movement > this.config.movementThreshold * 3) {
            this.triggerAlert('EXCESSIVE_MOVEMENT', {
                severity: 'MEDIUM',
                message: '⚠️ Movimiento inusual del bebé detectado',
                movement: Math.round(movement * 100),
                timestamp: new Date().toISOString()
            });
        }

        // Detectar falta de movimiento (posible problema)
        const timeSinceMovement = Date.now() - this.lastMovementTime;
        if (movement < 0.01 && timeSinceMovement > 300000) { // 5 minutos sin movimiento
            this.triggerAlert('NO_MOVEMENT', {
                severity: 'HIGH',
                message: '⚠️ Bebé sin movimiento por tiempo prolongado',
                duration: Math.round(timeSinceMovement / 1000),
                timestamp: new Date().toISOString()
            });
        }
    }

    detectIntrusions(baby, otherPeople) {
        for (const person of otherPeople) {
            const distance = this.calculateDistance(baby.bbox, person.bbox);
            
            if (distance < this.config.dangerZoneRadius) {
                this.triggerAlert('PERSON_APPROACHING', {
                    severity: 'HIGH',
                    message: '👤 Persona acercándose al bebé',
                    distance: Math.round(distance * 100),
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    detectAnimalThreats(baby, animals) {
        for (const animal of animals) {
            const distance = this.calculateDistance(baby.bbox, animal.bbox);
            
            if (distance < this.config.dangerZoneRadius) {
                this.triggerAlert('ANIMAL_APPROACHING', {
                    severity: 'MEDIUM',
                    message: `🐾 ${animal.class} acercándose al bebé`,
                    animalType: animal.class,
                    distance: Math.round(distance * 100),
                    confidence: Math.round(animal.score * 100),
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    calculateOverlap(bbox1, bbox2) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;

        const overlapX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
        const overlapY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));

        return overlapX * overlapY;
    }

    calculateDistance(bbox1, bbox2) {
        // Calcular centros de las bounding boxes
        const center1 = [bbox1[0] + bbox1[2]/2, bbox1[1] + bbox1[3]/2];
        const center2 = [bbox2[0] + bbox2[2]/2, bbox2[1] + bbox2[3]/2];

        // Distancia euclidiana normalizada
        const dx = (center1[0] - center2[0]) / this.canvas.width;
        const dy = (center1[1] - center2[1]) / this.canvas.height;

        return Math.sqrt(dx * dx + dy * dy);
    }

    calculateMovement(bbox1, bbox2) {
        return this.calculateDistance(bbox1, bbox2);
    }

    triggerAlert(type, data) {
        // Evitar spam de alertas
        const cooldownKey = `${type}_${Math.round(Date.now() / 10000)}`; // Cooldown de 10 segundos
        if (this.alertCooldown.has(cooldownKey)) {
            return;
        }
        this.alertCooldown.set(cooldownKey, true);

        console.log(`🚨 ALERTA: ${type}`, data);

        if (this.alertCallback) {
            this.alertCallback(type, data);
        }

        // Limpiar cooldowns antiguos
        setTimeout(() => {
            this.alertCooldown.delete(cooldownKey);
        }, 30000);
    }

    // Método para obtener estadísticas
    getStats() {
        const recent = this.detectionHistory.slice(-10); // Últimos 10 análisis
        
        return {
            isMonitoring: this.isMonitoring,
            isInitialized: this.isInitialized,
            totalAnalyses: this.detectionHistory.length,
            avgPeopleDetected: recent.length ? 
                recent.reduce((sum, h) => sum + h.people, 0) / recent.length : 0,
            avgAnimalsDetected: recent.length ? 
                recent.reduce((sum, h) => sum + h.animals, 0) / recent.length : 0,
            lastAnalysis: recent.length ? recent[recent.length - 1].timestamp : null
        };
    }
}

// Exportar la clase globalmente 
window.BabyAIMonitor = BabyAIMonitor;

// Instancia global del monitor
window.babyAIMonitor = new BabyAIMonitor();
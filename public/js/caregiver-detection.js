/**
 * Sistema de Detección y Reconocimiento de Cuidadores
 * Detecta personas conocidas vs desconocidas y analiza interacciones con el bebé
 */

class CaregiverDetection {
    constructor(aiSettings = {}) {
        this.settings = aiSettings;
        this.knownCaregivers = [];
        this.detectedPersons = [];
        this.lastInteractionTime = null;
        this.caregiverProfiles = new Map();
        
        // Patrones de movimiento para identificar cuidadores
        this.caregiverBehaviorPatterns = {
            gentle: ['feeding', 'rocking', 'patting', 'covering'],
            protective: ['checking', 'adjusting_position', 'removing_danger'],
            playful: ['tickling', 'playing', 'talking', 'singing']
        };
        
        this.initializeCaregiverProfiles();
    }
    
    initializeCaregiverProfiles() {
        // Crear perfiles basados en configuración
        if (this.settings.caregivers) {
            this.settings.caregivers.forEach((caregiver, index) => {
                this.caregiverProfiles.set(`profile_${index}`, {
                    name: caregiver.name,
                    type: caregiver.type,
                    trustLevel: this.getTrustLevel(caregiver.type),
                    allowedActions: this.getAllowedActions(caregiver.type),
                    isIdentified: false,
                    lastSeen: null,
                    interactionHistory: []
                });
            });
        }
        
        console.log('👥 Perfiles de cuidadores inicializados:', this.caregiverProfiles);
    }
    
    getTrustLevel(caregiverType) {
        const trustLevels = {
            'parent': 5,      // Máxima confianza
            'family': 4,      // Alta confianza  
            'nurse': 3,       // Confianza moderada
            'visitor': 2      // Confianza limitada
        };
        return trustLevels[caregiverType] || 1;
    }
    
    getAllowedActions(caregiverType) {
        const allowedActions = {
            'parent': ['all'], // Todas las acciones permitidas
            'family': ['feeding', 'playing', 'comforting', 'checking'],
            'nurse': ['feeding', 'changing', 'medical_care', 'comforting'],
            'visitor': ['looking', 'gentle_interaction'] // Acciones limitadas
        };
        return allowedActions[caregiverType] || ['looking'];
    }
    
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.initializeCaregiverProfiles();
        console.log('⚙️ Configuración de cuidadores actualizada');
    }
    
    /**
     * Analiza personas detectadas en la escena
     */
    analyzeDetectedPersons(detections, poseData) {
        const analysis = {
            totalPersons: 0,
            knownCaregivers: [],
            unknownPersons: [],
            interactions: [],
            alerts: []
        };
        
        if (!detections || !detections.length) {
            return analysis;
        }
        
        // Detectar personas en las detecciones de objetos
        const persons = detections.filter(detection => 
            detection.class === 'person' && detection.score > 0.6
        );
        
        analysis.totalPersons = persons.length;
        
        persons.forEach((person, index) => {
            const personAnalysis = this.analyzePersonBehavior(person, poseData, index);
            
            if (this.isKnownCaregiver(personAnalysis)) {
                analysis.knownCaregivers.push(personAnalysis);
                this.recordCaregiverInteraction(personAnalysis);
            } else {
                analysis.unknownPersons.push(personAnalysis);
                
                // Generar alerta para persona desconocida según sensibilidad
                if (this.shouldAlertForStranger(personAnalysis)) {
                    analysis.alerts.push(this.createStrangerAlert(personAnalysis));
                }
            }
            
            // Analizar interacciones con el bebé
            const interaction = this.analyzePersonBabyInteraction(personAnalysis, poseData);
            if (interaction) {
                analysis.interactions.push(interaction);
            }
        });
        
        return analysis;
    }
    
    /**
     * Analiza el comportamiento de una persona individual
     */
    analyzePersonBehavior(person, poseData, personIndex) {
        const behavior = {
            id: `person_${personIndex}`,
            bbox: person.bbox,
            confidence: person.score,
            position: this.getPersonPosition(person.bbox),
            movement: this.analyzeMovement(person.bbox),
            pose: this.extractPersonPose(poseData, person.bbox),
            proximity: this.calculateProximityToBaby(person.bbox),
            estimatedAge: this.estimateAgeGroup(person.bbox),
            behavior: 'unknown',
            trustLevel: 0,
            isCaregiver: false
        };
        
        // Analizar comportamiento basado en postura y movimiento
        behavior.behavior = this.classifyBehavior(behavior);
        
        return behavior;
    }
    
    getPersonPosition(bbox) {
        const centerX = bbox[0] + bbox[2] / 2;
        const centerY = bbox[1] + bbox[3] / 2;
        
        let position = '';
        if (centerX < 0.3) position += 'left_';
        else if (centerX > 0.7) position += 'right_';
        else position += 'center_';
        
        if (centerY < 0.3) position += 'top';
        else if (centerY > 0.7) position += 'bottom';
        else position += 'middle';
        
        return position;
    }
    
    analyzeMovement(bbox) {
        // Análisis simplificado de movimiento
        // En implementación real, compararíamos con frames anteriores
        return {
            type: 'stable', // stable, slow, fast, erratic
            direction: 'none', // up, down, left, right, towards_baby, away_from_baby
            speed: 0
        };
    }
    
    extractPersonPose(poseData, bbox) {
        // Extraer pose específica para esta persona
        // Simplificado - en implementación real usaríamos la detección de pose
        return {
            head: { visible: true, position: 'upright' },
            arms: { position: 'relaxed' }, // relaxed, reaching, protective, holding
            body: { posture: 'standing' } // standing, sitting, kneeling, lying
        };
    }
    
    calculateProximityToBaby(bbox) {
        // Calcular distancia al centro de la imagen (donde se supone está el bebé)
        const personCenterX = bbox[0] + bbox[2] / 2;
        const personCenterY = bbox[1] + bbox[3] / 2;
        const imageCenterX = 0.5;
        const imageCenterY = 0.5;
        
        const distance = Math.sqrt(
            Math.pow(personCenterX - imageCenterX, 2) + 
            Math.pow(personCenterY - imageCenterY, 2)
        );
        
        if (distance < 0.2) return 'very_close';
        if (distance < 0.4) return 'close';
        if (distance < 0.6) return 'moderate';
        return 'far';
    }
    
    estimateAgeGroup(bbox) {
        // Estimación simplificada basada en tamaño relativo
        const height = bbox[3];
        
        if (height > 0.7) return 'adult';
        if (height > 0.4) return 'teenager';
        if (height > 0.2) return 'child';
        return 'unknown';
    }
    
    classifyBehavior(personData) {
        const { proximity, pose, movement } = personData;
        
        // Clasificar comportamiento basado en múltiples factores
        if (proximity === 'very_close' && pose.arms.position === 'reaching') {
            return 'interacting_with_baby';
        }
        
        if (proximity === 'close' && pose.body.posture === 'kneeling') {
            return 'caring_for_baby';
        }
        
        if (proximity === 'moderate' && pose.head.position === 'looking_down') {
            return 'watching_baby';
        }
        
        if (movement.type === 'fast' || movement.type === 'erratic') {
            return 'suspicious_movement';
        }
        
        return 'normal_presence';
    }
    
    /**
     * Determina si una persona es un cuidador conocido
     */
    isKnownCaregiver(personData) {
        // En implementación real, usaríamos reconocimiento facial o patrones de comportamiento
        // Por ahora, usamos heurísticas basadas en comportamiento
        
        const caregiverIndicators = [
            personData.behavior === 'caring_for_baby',
            personData.behavior === 'interacting_with_baby',
            personData.estimatedAge === 'adult',
            personData.proximity === 'close' || personData.proximity === 'very_close',
            personData.movement.type === 'stable' || personData.movement.type === 'slow'
        ];
        
        const caregiverScore = caregiverIndicators.filter(indicator => indicator).length;
        
        // Si tenemos 3 o más indicadores, es probablemente un cuidador
        if (caregiverScore >= 3 && this.caregiverProfiles.size > 0) {
            personData.isCaregiver = true;
            personData.trustLevel = 4; // Confianza alta para cuidadores identificados
            return true;
        }
        
        return false;
    }
    
    shouldAlertForStranger(personData) {
        const sensitivity = this.settings.sensitivity?.stranger || 'medium';
        
        switch (sensitivity) {
            case 'low':
                return personData.proximity === 'very_close' && 
                       personData.behavior === 'suspicious_movement';
            case 'medium':
                return personData.proximity === 'close' || 
                       personData.proximity === 'very_close';
            case 'high':
                return true; // Alerta para cualquier persona desconocida
            default:
                return personData.proximity === 'close';
        }
    }
    
    createStrangerAlert(personData) {
        let severity = 'medium';
        let message = 'Persona desconocida detectada';
        
        if (personData.proximity === 'very_close') {
            severity = 'high';
            message = 'PERSONA DESCONOCIDA MUY CERCA DEL BEBÉ';
        } else if (personData.behavior === 'suspicious_movement') {
            severity = 'high';
            message = 'Persona desconocida con movimiento sospechoso';
        }
        
        return {
            id: `stranger_${Date.now()}`,
            type: 'stranger_detected',
            severity: severity,
            message: message,
            details: `Posición: ${personData.position}, Proximidad: ${personData.proximity}`,
            instructions: this.getStrangerInstructions(personData),
            timestamp: new Date().toISOString(),
            personData: personData
        };
    }
    
    getStrangerInstructions(personData) {
        if (personData.proximity === 'very_close') {
            return 'ACUDE INMEDIATAMENTE - Verifica quién está cerca del bebé';
        }
        if (personData.behavior === 'suspicious_movement') {
            return 'Mantente alerta - Observa los movimientos de la persona';
        }
        return 'Identifica a la persona - Verifica si es alguien conocido';
    }
    
    /**
     * Analiza la interacción entre una persona y el bebé
     */
    analyzePersonBabyInteraction(personData, poseData) {
        if (personData.proximity === 'far') {
            return null;
        }
        
        const interaction = {
            type: this.classifyInteractionType(personData),
            isPositive: this.isPositiveInteraction(personData),
            careLevel: this.assessCareLevel(personData),
            timestamp: Date.now()
        };
        
        // Evaluar si la interacción es apropiada
        if (!interaction.isPositive || !this.isAllowedInteraction(personData, interaction)) {
            return {
                ...interaction,
                alert: this.createInteractionAlert(personData, interaction)
            };
        }
        
        return interaction;
    }
    
    classifyInteractionType(personData) {
        switch (personData.behavior) {
            case 'caring_for_baby': return 'caregiving';
            case 'interacting_with_baby': return 'social_interaction';
            case 'watching_baby': return 'supervision';
            default: return 'unknown';
        }
    }
    
    isPositiveInteraction(personData) {
        const positiveIndicators = [
            personData.pose.arms.position === 'gentle',
            personData.movement.type === 'slow',
            personData.behavior !== 'suspicious_movement',
            personData.estimatedAge === 'adult'
        ];
        
        return positiveIndicators.filter(indicator => indicator).length >= 2;
    }
    
    assessCareLevel(personData) {
        if (personData.behavior === 'caring_for_baby') return 'high';
        if (personData.behavior === 'interacting_with_baby') return 'medium';
        return 'low';
    }
    
    isAllowedInteraction(personData, interaction) {
        if (!personData.isCaregiver) {
            // Personas no identificadas como cuidadores tienen interacciones limitadas
            return interaction.type === 'supervision' && 
                   personData.proximity !== 'very_close';
        }
        
        // Los cuidadores conocidos tienen más libertad
        return true;
    }
    
    createInteractionAlert(personData, interaction) {
        return {
            id: `interaction_${Date.now()}`,
            type: 'inappropriate_interaction',
            severity: personData.isCaregiver ? 'low' : 'high',
            message: `Interacción ${interaction.type} por ${personData.isCaregiver ? 'cuidador' : 'persona desconocida'}`,
            instructions: personData.isCaregiver ? 
                'Supervisa la interacción' : 
                'ACUDE INMEDIATAMENTE - Persona no autorizada interactuando con el bebé',
            timestamp: new Date().toISOString()
        };
    }
    
    recordCaregiverInteraction(caregiverData) {
        // Registrar interacción para aprendizaje de patrones
        this.lastInteractionTime = Date.now();
        
        // En implementación real, esto se guardaría en una base de datos
        console.log('👥 Interacción de cuidador registrada:', {
            caregiver: caregiverData.isCaregiver ? 'known' : 'unknown',
            behavior: caregiverData.behavior,
            timestamp: new Date().toLocaleTimeString()
        });
    }
    
    /**
     * Obtiene estadísticas de detección de cuidadores
     */
    getStats() {
        return {
            configuredCaregivers: this.caregiverProfiles.size,
            lastInteraction: this.lastInteractionTime,
            detectionAccuracy: 'learning' // En implementación real sería calculado
        };
    }
}

// Exportar para uso en el sistema de IA
if (typeof window !== 'undefined') {
    window.CaregiverDetection = CaregiverDetection;
}
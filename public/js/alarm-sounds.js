/**
 * Sistema de Sonidos de Alarma para Monitor de Bebé
 * Genera tonos sintéticos para alertas de IA
 */

class AlarmSounds {
    constructor() {
        this.audioContext = null;
        this.isEnabled = true;
        this.volume = 0.3; // Volumen moderado por defecto
        this.currentAlarm = null;
        
        this.initializeAudioContext();
    }
    
    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🔊 Sistema de sonidos de alarma inicializado');
        } catch (error) {
            console.error('Error inicializando audio:', error);
            this.isEnabled = false;
        }
    }
    
    /**
     * Reproduce una alarma según el tipo y severidad
     */
    async playAlert(severity = 'medium', duration = 2000) {
        if (!this.isEnabled || !this.audioContext) return;
        
        // Reanudar contexto de audio si está suspendido
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // Detener alarma actual si existe
        this.stopCurrentAlarm();
        
        switch (severity) {
            case 'critical':
                this.playCriticalAlarm(duration);
                break;
            case 'high':
                this.playHighAlarm(duration);
                break;
            case 'medium':
                this.playMediumAlarm(duration);
                break;
            default:
                this.playMediumAlarm(duration);
        }
    }
    
    /**
     * Alarma crítica - Sonido urgente y penetrante
     */
    playCriticalAlarm(duration) {
        const oscillators = [];
        const gainNodes = [];
        
        // Crear dos tonos alternantes para efecto de urgencia
        for (let i = 0; i < 2; i++) {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Frecuencias alternantes de alarma
            oscillator.frequency.setValueAtTime(i === 0 ? 800 : 1000, this.audioContext.currentTime);
            oscillator.type = 'square'; // Sonido más penetrante
            
            // Patrón de volumen intermitente
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            
            const patternDuration = 0.3;
            const cycles = Math.ceil(duration / 1000 / (patternDuration * 2));
            
            for (let cycle = 0; cycle < cycles; cycle++) {
                const startTime = this.audioContext.currentTime + (cycle * patternDuration * 2);
                
                if (cycle % 2 === i) {
                    gainNode.gain.setValueAtTime(this.volume * 0.8, startTime);
                    gainNode.gain.setValueAtTime(0, startTime + patternDuration);
                }
            }
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + (duration / 1000));
            
            oscillators.push(oscillator);
            gainNodes.push(gainNode);
        }
        
        this.currentAlarm = { oscillators, gainNodes };
    }
    
    /**
     * Alarma alta - Tonos de advertencia
     */
    playHighAlarm(duration) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Tono de advertencia modulado
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(800, this.audioContext.currentTime + 0.5);
        oscillator.frequency.linearRampToValueAtTime(600, this.audioContext.currentTime + 1);
        
        oscillator.type = 'triangle'; // Sonido menos agresivo que crítica
        
        // Patrón de beeps
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        
        const beepDuration = 0.4;
        const pauseDuration = 0.6;
        const cycles = Math.ceil(duration / 1000 / (beepDuration + pauseDuration));
        
        for (let i = 0; i < cycles; i++) {
            const startTime = this.audioContext.currentTime + (i * (beepDuration + pauseDuration));
            gainNode.gain.setValueAtTime(this.volume * 0.6, startTime);
            gainNode.gain.setValueAtTime(0, startTime + beepDuration);
        }
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + (duration / 1000));
        
        this.currentAlarm = { oscillators: [oscillator], gainNodes: [gainNode] };
    }
    
    /**
     * Alarma media - Notificación suave
     */
    playMediumAlarm(duration) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Tono suave de notificación
        oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(600, this.audioContext.currentTime + 0.8);
        oscillator.type = 'sine'; // Sonido suave
        
        // Envelope suave
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.4, this.audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, this.audioContext.currentTime + 0.5);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + (duration / 1000));
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + (duration / 1000));
        
        this.currentAlarm = { oscillators: [oscillator], gainNodes: [gainNode] };
    }
    
    /**
     * Detiene la alarma actual
     */
    stopCurrentAlarm() {
        if (this.currentAlarm) {
            this.currentAlarm.oscillators.forEach(osc => {
                try {
                    osc.stop();
                } catch (e) {
                    // Oscillator ya detenido
                }
            });
            this.currentAlarm = null;
        }
    }
    
    /**
     * Activa/desactiva sonidos
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (!enabled) {
            this.stopCurrentAlarm();
        }
    }
    
    /**
     * Ajusta el volumen (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
    
    /**
     * Reproduce sonido de test
     */
    playTestSound() {
        if (!this.isEnabled) return;
        
        this.playAlert('medium', 1000);
        setTimeout(() => this.playAlert('high', 800), 1500);
        setTimeout(() => this.playAlert('critical', 600), 2800);
    }
}

// Instancia global
window.alarmSounds = new AlarmSounds();
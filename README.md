# Monitor Bebé - Aplicación de Video Streaming

Una aplicación web en tiempo real para transmisión de video entre dispositivos, perfecta para monitoreo remoto.

## 🚀 Características

- **Transmisión en tiempo real** usando WebRTC
- **Interfaz responsive** optimizada para móviles
- **Roles definidos**: Emisor y Receptor
- **Salas privadas** con ID único
- **Control de calidad** de video configurable
- **Grabación de video** en el receptor
- **Pantalla completa** y controles de audio
- **Estadísticas en tiempo real** de conexión

## 📋 Requisitos

- Node.js 16+ 
- Navegador web moderno con soporte WebRTC
- HTTPS para producción (requerido por WebRTC)

## 🛠️ Instalación

1. **Clonar o descargar** el proyecto
2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Iniciar el servidor**:
   ```bash
   npm start
   ```
   
   Para desarrollo con auto-reload:
   ```bash
   npm run dev
   ```

4. **Acceder a la aplicación**:
   - Abrir en el navegador: `http://localhost:3000`

## 🎯 Cómo usar

### Configuración inicial
1. **Abrir la aplicación** en dos dispositivos diferentes
2. **Registrarse** en cada dispositivo:
   - Dispositivo 1: Elegir rol "Emisor"
   - Dispositivo 2: Elegir rol "Receptor"

### Conectar dispositivos
1. **En cualquier dispositivo**: 
   - Generar un ID de sala o crear uno personalizado
2. **Compartir el ID** con el otro dispositivo
3. **Ambos dispositivos** deben unirse a la misma sala

### Transmitir video
1. **Emisor**:
   - Hacer clic en "Iniciar Cámara"
   - Permitir acceso a cámara y micrófono
   - Cuando el receptor se conecte, hacer clic en "Iniciar Transmisión"

2. **Receptor**:
   - Automáticamente recibirá el video cuando el emisor inicie
   - Usar controles para pantalla completa, grabar, etc.

## 📱 Compatibilidad móvil

- ✅ **iOS Safari** 12+
- ✅ **Android Chrome** 70+
- ✅ **Android Firefox** 68+
- ✅ **Desktop** (Chrome, Firefox, Safari, Edge)

### Permisos necesarios
La aplicación solicitará acceso a:
- 📹 **Cámara** (emisor)
- 🎤 **Micrófono** (emisor)

## 🔧 Configuración avanzada

### Variables de entorno
Crear archivo `.env` (opcional):
```env
PORT=3000
NODE_ENV=production
```

### Configuración HTTPS
Para usar en dispositivos móviles externos, necesitas HTTPS:

1. **Certificados SSL**:
   ```bash
   # Crear certificados para desarrollo
   openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
   ```

2. **Modificar server.js** para HTTPS:
   ```javascript
   const https = require('https');
   const fs = require('fs');
   
   const options = {
     key: fs.readFileSync('key.pem'),
     cert: fs.readFileSync('cert.pem')
   };
   
   const server = https.createServer(options, app);
   ```

## 🌐 Despliegue en producción

### Heroku
1. **Crear app** en Heroku
2. **Configurar variables**:
   ```bash
   heroku config:set NODE_ENV=production
   ```
3. **Deploy**:
   ```bash
   git push heroku main
   ```

### Vercel/Netlify
- Configurar como aplicación Node.js
- Puerto automático desde `process.env.PORT`

## 🔍 Solución de problemas

### Video no se muestra
- ✅ Verificar permisos de cámara
- ✅ Comprobar que ambos dispositivos estén en la misma sala
- ✅ Revisar console del navegador para errores

### Conexión no se establece
- ✅ Verificar conexión a internet
- ✅ Comprobar firewall/router
- ✅ En producción, asegurar HTTPS

### Audio/video de mala calidad
- ✅ Ajustar configuración de calidad en emisor
- ✅ Verificar ancho de banda
- ✅ Cerrar aplicaciones que usen cámara/micrófono

## 📊 Arquitectura técnica

```
┌─────────────────┐    WebRTC P2P    ┌─────────────────┐
│     EMISOR      │ ←─────────────→   │    RECEPTOR     │
│   (Cámara)      │                   │   (Pantalla)    │
└─────────────────┘                   └─────────────────┘
         │                                     │
         │            Socket.IO                │
         │              (Señalización)         │
         └─────────────────┬─────────────────────┘
                          │
                 ┌─────────────────┐
                 │   SERVIDOR      │
                 │   Node.js       │
                 │   Express       │
                 └─────────────────┘
```

### Tecnologías utilizadas
- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **Backend**: Node.js, Express.js
- **WebSockets**: Socket.IO
- **Video**: WebRTC API
- **Estilo**: CSS Grid, Flexbox, CSS Variables

## 📝 Licencia

MIT License - Libre para uso personal y comercial

## 🤝 Contribuir

1. Fork del proyecto
2. Crear rama para feature (`git checkout -b feature/mejora`)
3. Commit cambios (`git commit -m 'Agregar mejora'`)
4. Push a la rama (`git push origin feature/mejora`)
5. Crear Pull Request

## 📞 Soporte

Para soporte técnico:
- 📧 Crear issue en el repositorio
- 📚 Revisar documentación WebRTC
- 🔍 Verificar logs del servidor y navegador
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: true, // Permitir cualquier origen
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6,
  // Configuración específica para conexiones remotas
  path: '/socket.io/',
  connectTimeout: 45000
});

// Configuración de archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Variables globales para manejar conexiones
let users = new Map(); // userId -> socket
let rooms = new Map(); // roomId -> {emisor: userId, receptores: [userId1, userId2, ...], maxReceptores: 10}

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/emisor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'emisor.html'));
});

app.get('/receptor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'receptor.html'));
});

// Manejo de conexiones WebSocket
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address || socket.request.connection.remoteAddress;
  const userAgent = socket.handshake.headers['user-agent'];
  
  console.log(`Usuario conectado: ${socket.id}`);
  console.log(`IP: ${clientIP}`);
  console.log(`User Agent: ${userAgent}`);
  
  // Detectar tipo de conexión
  const isLocal = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP.includes('192.168') || clientIP.includes('localhost');
  console.log(`Conexión: ${isLocal ? 'Local' : 'Internet'}`);

  // Registro de usuario
  socket.on('register-user', (data) => {
    const { username, role } = data;
    const userId = uuidv4();
    
    users.set(userId, {
      socketId: socket.id,
      username: username,
      role: role, // 'emisor' o 'receptor'
      roomId: null
    });

    socket.userId = userId;
    socket.emit('user-registered', { userId, username, role });
    
    console.log(`Usuario registrado: ${username} como ${role}`);
    
    // Enviar lista de usuarios activos
    updateUserList();
  });

  // Crear o unirse a sala
  socket.on('join-room', (data) => {
    const { roomId } = data;
    const user = users.get(socket.userId);
    
    if (!user) return;

    // Si la sala no existe, crearla
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        emisor: null,
        receptores: [],
        maxReceptores: 10
      });
    }

    const room = rooms.get(roomId);
    
    // Asignar usuario al rol correspondiente en la sala
    if (user.role === 'emisor' && !room.emisor) {
      room.emisor = socket.userId;
      user.roomId = roomId;
      socket.join(roomId);
      socket.emit('joined-room', { 
        roomId, 
        role: 'emisor', 
        receptoresConectados: room.receptores.length,
        maxReceptores: room.maxReceptores 
      });
      console.log(`Emisor ${user.username} se unió a sala ${roomId}`);
      
    } else if (user.role === 'receptor') {
      // Verificar si hay espacio para más receptores
      if (room.receptores.length >= room.maxReceptores) {
        socket.emit('room-full', {
          message: `Sala llena. Máximo ${room.maxReceptores} receptores permitidos.`,
          currentCount: room.receptores.length
        });
        return;
      }
      
      // Agregar receptor a la lista
      room.receptores.push(socket.userId);
      user.roomId = roomId;
      socket.join(roomId);
      
      socket.emit('joined-room', { 
        roomId, 
        role: 'receptor',
        receptorNumber: room.receptores.length,
        totalReceptores: room.receptores.length,
        maxReceptores: room.maxReceptores
      });
      
      console.log(`Receptor ${user.username} (#${room.receptores.length}) se unió a sala ${roomId}`);
      
      // Notificar al emisor sobre el nuevo receptor
      if (room.emisor) {
        const emisorSocket = getUserSocket(room.emisor);
        if (emisorSocket) {
          emisorSocket.emit('receptor-connected', {
            receptorId: socket.userId,
            receptorNumber: room.receptores.length,
            totalReceptores: room.receptores.length,
            username: user.username
          });
        }
      }
      
      // Notificar a todos los usuarios de la sala sobre el nuevo receptor
      io.to(roomId).emit('room-update', {
        event: 'receptor-joined',
        message: `Receptor ${user.username} se conectó (#${room.receptores.length})`,
        totalReceptores: room.receptores.length,
        maxReceptores: room.maxReceptores
      });
      
    } else if (user.role === 'emisor' && room.emisor) {
      socket.emit('room-full-or-role-taken', {
        message: 'Ya hay un emisor en esta sala. Solo puede haber 1 emisor por sala.',
        role: 'emisor'
      });
    }
  });

  // Manejo de señalización WebRTC optimizado para múltiples receptores
  socket.on('offer', (data) => {
    const user = users.get(socket.userId);
    if (!user || !user.roomId) return;
    
    const room = rooms.get(user.roomId);
    if (room && room.receptores.length > 0) {
      // Enviar oferta a TODOS los receptores conectados
      const offer = data.sdp || data;
      console.log(`Oferta SDP de ${user.username} para ${room.receptores.length} receptores: ${offer.type}`);
      
      let receptoresActivos = 0;
      room.receptores.forEach((receptorId, index) => {
        const receptorSocket = getUserSocket(receptorId);
        if (receptorSocket) {
          receptorSocket.emit('offer', {
            sdp: offer,
            timestamp: data.timestamp || new Date().toISOString(),
            emisorInfo: {
              username: user.username,
              userAgent: socket.handshake.headers['user-agent'] || 'Unknown'
            },
            receptorNumber: index + 1
          });
          receptoresActivos++;
        }
      });
      
      // Notificar a toda la sala sobre el estado
      io.to(user.roomId).emit('connection-update', {
        event: 'offer-sent',
        message: `Oferta de conexión enviada a ${receptoresActivos} receptores (${offer.type})`,
        timestamp: new Date().toISOString(),
        receptoresActivos: receptoresActivos
      });
    }
  });

  socket.on('answer', (data) => {
    const user = users.get(socket.userId);
    if (!user || !user.roomId) return;
    
    const room = rooms.get(user.roomId);
    if (room && room.emisor) {
      const emisorSocket = getUserSocket(room.emisor);
      if (emisorSocket) {
        // Extraer SDP correctamente
        const answer = data.sdp || data;
        console.log(`Respuesta SDP de ${user.username}: ${answer.type}`);
        
        // Encontrar el número del receptor
        const receptorIndex = room.receptores.indexOf(socket.userId);
        const receptorNumber = receptorIndex >= 0 ? receptorIndex + 1 : 0;
        
        emisorSocket.emit('answer', {
          sdp: answer,
          timestamp: data.timestamp || new Date().toISOString(),
          receptorInfo: {
            username: user.username,
            userAgent: socket.handshake.headers['user-agent'] || 'Unknown',
            receptorId: socket.userId,
            receptorNumber: receptorNumber
          }
        });
        
        // Notificar a toda la sala
        io.to(user.roomId).emit('connection-update', {
          event: 'answer-received',
          message: `Respuesta recibida del receptor #${receptorNumber} (${user.username})`,
          timestamp: new Date().toISOString(),
          receptorNumber: receptorNumber
        });
      }
    }
  });

  socket.on('ice-candidate', (data) => {
    const user = users.get(socket.userId);
    if (!user || !user.roomId) return;
    
    const room = rooms.get(user.roomId);
    if (!room) return;

    if (user.role === 'emisor') {
      // Emisor envía ICE candidate a TODOS los receptores
      room.receptores.forEach(receptorId => {
        const receptorSocket = getUserSocket(receptorId);
        if (receptorSocket) {
          receptorSocket.emit('ice-candidate', {
            ...data,
            fromEmisor: true
          });
        }
      });
    } else if (user.role === 'receptor') {
      // Receptor envía ICE candidate solo al emisor
      const emisorSocket = getUserSocket(room.emisor);
      if (emisorSocket) {
        const receptorIndex = room.receptores.indexOf(socket.userId);
        emisorSocket.emit('ice-candidate', {
          ...data,
          fromReceptor: true,
          receptorId: socket.userId,
          receptorNumber: receptorIndex + 1
        });
      }
    }
  });

  // Eventos de estado de conexión
  socket.on('connection-state-change', (data) => {
    const user = users.get(socket.userId);
    if (!user || !user.roomId) return;
    
    // Notificar a toda la sala sobre cambios de estado
    io.to(user.roomId).emit('connection-update', {
      event: 'connection-state',
      role: user.role,
      state: data.state,
      message: `${user.role === 'emisor' ? 'Emisor' : 'Receptor'} - Estado: ${data.state}`,
      timestamp: new Date().toISOString()
    });
  });

  // Ping/Pong para mantener conexión
  socket.on('ping-room', () => {
    const user = users.get(socket.userId);
    if (!user || !user.roomId) return;
    
    const room = rooms.get(user.roomId);
    if (!room) return;
    
    // Responder con info actualizada de la sala
    socket.emit('pong-room', {
      roomId: user.roomId,
      emisorConnected: !!room.emisor,
      receptoresConnectados: room.receptores.length,
      maxReceptores: room.maxReceptores,
      receptores: room.receptores.map((receptorId, index) => {
        const receptorUser = users.get(receptorId);
        return {
          id: receptorId,
          number: index + 1,
          username: receptorUser?.username || 'Desconocido'
        };
      }),
      timestamp: new Date().toISOString()
    });
  });

  // Desconexión
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    
    if (socket.userId) {
      const user = users.get(socket.userId);
      if (user && user.roomId) {
        const room = rooms.get(user.roomId);
        if (room) {
          if (room.emisor === socket.userId) {
            // El emisor se desconectó
            console.log(`Emisor ${user.username} se desconectó de sala ${user.roomId}`);
            room.emisor = null;
            
            // Notificar a todos los receptores
            room.receptores.forEach(receptorId => {
              const receptorSocket = getUserSocket(receptorId);
              if (receptorSocket) {
                receptorSocket.emit('emisor-disconnected', {
                  message: 'El emisor se ha desconectado'
                });
              }
            });
            
          } else if (room.receptores.includes(socket.userId)) {
            // Un receptor se desconectó
            const receptorIndex = room.receptores.indexOf(socket.userId);
            room.receptores.splice(receptorIndex, 1);
            
            console.log(`Receptor ${user.username} (#${receptorIndex + 1}) se desconectó de sala ${user.roomId}`);
            
            // Notificar al emisor
            if (room.emisor) {
              const emisorSocket = getUserSocket(room.emisor);
              if (emisorSocket) {
                emisorSocket.emit('receptor-disconnected', {
                  receptorId: socket.userId,
                  username: user.username,
                  receptorNumber: receptorIndex + 1,
                  remainingReceptores: room.receptores.length
                });
              }
            }
            
            // Notificar a toda la sala
            io.to(user.roomId).emit('room-update', {
              event: 'receptor-left',
              message: `Receptor ${user.username} se desconectó`,
              totalReceptores: room.receptores.length,
              maxReceptores: room.maxReceptores
            });
          }
          
          // Si la sala está vacía, eliminarla
          if (!room.emisor && room.receptores.length === 0) {
            console.log(`Eliminando sala vacía: ${user.roomId}`);
            rooms.delete(user.roomId);
          }
        }
      }
      
      users.delete(socket.userId);
      updateUserList();
    }
  });

  // Función auxiliar para obtener socket de usuario
  function getUserSocket(userId) {
    const user = users.get(userId);
    return user ? io.sockets.sockets.get(user.socketId) : null;
  }

  // Función para actualizar lista de usuarios
  function updateUserList() {
    const userList = Array.from(users.values()).map(user => ({
      username: user.username,
      role: user.role,
      inRoom: !!user.roomId
    }));
    
    io.emit('user-list-updated', userList);
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Escuchar en todas las interfaces

server.listen(PORT, HOST, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
  console.log(`Host: ${HOST}`);
  
  // Detectar IP pública automáticamente
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  console.log('\n🌐 DIRECCIONES PARA CONEXIÓN REMOTA:');
  
  Object.keys(interfaces).forEach(interfaceName => {
    interfaces[interfaceName].forEach(interface => {
      if (!interface.internal && interface.family === 'IPv4') {
        console.log(`📱 Usar esta IP en móviles: http://${interface.address}:${PORT}`);
        console.log(`🌍 Para internet: Configura port forwarding del puerto ${PORT} a ${interface.address}`);
      }
    });
  });
  
  console.log(`\n🚀 Para RENDER/Producción: https://tu-app.onrender.com`);
  console.log(`⚠️  IMPORTANTE: Para usar cámara en móviles remotos, DEBES usar HTTPS\n`);
});
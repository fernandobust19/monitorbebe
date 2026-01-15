// Conexión con el servidor
const socket = io();

// Variables globales
let currentUser = null;
let currentRole = null;
let currentRoomId = null;

// Elementos del DOM
const loginForm = document.getElementById('loginForm');
const roomSelection = document.getElementById('roomSelection');
const userForm = document.getElementById('userForm');
const generateRoomBtn = document.getElementById('generateRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomIdInput = document.getElementById('roomId');

// Manejo del formulario de registro
userForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const role = document.querySelector('input[name="role"]:checked').value;
    
    if (!username) {
        alert('Por favor, ingresa un nombre de usuario');
        return;
    }
    
    // Registrar usuario en el servidor
    socket.emit('register-user', { username, role });
});

// Eventos del socket
socket.on('user-registered', (data) => {
    currentUser = data.username;
    currentRole = data.role;
    
    // Actualizar UI
    document.getElementById('currentUser').textContent = currentUser;
    document.getElementById('currentRole').textContent = currentRole;
    
    // Mostrar sección de sala
    loginForm.style.display = 'none';
    roomSelection.style.display = 'block';
    
    console.log(`Registrado como ${currentRole}: ${currentUser}`);
});

// Generar ID de sala aleatorio
generateRoomBtn.addEventListener('click', () => {
    const roomId = generateRandomRoomId();
    roomIdInput.value = roomId;
});

// Unirse a sala
joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    
    if (!roomId) {
        alert('Por favor, ingresa un ID de sala');
        return;
    }
    
    currentRoomId = roomId;
    socket.emit('join-room', { roomId });
});

// Eventos de sala
socket.on('joined-room', (data) => {
    document.getElementById('statusText').textContent = `Conectado a sala: ${data.roomId}`;
    
    // Redirigir según el rol
    if (data.role === 'emisor') {
        // Guardar datos en sessionStorage para la página del emisor
        sessionStorage.setItem('userInfo', JSON.stringify({
            username: currentUser,
            role: currentRole,
            roomId: data.roomId
        }));
        window.location.href = '/emisor';
    } else if (data.role === 'receptor') {
        // Guardar datos en sessionStorage para la página del receptor
        sessionStorage.setItem('userInfo', JSON.stringify({
            username: currentUser,
            role: currentRole,
            roomId: data.roomId
        }));
        window.location.href = '/receptor';
    }
});

socket.on('room-full-or-role-taken', () => {
    alert('La sala está llena o el rol ya está ocupado. Intenta con otra sala o rol.');
});

socket.on('user-list-updated', (userList) => {
    updateUserList(userList);
});

// Funciones auxiliares
function generateRandomRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function updateUserList(userList) {
    const usersContainer = document.getElementById('users');
    
    if (userList.length === 0) {
        usersContainer.innerHTML = '<p>No hay usuarios conectados</p>';
        return;
    }
    
    usersContainer.innerHTML = userList.map(user => `
        <div class="user-item">
            <span class="username">${user.username}</span>
            <span class="role ${user.role}">${user.role}</span>
            <span class="status ${user.inRoom ? 'connected' : 'waiting'}">
                ${user.inRoom ? 'En sala' : 'Esperando'}
            </span>
        </div>
    `).join('');
}

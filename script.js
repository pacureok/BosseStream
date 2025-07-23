// script.js

// Accede a las instancias de Firebase que se exportaron globalmente desde index.html
const db = window.db;
const serverTimestamp = window.serverTimestamp;

// Elementos del DOM
const privateAccessSection = document.getElementById('private-access-section');
const accessCodeInput = document.getElementById('access-code-input');
const enterPrivateRoomBtn = document.getElementById('enter-private-room-btn');
const accessMessage = document.getElementById('access-message');

const audioTransmissionSection = document.getElementById('audio-transmission-section');
const userIdDisplay = document.getElementById('user-id-display');
const shareLink = document.getElementById('share-link');
const startStreamBtn = document.getElementById('start-stream-btn');
const stopStreamBtn = document.getElementById('stop-stream-btn');
const localAudio = document.getElementById('local-audio');
const audioStatus = document.getElementById('audio-status');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatStatus = document.getElementById('chat-status');

// Código de acceso a la sala privada (¡NO SEGURO PARA PRODUCCIÓN!)
const PRIVATE_ACCESS_CODE = "1d2g3h5hd4g";

// Generar un ID de usuario único para esta sesión
const userId = `user_${Math.random().toString(36).substring(2, 9)}`;
userIdDisplay.textContent = userId;

// Función para copiar texto al portapapeles
function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy'); // Método más compatible en iframes
        return true;
    } catch (err) {
        console.error('Error al copiar al portapapeles:', err);
        return false;
    } finally {
        document.body.removeChild(textarea);
    }
}

// --- Lógica de Acceso a Sala Privada ---
enterPrivateRoomBtn.addEventListener('click', () => {
    const enteredCode = accessCodeInput.value.trim();
    if (enteredCode === PRIVATE_ACCESS_CODE) {
        privateAccessSection.classList.add('hidden');
        audioTransmissionSection.classList.remove('hidden');
        accessMessage.classList.add('hidden');

        // Generar y mostrar el enlace para compartir
        // Para una sala real, el 'room' sería un ID generado por el servidor
        const currentUrl = window.location.href.split('?')[0]; // Elimina cualquier parámetro existente
        const uniqueLink = `${currentUrl}?room=${userId}`; // Ejemplo simple: el ID de usuario como ID de sala
        shareLink.href = uniqueLink;
        shareLink.textContent = uniqueLink;

        // Opcional: Copiar el enlace al portapapeles automáticamente
        if (copyToClipboard(uniqueLink)) {
            audioStatus.textContent = '¡Acceso concedido! Enlace de sala copiado al portapapeles.';
            audioStatus.classList.remove('text-red-600', 'text-yellow-700');
            audioStatus.classList.add('text-green-600');
        } else {
            audioStatus.textContent = '¡Acceso concedido! Copia el enlace manualmente.';
            audioStatus.classList.remove('text-green-600', 'text-red-600');
            audioStatus.classList.add('text-yellow-700');
        }

    } else {
        accessMessage.textContent = 'Código incorrecto. Inténtalo de nuevo.';
        accessMessage.classList.remove('hidden');
        accessMessage.classList.add('text-red-600');
    }
});

// --- Lógica de Transmisión de Audio (Simulación de captura local) ---
let mediaStream = null;

startStreamBtn.addEventListener('click', async () => {
    try {
        // Solicitar acceso al micrófono
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localAudio.srcObject = mediaStream;
        localAudio.play(); // Reproduce tu propio audio (para monitoreo)
        localAudio.classList.remove('hidden');

        startStreamBtn.classList.add('hidden');
        stopStreamBtn.classList.remove('hidden');
        audioStatus.textContent = 'Micrófono activado. Tu voz se está capturando localmente.';
        audioStatus.classList.remove('text-red-600', 'text-yellow-700');
        audioStatus.classList.add('text-green-600');

        // IMPORTANTE: En una aplicación real de transmisión a múltiples usuarios,
        // aquí es donde usarías WebRTC para enviar el 'mediaStream' a otros usuarios
        // a través de un servidor de señalización (como Firebase Firestore).
        // Esta demo solo captura tu audio localmente.

    } catch (err) {
        console.error('Error al acceder al micrófono:', err);
        audioStatus.textContent = 'Error: No se pudo acceder al micrófono. Asegúrate de dar permisos.';
        audioStatus.classList.remove('text-green-600', 'text-yellow-700');
        audioStatus.classList.add('text-red-600');
    }
});

stopStreamBtn.addEventListener('click', () => {
    if (mediaStream) {
        // Detener todas las pistas del stream (micrófono)
        mediaStream.getTracks().forEach(track => track.stop());
        localAudio.srcObject = null; // Desconecta el stream del elemento de audio
        localAudio.classList.add('hidden');
        mediaStream = null; // Limpia la referencia al stream

        startStreamBtn.classList.remove('hidden');
        stopStreamBtn.classList.add('hidden');
        audioStatus.textContent = 'Transmisión detenida.';
        audioStatus.classList.remove('text-green-600', 'text-red-600');
        audioStatus.classList.add('text-gray-600');
    }
});

// --- Lógica del Chat en Vivo con Firebase Firestore ---

// Referencia a la colección de mensajes en Firestore
const messagesRef = firebase.firestore().collection("chatMessages"); // Usamos firebase.firestore() directamente

// Escuchar mensajes en tiempo real
// Nota: 'orderBy' requiere que configures un índice en Firebase Firestore para 'timestamp'
// Si ves errores en la consola sobre índices, ve a la consola de Firebase -> Firestore Database -> Índices
// y crea un índice para la colección 'chatMessages' en el campo 'timestamp' (ascendente).
messagesRef.orderBy("timestamp", "asc").onSnapshot((snapshot) => {
    chatMessages.innerHTML = ''; // Limpiar mensajes existentes
    snapshot.forEach((doc) => {
        const message = doc.data();
        const isOwnMessage = message.userId === userId;
        const messageClass = isOwnMessage ? 'own' : 'other';

        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', messageClass);
        messageElement.innerHTML = `
            <span class="username">${message.username || message.userId}:</span>
            <span class="message-text">${message.text}</span>
        `;
        chatMessages.appendChild(messageElement);
    });
    // Desplazarse hasta el último mensaje automáticamente
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatStatus.textContent = 'Chat actualizado.';
    chatStatus.classList.remove('text-red-600');
    chatStatus.classList.add('text-green-600');
}, (error) => {
    console.error("Error al escuchar mensajes:", error);
    chatStatus.textContent = 'Error al cargar el chat.';
    chatStatus.classList.remove('text-green-600');
    chatStatus.classList.add('text-red-600');
});

// Enviar mensaje al chat
sendChatBtn.addEventListener('click', async () => {
    const messageText = chatInput.value.trim();
    if (messageText) {
        try {
            await messagesRef.add({
                userId: userId, // Usamos el ID de usuario generado
                username: `Usuario ${userId.substring(5, 10)}`, // Un nombre de usuario simple para mostrar
                text: messageText,
                timestamp: firebase.firestore.FieldValue.serverTimestamp() // Marca de tiempo del servidor para ordenar
            });
            chatInput.value = ''; // Limpiar el input
            chatStatus.textContent = 'Mensaje enviado.';
            chatStatus.classList.remove('text-red-600');
            chatStatus.classList.add('text-green-600');
        } catch (e) {
            console.error("Error al añadir documento: ", e);
            chatStatus.textContent = 'Error al enviar mensaje.';
            chatStatus.classList.remove('text-green-600');
            chatStatus.classList.add('text-red-600');
        }
    }
});

// Permitir enviar mensaje con la tecla Enter en el campo de chat
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatBtn.click();
    }
});

// Manejo de URL para unirse a una "sala" (simulado)
// Si alguien abre el link con ?room=algun_id, esta lógica se activa.
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        console.log(`Intentando unirse a la sala: ${roomParam}`);
        // Aquí podrías añadir lógica para mostrar la sala o unirse automáticamente
        // Por ejemplo, si el código de acceso fuera parte del link:
        // accessCodeInput.value = PRIVATE_ACCESS_CODE;
        // enterPrivateRoomBtn.click();
    }
});

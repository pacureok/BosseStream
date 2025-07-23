// script.js

// Accede a las instancias y funciones de Firebase exportadas globalmente desde index.html
const db = window.db;
const collection = window.collection;
const addDoc = window.addDoc;
const query = window.query;
const orderBy = window.orderBy;
const onSnapshot = window.onSnapshot;
const serverTimestamp = window.serverTimestamp;
const FieldValue = window.FieldValue;
const doc = window.doc;
const setDoc = window.setDoc;
const getDoc = window.getDoc;
const updateDoc = window.updateDoc;
const deleteDoc = window.deleteDoc;

// Elementos del DOM
const privateAccessSection = document.getElementById('private-access-section');
const accessCodeInput = document.getElementById('access-code-input');
const enterPrivateRoomBtn = document.getElementById('enter-private-room-btn');
const accessMessage = document.getElementById('access-message');

const audioTransmissionSection = document.getElementById('audio-transmission-section');
const userIdDisplay = document.getElementById('user-id-display');
const shareLinkText = document.getElementById('share-link-text');
const shareLink = document.getElementById('share-link');
const startStreamBtn = document.getElementById('start-stream-btn');
const stopStreamBtn = document.getElementById('stop-stream-btn');
const audioStatus = document.getElementById('audio-status');
const remoteAudioContainer = document.getElementById('remote-audio-container');
const noRemoteAudioMessage = document.getElementById('no-remote-audio');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatStatus = document.getElementById('chat-status');

// Código de acceso a la sala privada (¡NO SEGURO PARA PRODUCCIÓN!)
const PRIVATE_ACCESS_CODE = "1d2g3h5hd4g";

// Generar un ID de usuario único para esta sesión
const userId = `user_${Math.random().toString(36).substring(2, 9)}`;
userIdDisplay.textContent = userId;

// --- WebRTC Variables ---
let peerConnection = null;
let localStream = null;
let currentRoomId = null;
let isBroadcaster = false; // Indica si este usuario es el que transmite
const remoteAudioElements = new Map(); // Para guardar los elementos de audio de cada oyente

// Configuración de WebRTC (servidores STUN/TURN)
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // Servidor STUN público de Google
        // Si necesitas atravesar NATs más complejos, necesitarías un servidor TURN
        // { urls: 'turn:YOUR_TURN_SERVER_URL', username: 'YOUR_USERNAME', credential: 'YOUR_PASSWORD' }
    ]
};

// --- Firebase Firestore References for WebRTC ---
let roomRef = null;
let offerCandidatesRef = null;
let answerCandidatesRef = null;

// Función para copiar texto al portapapeles
function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
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
        // El ID de sala será el ID del usuario que inicia la transmisión
        currentRoomId = userId; // El transmisor crea la sala con su propio ID
        const currentUrl = window.location.href.split('?')[0];
        const uniqueLink = `${currentUrl}?room=${currentRoomId}`;
        shareLink.href = uniqueLink;
        shareLink.textContent = uniqueLink;

        // Mostrar el botón de iniciar transmisión para el transmisor
        startStreamBtn.classList.remove('hidden');
        shareLinkText.textContent = 'Comparte este enlace para que otros se unan (para escuchar tu transmisión):';

        // Opcional: Copiar el enlace al portapapeles automáticamente
        if (copyToClipboard(uniqueLink)) {
            audioStatus.textContent = '¡Acceso concedido! Enlace de sala copiado al portapapeles. Haz clic en "Iniciar Transmisión" para comenzar.';
            audioStatus.classList.remove('text-red-600', 'text-yellow-700');
            audioStatus.classList.add('text-green-600');
        } else {
            audioStatus.textContent = '¡Acceso concedido! Copia el enlace manualmente. Haz clic en "Iniciar Transmisión" para comenzar.';
            audioStatus.classList.remove('text-green-600', 'text-red-600');
            audioStatus.classList.add('text-yellow-700');
        }

    } else {
        accessMessage.textContent = 'Código incorrecto. Inténtalo de nuevo.';
        accessMessage.classList.remove('hidden');
        accessMessage.classList.add('text-red-600');
    }
});

// --- WebRTC Functions ---

// Función para iniciar la transmisión (rol de transmisor)
async function startWebRTCTransmission() {
    isBroadcaster = true;
    audioStatus.textContent = 'Iniciando transmisión...';
    audioStatus.classList.remove('text-red-600', 'text-yellow-700');
    audioStatus.classList.add('text-gray-600');

    try {
        // 1. Obtener stream local (micrófono)
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Got local stream:', localStream);

        // 2. Crear RTCPeerConnection
        peerConnection = new RTCPeerConnection(RTC_CONFIG);
        console.log('Created peer connection:', peerConnection);

        // Añadir la pista de audio local al peerConnection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Manejar candidatos ICE (para establecer la conexión de red)
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log('Broadcaster ICE candidate:', event.candidate);
                // Enviar el candidato ICE a Firestore
                addDoc(offerCandidatesRef, event.candidate.toJSON());
            }
        };

        // Escuchar por pistas de audio remotas (no aplica para el transmisor en este modelo simple)
        // peerConnection.ontrack = event => { ... };

        // 3. Crear Oferta (Offer)
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('Created and set local offer:', offer);

        // Guardar la oferta en Firestore
        roomRef = doc(db, 'webrtc_rooms', currentRoomId);
        await setDoc(roomRef, {
            offer: {
                type: offer.type,
                sdp: offer.sdp
            },
            broadcasterId: userId,
            timestamp: FieldValue.serverTimestamp()
        });
        audioStatus.textContent = 'Oferta de transmisión creada y esperando oyentes...';

        // Escuchar por respuestas (answers) de los oyentes
        onSnapshot(roomRef, async (snapshot) => {
            const data = snapshot.data();
            if (data && data.answer && !peerConnection.currentRemoteDescription) {
                console.log('Received answer from listener:', data.answer);
                const answerDescription = new RTCSessionDescription(data.answer);
                await peerConnection.setRemoteDescription(answerDescription);
                audioStatus.textContent = 'Respuesta de oyente recibida. Conectando...';
            }
        });

        // Escuchar por candidatos ICE de los oyentes
        answerCandidatesRef = collection(roomRef, 'answerCandidates');
        onSnapshot(answerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    console.log('Broadcaster adding remote ICE candidate:', candidate);
                    await peerConnection.addIceCandidate(candidate);
                }
            });
        });

        startStreamBtn.classList.add('hidden');
        stopStreamBtn.classList.remove('hidden');
        audioStatus.textContent = 'Transmisión iniciada. Comparte el enlace para que otros se unan.';
        audioStatus.classList.remove('text-red-600', 'text-yellow-700');
        audioStatus.classList.add('text-green-600');

    } catch (err) {
        console.error('Error al iniciar transmisión WebRTC:', err);
        audioStatus.textContent = `Error al iniciar transmisión: ${err.message}. Asegúrate de dar permisos de micrófono.`;
        audioStatus.classList.remove('text-green-600', 'text-yellow-700');
        audioStatus.classList.add('text-red-600');
        stopWebRTCTransmission(); // Limpiar si hay un error
    }
}

// Función para unirse a una sala como oyente
async function joinWebRTCRoom(roomId) {
    currentRoomId = roomId;
    isBroadcaster = false; // Este usuario es un oyente
    audioStatus.textContent = `Intentando unirse a la sala ${roomId}...`;
    audioStatus.classList.remove('text-red-600', 'text-yellow-700');
    audioStatus.classList.add('text-gray-600');

    remoteAudioContainer.classList.remove('hidden'); // Mostrar contenedor de audio remoto
    noRemoteAudioMessage.classList.remove('hidden'); // Mostrar mensaje de "esperando audio"

    try {
        roomRef = doc(db, 'webrtc_rooms', currentRoomId);
        offerCandidatesRef = collection(roomRef, 'offerCandidates');
        answerCandidatesRef = collection(roomRef, 'answerCandidates');

        // 1. Crear RTCPeerConnection
        peerConnection = new RTCPeerConnection(RTC_CONFIG);
        console.log('Created peer connection for listener:', peerConnection);

        // Manejar candidatos ICE
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log('Listener ICE candidate:', event.candidate);
                // Enviar el candidato ICE a Firestore
                addDoc(answerCandidatesRef, event.candidate.toJSON());
            }
        };

        // Manejar pistas de audio remotas
        peerConnection.ontrack = event => {
            console.log('Received remote track:', event.streams[0]);
            if (event.streams && event.streams[0]) {
                noRemoteAudioMessage.classList.add('hidden'); // Ocultar mensaje de "esperando"
                let remoteAudio = remoteAudioElements.get(event.streams[0].id);
                if (!remoteAudio) {
                    remoteAudio = document.createElement('audio');
                    remoteAudio.autoplay = true;
                    remoteAudio.controls = true;
                    remoteAudio.classList.add('w-full', 'mb-2', 'rounded-lg');
                    remoteAudio.id = `remote-audio-${event.streams[0].id}`;
                    remoteAudioContainer.appendChild(remoteAudio);
                    remoteAudioElements.set(event.streams[0].id, remoteAudio);
                }
                remoteAudio.srcObject = event.streams[0];
                audioStatus.textContent = `Audio de transmisor recibido.`;
                audioStatus.classList.remove('text-red-600', 'text-yellow-700');
                audioStatus.classList.add('text-green-600');
            }
        };

        // Escuchar por la oferta del transmisor
        onSnapshot(roomRef, async (snapshot) => {
            const data = snapshot.data();
            if (data && data.offer && !peerConnection.currentRemoteDescription) {
                console.log('Received offer from broadcaster:', data.offer);
                const offerDescription = new RTCSessionDescription(data.offer);
                await peerConnection.setRemoteDescription(offerDescription);
                audioStatus.textContent = 'Oferta de transmisor recibida. Creando respuesta...';

                // 2. Crear Respuesta (Answer)
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log('Created and set local answer:', answer);

                // Guardar la respuesta en Firestore
                await updateDoc(roomRef, {
                    answer: {
                        type: answer.type,
                        sdp: answer.sdp
                    }
                });
                audioStatus.textContent = 'Respuesta enviada. Conectando...';
            }
        });

        // Escuchar por candidatos ICE del transmisor
        onSnapshot(offerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    console.log('Listener adding remote ICE candidate:', candidate);
                    await peerConnection.addIceCandidate(candidate);
                }
            });
        });

        // Ocultar el botón de iniciar transmisión para el oyente
        startStreamBtn.classList.add('hidden');
        shareLinkText.textContent = 'Estás escuchando la transmisión de:';
        shareLink.href = window.location.href; // Mostrar el mismo enlace de sala
        shareLink.textContent = roomId; // Mostrar el ID de la sala a la que se unió
        stopStreamBtn.classList.remove('hidden');


    } catch (err) {
        console.error('Error al unirse a la sala WebRTC:', err);
        audioStatus.textContent = `Error al unirse a la sala: ${err.message}.`;
        audioStatus.classList.remove('text-green-600', 'text-yellow-700');
        audioStatus.classList.add('text-red-600');
        stopWebRTCTransmission(); // Limpiar si hay un error
    }
}

// Función para detener la transmisión/conexión WebRTC
async function stopWebRTCTransmission() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Limpiar elementos de audio remotos
    remoteAudioElements.forEach(audioEl => audioEl.remove());
    remoteAudioElements.clear();
    remoteAudioContainer.classList.add('hidden');
    noRemoteAudioMessage.classList.remove('hidden');

    // Limpiar datos de la sala en Firestore si era el transmisor
    if (isBroadcaster && currentRoomId) {
        try {
            const roomDocRef = doc(db, 'webrtc_rooms', currentRoomId);
            const offerCandidatesCollectionRef = collection(roomDocRef, 'offerCandidates');
            const answerCandidatesCollectionRef = collection(roomDocRef, 'answerCandidates');

            // Eliminar candidatos
            const offerCandidatesSnapshot = await getDocs(offerCandidatesCollectionRef);
            offerCandidatesSnapshot.forEach(d => deleteDoc(d.ref));
            const answerCandidatesSnapshot = await getDocs(answerCandidatesCollectionRef);
            answerCandidatesSnapshot.forEach(d => deleteDoc(d.ref));

            // Eliminar el documento de la sala
            await deleteDoc(roomDocRef);
            console.log('Room data cleaned up from Firestore.');
        } catch (e) {
            console.error('Error cleaning up room data:', e);
        }
    }

    currentRoomId = null;
    isBroadcaster = false;

    startStreamBtn.classList.remove('hidden');
    stopStreamBtn.classList.add('hidden');
    audioStatus.textContent = 'Transmisión/Conexión detenida.';
    audioStatus.classList.remove('text-green-600', 'text-red-600');
    audioStatus.classList.add('text-gray-600');

    // Restaurar el texto del enlace para compartir
    shareLinkText.textContent = 'Comparte este enlace para que otros se unan:';
    shareLink.href = '#';
    shareLink.textContent = 'Enlace de sala (se generará al iniciar transmisión)';
}

startStreamBtn.addEventListener('click', startWebRTCTransmission);
stopStreamBtn.addEventListener('click', stopWebRTCTransmission);

// --- Lógica del Chat en Vivo con Firebase Firestore ---

// Referencia a la colección de mensajes en Firestore
const messagesRef = collection(db, "chatMessages");

// Escuchar mensajes en tiempo real
// Nota: 'orderBy' requiere que configures un índice en Firebase Firestore para 'timestamp'
// Si ves errores en la consola sobre índices, ve a la consola de Firebase -> Firestore Database -> Índices
// y crea un índice para la colección 'chatMessages' en el campo 'timestamp' (ascendente).
const q = query(messagesRef, orderBy("timestamp", "asc"));
onSnapshot(q, (snapshot) => {
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
            await addDoc(messagesRef, {
                userId: userId, // Usamos el ID de usuario generado
                username: `Usuario ${userId.substring(5, 10)}`, // Un nombre de usuario simple para mostrar
                text: messageText,
                timestamp: FieldValue.serverTimestamp() // Usamos FieldValue.serverTimestamp()
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

// Manejo de URL para unirse a una "sala" como oyente
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        // Si hay un parámetro 'room' en la URL, intentamos unirnos como oyente
        privateAccessSection.classList.add('hidden'); // Ocultar sección de acceso privado
        audioTransmissionSection.classList.remove('hidden'); // Mostrar sección de audio

        // Ocultar el botón de iniciar transmisión para el oyente
        startStreamBtn.classList.add('hidden');
        shareLinkText.textContent = 'Estás escuchando la transmisión de:';
        shareLink.href = window.location.href; // Mostrar el mismo enlace de sala
        shareLink.textContent = roomParam; // Mostrar el ID de la sala a la que se unió

        joinWebRTCRoom(roomParam); // Llamar a la función para unirse a la sala WebRTC
    }
});

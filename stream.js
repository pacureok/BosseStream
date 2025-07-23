let audioStream;

async function startStreaming() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audio = new Audio();
    audio.srcObject = audioStream;
    audio.play();
    alert("Transmisión de audio iniciada (solo local por ahora)");
  } catch (err) {
    console.error("Error al acceder al micrófono:", err);
  }
}

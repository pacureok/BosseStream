function sendMessage() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (message) {
    const messagesDiv = document.getElementById("messages");
    const msgElement = document.createElement("div");
    msgElement.textContent = "Tú: " + message;
    messagesDiv.appendChild(msgElement);
    input.value = "";
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

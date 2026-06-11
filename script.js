const WEBHOOK_URL = "https://n8n-n8n.albmno.easypanel.host/webhook/agente-victor";

async function sendMessage() {
  const input = document.getElementById("userInput");
  const messages = document.getElementById("chatMessages");
  const text = input.value.trim();

  if (!text) return;

  appendMessage("user", text);
  input.value = "";

  const typingId = appendTyping();

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "messages.upsert",
        data: {
          key: {
            remoteJid: "web@chat",
            fromMe: false
          },
          message: {
            conversation: text
          },
          pushName: "Usuário"
        }
      })
    });

    const data = await response.json();
    removeTyping(typingId);

    console.log("RESPOSTA DO N8N:", JSON.stringify(data));

    // Extrai o texto corretamente do formato retornado pelo n8n
    const reply =
      data?.textMessage?.text ||
      data?.text ||
      data?.reply ||
      data?.output ||
      (Array.isArray(data) && data[0]?.textMessage?.text) ||
      (Array.isArray(data) && data[0]?.text) ||
      "Não consegui processar sua resposta.";

    appendMessage("bot", reply);

  } catch (error) {
    removeTyping(typingId);
    appendMessage("bot", "⚠️ Erro ao conectar. Tente novamente.");
  }
}

function appendMessage(role, text) {
  const messages = document.getElementById("chatMessages");

  const div = document.createElement("div");
  div.classList.add("message", role);

  const avatar = document.createElement("div");
  avatar.classList.add("avatar");
  avatar.textContent = role === "bot" ? "V" : "U";

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.innerHTML = text.replace(/\n/g, "<br/>");

  div.appendChild(avatar);
  div.appendChild(bubble);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function appendTyping() {
  const messages = document.getElementById("chatMessages");
  const id = "typing-" + Date.now();

  const div = document.createElement("div");
  div.classList.add("message", "bot", "typing");
  div.id = id;

  const avatar = document.createElement("div");
  avatar.classList.add("avatar");
  avatar.textContent = "V";

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = "Digitando...";

  div.appendChild(avatar);
  div.appendChild(bubble);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// Enter para enviar
document.getElementById("userInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

import express from "express";

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// Teste para saber se o servidor está online
app.get("/", (req, res) => {
  res.status(200).send("Mensagens Missionárias - servidor online");
});

// Verificação do webhook pela Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado com sucesso.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Recebimento das mensagens do WhatsApp
app.post("/webhook", (req, res) => {
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    if (message) {
      const telefone = message.from;
      const nome = contact?.profile?.name || "Sem nome";
      const texto = message.text?.body || "";

      console.log("Nova mensagem recebida:");
      console.log(`Nome: ${nome}`);
      console.log(`Telefone: ${telefone}`);
      console.log(`Mensagem: ${texto}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro ao processar webhook:", error);

    // Retornamos 200 para evitar que a Meta fique reenviando
    // o mesmo webhook por causa de um erro interno.
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});

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
  console.log("Webhook recebido:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});

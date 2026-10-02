import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DATABASE_URL = process.env.DATABASE_URL;

// ======================================================
// POSTGRESQL
// ======================================================

const pool = new Pool({
  connectionString: DATABASE_URL
});

async function inicializarBanco() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mensagens (
        id SERIAL PRIMARY KEY,
        whatsapp_message_id TEXT UNIQUE NOT NULL,
        nome TEXT,
        telefone TEXT NOT NULL,
        mensagem TEXT,
        tipo TEXT,
        recebido_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Banco de dados conectado.");
    console.log("Tabela mensagens pronta.");
  } catch (error) {
    console.error("Erro ao inicializar banco:", error);
  }
}

// ======================================================
// ENVIO DE MENSAGEM PELO WHATSAPP
// ======================================================

async function enviarMensagemWhatsApp(telefone, texto) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error(
      "WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurado."
    );
    return;
  }

  try {
    const resposta = await fetch(
      `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: telefone,
          type: "text",

          text: {
            preview_url: false,
            body: texto
          }
        })
      }
    );

    const resultado = await resposta.json();

    if (!resposta.ok) {
      console.error(
        "Erro da API do WhatsApp:",
        JSON.stringify(resultado, null, 2)
      );
      return;
    }

    console.log("Resposta enviada pelo WhatsApp.");
    console.log(
      "ID da mensagem enviada:",
      resultado?.messages?.[0]?.id || "não informado"
    );

  } catch (error) {
    console.error(
      "Erro ao enviar mensagem pelo WhatsApp:",
      error
    );
  }
}

// ======================================================
// ROTA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {
  res
    .status(200)
    .send("Mensagens Missionárias - servidor online");
});

// ======================================================
// VERIFICAÇÃO DO WEBHOOK
// ======================================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {
    console.log("Webhook verificado com sucesso.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ======================================================
// RECEBIMENTO DO WEBHOOK
// ======================================================

app.post("/webhook", async (req, res) => {

  // Confirma imediatamente o recebimento para a Meta.
  res.sendStatus(200);

  try {
    const value =
      req.body?.entry?.[0]?.changes?.[0]?.value;

    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    // Alguns webhooks são apenas atualizações de status.
    if (!message) {
      return;
    }

    const whatsappMessageId = message.id;
    const telefone = message.from;
    const nome =
      contact?.profile?.name || "Sem nome";

    const tipo =
      message.type || "desconhecido";

    let texto = "";

    if (message.type === "text") {
      texto = message.text?.body || "";
    }

    console.log("Nova mensagem recebida:");
    console.log(`Nome: ${nome}`);
    console.log(`Telefone: ${telefone}`);
    console.log(`Mensagem: ${texto}`);
    console.log(`Tipo: ${tipo}`);

    // ==================================================
    // SALVAR NO POSTGRESQL
    // ==================================================

    const resultadoBanco = await pool.query(
      `
      INSERT INTO mensagens
      (
        whatsapp_message_id,
        nome,
        telefone,
        mensagem,
        tipo
      )

      VALUES ($1, $2, $3, $4, $5)

      ON CONFLICT (whatsapp_message_id)
      DO NOTHING

      RETURNING id
      `,
      [
        whatsappMessageId,
        nome,
        telefone,
        texto,
        tipo
      ]
    );

    // Se não inseriu, provavelmente é reenvio do webhook.
    if (resultadoBanco.rowCount === 0) {
      console.log(
        "Mensagem já processada anteriormente."
      );
      return;
    }

    console.log("Mensagem salva no banco de dados.");

    // ==================================================
    // RESPOSTA AUTOMÁTICA
    // ==================================================

    if (message.type === "text") {

      const respostaAutomatica =
        `Olá, ${nome}! 👋\n\n` +
        `Recebemos sua mensagem no Mensagens Missionárias.\n\n` +
        `Obrigado por entrar em contato conosco. 🙏`;

      await enviarMensagemWhatsApp(
        telefone,
        respostaAutomatica
      );
    }

  } catch (error) {
    console.error(
      "Erro ao processar webhook:",
      error
    );
  }
});

// ======================================================
// INICIALIZAÇÃO
// ======================================================

async function iniciarServidor() {
  await inicializarBanco();

  app.listen(PORT, () => {
    console.log(
      `Servidor iniciado na porta ${PORT}`
    );
  });
}

iniciarServidor();

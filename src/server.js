import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

// ======================================================
// BANCO DE DADOS POSTGRESQL
// ======================================================

const pool = new Pool({
  connectionString: DATABASE_URL
});

// Cria a tabela automaticamente caso ainda não exista
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
    console.error("Erro ao inicializar banco de dados:", error);
  }
}

// ======================================================
// ROTA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {
  res.status(200).send("Mensagens Missionárias - servidor online");
});

// ======================================================
// VERIFICAÇÃO DO WEBHOOK PELA META
// ======================================================

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

// ======================================================
// RECEBIMENTO DAS MENSAGENS DO WHATSAPP
// ======================================================

app.post("/webhook", async (req, res) => {
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    if (message) {
      const whatsappMessageId = message.id;
      const telefone = message.from;
      const nome = contact?.profile?.name || "Sem nome";

      const tipo = message.type || "desconhecido";

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
      // SALVA NO POSTGRESQL
      // ==================================================

      try {
        await pool.query(
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
          `,
          [
            whatsappMessageId,
            nome,
            telefone,
            texto,
            tipo
          ]
        );

        console.log("Mensagem salva no banco de dados.");
      } catch (dbError) {
        console.error(
          "Erro ao salvar mensagem no banco:",
          dbError
        );
      }
    }

    // Responde rapidamente para a Meta
    res.sendStatus(200);

  } catch (error) {
    console.error(
      "Erro ao processar webhook:",
      error
    );

    // Evita reenvios contínuos do webhook pela Meta
    res.sendStatus(200);
  }
});

// ======================================================
// INICIALIZAÇÃO DO SERVIDOR
// ======================================================

async function iniciarServidor() {
  await inicializarBanco();

  app.listen(PORT, () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
  });
}

iniciarServidor();

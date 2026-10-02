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
    // Mensagens recebidas pelo WhatsApp
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

    // Missionários cadastrados pelo administrador
    await pool.query(`
      CREATE TABLE IF NOT EXISTS missionarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT,
        telefone TEXT UNIQUE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Banco de dados conectado.");
    console.log("Tabela mensagens pronta.");
    console.log("Tabela missionarios pronta.");

  } catch (error) {
    console.error("Erro ao inicializar banco:", error);
  }
}

// ======================================================
// ENVIO PELO WHATSAPP
// ======================================================

async function enviarMensagemWhatsApp(telefone, texto) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error(
      "WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurado."
    );
    return false;
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
      return false;
    }

    console.log("Resposta enviada pelo WhatsApp.");
    console.log(
      "ID da mensagem enviada:",
      resultado?.messages?.[0]?.id || "não informado"
    );

    return true;

  } catch (error) {
    console.error(
      "Erro ao enviar mensagem pelo WhatsApp:",
      error
    );

    return false;
  }
}

// ======================================================
// PÁGINA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {
  res.status(200).send(
    "Mensagens Missionárias - servidor online"
  );
});

// ======================================================
// API - LISTAR MISSIONÁRIOS
// ======================================================

app.get("/missionarios", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        id,
        nome,
        email,
        telefone,
        ativo,
        criado_em
      FROM missionarios
      ORDER BY nome ASC
    `);

    res.json(resultado.rows);

  } catch (error) {
    console.error(
      "Erro ao listar missionários:",
      error
    );

    res.status(500).json({
      erro: "Erro ao listar missionários."
    });
  }
});

// ======================================================
// API - CADASTRAR MISSIONÁRIO
// ======================================================

app.post("/missionarios", async (req, res) => {
  try {
    const {
      nome,
      email,
      telefone
    } = req.body;

    if (!nome || nome.trim() === "") {
      return res.status(400).json({
        erro: "O nome do missionário é obrigatório."
      });
    }

    if (!email && !telefone) {
      return res.status(400).json({
        erro:
          "Informe pelo menos o e-mail ou telefone do missionário."
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO missionarios
      (
        nome,
        email,
        telefone
      )
      VALUES ($1, $2, $3)

      RETURNING
        id,
        nome,
        email,
        telefone,
        ativo,
        criado_em
      `,
      [
        nome.trim(),
        email?.trim() || null,
        telefone?.trim() || null
      ]
    );

    console.log(
      `Missionário cadastrado: ${nome}`
    );

    res.status(201).json(
      resultado.rows[0]
    );

  } catch (error) {

    // Telefone duplicado
    if (error.code === "23505") {
      return res.status(409).json({
        erro:
          "Já existe um missionário cadastrado com esse telefone."
      });
    }

    console.error(
      "Erro ao cadastrar missionário:",
      error
    );

    res.status(500).json({
      erro: "Erro ao cadastrar missionário."
    });
  }
});

// ======================================================
// API - ATIVAR / DESATIVAR MISSIONÁRIO
// ======================================================

app.patch(
  "/missionarios/:id/status",
  async (req, res) => {

    try {
      const id = req.params.id;
      const { ativo } = req.body;

      if (typeof ativo !== "boolean") {
        return res.status(400).json({
          erro:
            "O campo ativo deve ser true ou false."
        });
      }

      const resultado = await pool.query(
        `
        UPDATE missionarios
        SET ativo = $1
        WHERE id = $2

        RETURNING
          id,
          nome,
          email,
          telefone,
          ativo
        `,
        [ativo, id]
      );

      if (resultado.rowCount === 0) {
        return res.status(404).json({
          erro: "Missionário não encontrado."
        });
      }

      res.json(resultado.rows[0]);

    } catch (error) {
      console.error(
        "Erro ao alterar missionário:",
        error
      );

      res.status(500).json({
        erro:
          "Erro ao alterar status do missionário."
      });
    }
  }
);

// ======================================================
// VERIFICAÇÃO DO WEBHOOK DA META
// ======================================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {
    console.log(
      "Webhook verificado com sucesso."
    );

    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ======================================================
// RECEBIMENTO DAS MENSAGENS
// ======================================================

app.post("/webhook", async (req, res) => {

  // Confirma imediatamente para a Meta.
  res.sendStatus(200);

  try {
    const value =
      req.body?.entry?.[0]?.changes?.[0]?.value;

    const message =
      value?.messages?.[0];

    const contact =
      value?.contacts?.[0];

    // Eventos de status não possuem message.
    if (!message) {
      return;
    }

    const whatsappMessageId =
      message.id;

    const telefone =
      message.from;

    const nome =
      contact?.profile?.name ||
      "Sem nome";

    const tipo =
      message.type ||
      "desconhecido";

    let texto = "";

    if (message.type === "text") {
      texto =
        message.text?.body || "";
    }

    console.log(
      "Nova mensagem recebida:"
    );

    console.log(`Nome: ${nome}`);
    console.log(`Telefone: ${telefone}`);
    console.log(`Mensagem: ${texto}`);
    console.log(`Tipo: ${tipo}`);

    const resultadoBanco =
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

        ON CONFLICT
        (whatsapp_message_id)
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

    if (
      resultadoBanco.rowCount === 0
    ) {
      console.log(
        "Mensagem já processada anteriormente."
      );

      return;
    }

    console.log(
      "Mensagem salva no banco de dados."
    );

    // Mantemos a confirmação automática
    // apenas enquanto construímos o fluxo definitivo.
    if (message.type === "text") {

      const respostaAutomatica =
        `Olá, ${nome}! 👋\n\n` +
        `Sua mensagem foi recebida pelo ` +
        `Mensagens Missionárias.\n\n` +
        `Em breve você poderá selecionar ` +
        `o missionário e enviar sua mensagem.`;

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

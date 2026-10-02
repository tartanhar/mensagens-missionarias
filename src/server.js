import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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
// FUNÇÕES AUXILIARES
// ======================================================

function escaparHTML(valor = "") {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paginaHTML(conteudo, titulo = "Mensagens Missionárias") {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>${escaparHTML(titulo)}</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f4f6f8;
      color: #1f2937;
    }

    header {
      background: #173b57;
      color: white;
      padding: 24px;
    }

    header h1 {
      margin: 0;
      font-size: 26px;
    }

    header p {
      margin: 6px 0 0;
      opacity: 0.85;
    }

    main {
      max-width: 1100px;
      margin: 30px auto;
      padding: 0 20px;
    }

    .card {
      background: white;
      padding: 24px;
      margin-bottom: 24px;
      border-radius: 10px;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.08);
    }

    h2 {
      margin-top: 0;
    }

    label {
      display: block;
      margin-top: 15px;
      font-weight: bold;
    }

    input {
      width: 100%;
      padding: 11px;
      margin-top: 6px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 15px;
    }

    button {
      border: 0;
      border-radius: 6px;
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
    }

    .principal {
      margin-top: 20px;
      background: #173b57;
      color: white;
    }

    .ativar {
      background: #157347;
      color: white;
    }

    .desativar {
      background: #b42318;
      color: white;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }

    th,
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
    }

    th {
      background: #f8fafc;
    }

    .ativo {
      color: #157347;
      font-weight: bold;
    }

    .inativo {
      color: #b42318;
      font-weight: bold;
    }

    .erro {
      color: #b42318;
      font-weight: bold;
    }

    .sucesso {
      color: #157347;
      font-weight: bold;
    }

    .login {
      max-width: 450px;
      margin: 80px auto;
    }

    @media (max-width: 700px) {
      table,
      thead,
      tbody,
      th,
      td,
      tr {
        display: block;
      }

      thead {
        display: none;
      }

      tr {
        margin-bottom: 18px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px;
      }

      td {
        border: 0;
        padding: 7px;
      }
    }
  </style>
</head>

<body>

<header>
  <h1>Mensagens Missionárias</h1>
  <p>Painel administrativo</p>
</header>

<main>
  ${conteudo}
</main>

</body>
</html>
`;
}

// ======================================================
// AUTENTICAÇÃO SIMPLES DO PAINEL
// ======================================================

function verificarAdmin(req, res, next) {
  const senha =
    req.headers["x-admin-password"] ||
    req.query.senha ||
    req.body?.senha_admin;

  if (!ADMIN_PASSWORD) {
    return res.status(500).send(
      "ADMIN_PASSWORD não configurado."
    );
  }

  if (senha !== ADMIN_PASSWORD) {
    return res.status(401).send(
      paginaHTML(`
        <div class="card login">

          <h2>Acesso administrativo</h2>

          <p>
            Digite a senha do painel.
          </p>

          <form
            method="GET"
            action="/admin"
          >

            <label>
              Senha
            </label>

            <input
              type="password"
              name="senha"
              required
            >

            <button
              class="principal"
              type="submit"
            >
              Entrar
            </button>

          </form>

        </div>
      `, "Login - Mensagens Missionárias")
    );
  }

  next();
}

// ======================================================
// PÁGINA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {
  res.status(200).send(`
    Mensagens Missionárias - servidor online
  `);
});

// ======================================================
// PAINEL ADMINISTRATIVO
// ======================================================

app.get(
  "/admin",
  verificarAdmin,
  async (req, res) => {

    try {
      const resultado =
        await pool.query(`
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

      const senha =
        escaparHTML(req.query.senha || "");

      const linhas =
        resultado.rows.map(
          (missionario) => {

            const status =
              missionario.ativo
                ? `<span class="ativo">Ativo</span>`
                : `<span class="inativo">Inativo</span>`;

            const novoStatus =
              !missionario.ativo;

            const classeBotao =
              missionario.ativo
                ? "desativar"
                : "ativar";

            const textoBotao =
              missionario.ativo
                ? "Desativar"
                : "Ativar";

            return `
              <tr>

                <td>
                  ${missionario.id}
                </td>

                <td>
                  ${escaparHTML(
                    missionario.nome
                  )}
                </td>

                <td>
                  ${escaparHTML(
                    missionario.email || "-"
                  )}
                </td>

                <td>
                  ${escaparHTML(
                    missionario.telefone || "-"
                  )}
                </td>

                <td>
                  ${status}
                </td>

                <td>

                  <form
                    method="POST"
                    action="/admin/missionarios/${missionario.id}/status"
                  >

                    <input
                      type="hidden"
                      name="senha_admin"
                      value="${senha}"
                    >

                    <input
                      type="hidden"
                      name="ativo"
                      value="${novoStatus}"
                    >

                    <button
                      class="${classeBotao}"
                      type="submit"
                    >
                      ${textoBotao}
                    </button>

                  </form>

                </td>

              </tr>
            `;
          }
        )
        .join("");

      const conteudo = `

        <div class="card">

          <h2>
            Cadastrar missionário
          </h2>

          <form
            method="POST"
            action="/admin/missionarios"
          >

            <input
              type="hidden"
              name="senha_admin"
              value="${senha}"
            >

            <label>
              Nome do missionário
            </label>

            <input
              type="text"
              name="nome"
              required
            >

            <label>
              E-mail
            </label>

            <input
              type="email"
              name="email"
            >

            <label>
              WhatsApp / telefone
            </label>

            <input
              type="text"
              name="telefone"
              placeholder="5513999999999"
            >

            <button
              class="principal"
              type="submit"
            >
              Cadastrar missionário
            </button>

          </form>

        </div>

        <div class="card">

          <h2>
            Missionários cadastrados
          </h2>

          <table>

            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>

            <tbody>
              ${
                linhas ||
                `
                <tr>
                  <td colspan="6">
                    Nenhum missionário cadastrado.
                  </td>
                </tr>
                `
              }
            </tbody>

          </table>

        </div>
      `;

      res.send(
        paginaHTML(
          conteudo,
          "Painel - Mensagens Missionárias"
        )
      );

    } catch (error) {
      console.error(
        "Erro ao carregar painel:",
        error
      );

      res.status(500).send(
        "Erro ao carregar painel."
      );
    }
  }
);

// ======================================================
// CADASTRO PELO PAINEL
// ======================================================

app.post(
  "/admin/missionarios",
  verificarAdmin,
  async (req, res) => {

    try {
      const {
        nome,
        email,
        telefone,
        senha_admin
      } = req.body;

      if (!nome?.trim()) {
        return res.status(400).send(
          "Nome obrigatório."
        );
      }

      if (!email?.trim() && !telefone?.trim()) {
        return res.status(400).send(
          "Informe e-mail ou telefone."
        );
      }

      await pool.query(
        `
        INSERT INTO missionarios
        (
          nome,
          email,
          telefone
        )
        VALUES ($1, $2, $3)
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

      res.redirect(
        `/admin?senha=${encodeURIComponent(
          senha_admin
        )}`
      );

    } catch (error) {

      if (error.code === "23505") {
        return res.status(409).send(
          "Já existe um missionário com esse telefone."
        );
      }

      console.error(
        "Erro ao cadastrar missionário:",
        error
      );

      res.status(500).send(
        "Erro ao cadastrar missionário."
      );
    }
  }
);

// ======================================================
// ATIVAR / DESATIVAR PELO PAINEL
// ======================================================

app.post(
  "/admin/missionarios/:id/status",
  verificarAdmin,
  async (req, res) => {

    try {
      const id = req.params.id;

      const ativo =
        req.body.ativo === "true";

      await pool.query(
        `
        UPDATE missionarios
        SET ativo = $1
        WHERE id = $2
        `,
        [
          ativo,
          id
        ]
      );

      res.redirect(
        `/admin?senha=${encodeURIComponent(
          req.body.senha_admin
        )}`
      );

    } catch (error) {
      console.error(
        "Erro ao alterar status:",
        error
      );

      res.status(500).send(
        "Erro ao alterar missionário."
      );
    }
  }
);

// ======================================================
// WHATSAPP
// ======================================================

async function enviarMensagemWhatsApp(
  telefone,
  texto
) {

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error(
      "Configuração do WhatsApp incompleta."
    );

    return false;
  }

  try {
    const resposta =
      await fetch(
        `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            messaging_product:
              "whatsapp",

            recipient_type:
              "individual",

            to: telefone,

            type: "text",

            text: {
              preview_url: false,
              body: texto
            }
          })
        }
      );

    const resultado =
      await resposta.json();

    if (!resposta.ok) {
      console.error(
        "Erro da API do WhatsApp:",
        JSON.stringify(
          resultado,
          null,
          2
        )
      );

      return false;
    }

    console.log(
      "Mensagem enviada pelo WhatsApp."
    );

    return true;

  } catch (error) {
    console.error(
      "Erro ao enviar WhatsApp:",
      error
    );

    return false;
  }
}

// ======================================================
// VERIFICAÇÃO DO WEBHOOK
// ======================================================

app.get(
  "/webhook",
  (req, res) => {

    const mode =
      req.query["hub.mode"];

    const token =
      req.query["hub.verify_token"];

    const challenge =
      req.query["hub.challenge"];

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      console.log(
        "Webhook verificado."
      );

      return res
        .status(200)
        .send(challenge);
    }

    return res.sendStatus(403);
  }
);

// ======================================================
// RECEBIMENTO DO WHATSAPP
// ======================================================

app.post(
  "/webhook",
  async (req, res) => {

    res.sendStatus(200);

    try {
      const value =
        req.body
          ?.entry?.[0]
          ?.changes?.[0]
          ?.value;

      const message =
        value?.messages?.[0];

      const contact =
        value?.contacts?.[0];

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

      if (tipo === "text") {
        texto =
          message.text?.body || "";
      }

      const resultado =
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

          VALUES
          ($1, $2, $3, $4, $5)

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

      if (resultado.rowCount === 0) {
        return;
      }

      console.log(
        "Mensagem salva no banco de dados."
      );

      if (tipo === "text") {

        const resposta =
          `Olá, ${nome}! 👋\n\n` +
          `Bem-vindo ao Mensagens Missionárias.\n\n` +
          `Em breve você poderá escolher o missionário e enviar sua mensagem.`;

        await enviarMensagemWhatsApp(
          telefone,
          resposta
        );
      }

    } catch (error) {
      console.error(
        "Erro no webhook:",
        error
      );
    }
  }
);

// ======================================================
// INICIALIZAÇÃO
// ======================================================

async function iniciarServidor() {

  await inicializarBanco();

  app.listen(
    PORT,
    () => {

      console.log(
        `Servidor iniciado na porta ${PORT}`
      );

    }
  );
}

iniciarServidor();

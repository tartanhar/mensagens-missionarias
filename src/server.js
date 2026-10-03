import express from "express";
import pg from "pg";
import cron from "node-cron";
import crypto from "crypto";
import { Resend } from "resend";

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
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const WEEKLY_CRON = process.env.WEEKLY_CRON || "0 6 * * 1";
const TIMEZONE = process.env.TIMEZONE || "America/Sao_Paulo";

const resend = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

const pool = new Pool({
  connectionString: DATABASE_URL
});

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

function escaparHTML(valor = "") {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function paginaHTML(
  conteudo,
  titulo = "Mensagens Missionárias"
) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    ${escaparHTML(titulo)}
  </title>

  <style>

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: #f3f4f6;
      color: #1f2937;
    }

    header {
      background: #111827;
      color: white;
      padding: 20px;
    }

    header .topo {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }

    header h1 {
      margin: 0;
      font-size: 24px;
    }

    header p {
      margin: 5px 0 0;
      color: #d1d5db;
    }

    main {
      max-width: 1200px;
      margin: 30px auto;
      padding: 0 20px;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 25px;
      box-shadow: 0 3px 12px rgba(0,0,0,0.08);
    }

    .card h2 {
      margin-top: 0;
      color: #111827;
    }

    .login {
      max-width: 450px;
      margin: 80px auto;
    }

    label {
      display: block;
      font-weight: bold;
      margin: 15px 0 7px;
    }

    input,
    textarea,
    select {
      width: 100%;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 16px;
    }

    textarea {
      min-height: 120px;
      resize: vertical;
    }

    button,
    .botao {
      display: inline-block;
      border: 0;
      border-radius: 8px;
      padding: 11px 16px;
      background: #2563eb;
      color: white;
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
      text-decoration: none;
      margin: 4px;
    }

    button:hover,
    .botao:hover {
      opacity: 0.9;
    }

    .botao-verde {
      background: #16a34a;
    }

    .botao-vermelho {
      background: #dc2626;
    }

    .botao-cinza {
      background: #4b5563;
    }

    .botao-amarelo {
      background: #d97706;
    }

    .login-button {
      width: 100%;
      margin: 20px 0 0;
    }

    .erro {
      background: #fee2e2;
      color: #991b1b;
      padding: 15px;
      border-radius: 8px;
      margin: 15px 0;
    }

    .sucesso {
      background: #dcfce7;
      color: #166534;
      padding: 15px;
      border-radius: 8px;
      margin: 15px 0;
    }

    .aviso {
      background: #fef3c7;
      color: #92400e;
      padding: 15px;
      border-radius: 8px;
      margin: 15px 0;
    }

    .estatisticas {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 25px;
    }

    .estatistica {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 3px 12px rgba(0,0,0,0.08);
    }

    .estatistica strong {
      display: block;
      font-size: 32px;
      margin-top: 8px;
    }

    .pendente {
      color: #d97706;
      font-weight: bold;
    }

    .enviada {
      color: #16a34a;
      font-weight: bold;
    }

    .ativo {
      color: #16a34a;
      font-weight: bold;
    }

    .inativo {
      color: #dc2626;
      font-weight: bold;
    }

    .tabela-container {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 700px;
    }

    th,
    td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }

    th {
      background: #f9fafb;
    }

    .acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .acoes form {
      margin: 0;
    }

    .centralizado {
      text-align: center;
    }

    .home {
      text-align: center;
      max-width: 700px;
      margin: 80px auto;
    }

    .home h1 {
      font-size: 34px;
    }

    .home .botao {
      margin-top: 20px;
      font-size: 17px;
      padding: 14px 25px;
    }

    footer {
      text-align: center;
      color: #6b7280;
      padding: 30px;
      font-size: 14px;
    }

    .cabecalho-painel {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;
      flex-wrap: wrap;
    }

    @media (max-width: 800px) {

      .estatisticas {
        grid-template-columns: repeat(2, 1fr);
      }

    }

    @media (max-width: 500px) {

      .estatisticas {
        grid-template-columns: 1fr;
      }

      main {
        padding: 0 10px;
      }

      .card {
        padding: 18px;
      }

      header .topo {
        flex-direction: column;
        align-items: flex-start;
      }

    }

  </style>

</head>

<body>

  <header>

    <div class="topo">

      <div>

        <h1>
          Mensagens Missionárias
        </h1>

        <p>
          Painel administrativo
        </p>

      </div>

    </div>

  </header>

  <main>

    ${conteudo}

  </main>

  <footer>

    Mensagens Missionárias

  </footer>

</body>

</html>
`;
}

// ======================================================
// AUTENTICAÇÃO DO ADMIN
// ======================================================

function criarTokenAdmin() {

  return crypto
    .createHmac(
      "sha256",
      ADMIN_PASSWORD || ""
    )
    .update(
      "mensagens-missionarias-admin"
    )
    .digest("hex");
}

function obterCookies(req) {

  const cabecalho =
    req.headers.cookie || "";

  const cookies = {};

  if (!cabecalho) {
    return cookies;
  }

  cabecalho
    .split(";")
    .forEach((item) => {

      const partes =
        item.trim().split("=");

      if (partes.length >= 2) {

        const nome =
          partes.shift();

        const valor =
          partes.join("=");

        try {

          cookies[nome] =
            decodeURIComponent(valor);

        } catch {

          cookies[nome] = valor;

        }

      }

    });

  return cookies;
}

function usuarioEstaAutenticado(req) {

  if (!ADMIN_PASSWORD) {
    return false;
  }

  const cookies =
    obterCookies(req);

  const token =
    cookies.admin_session;

  if (!token) {
    return false;
  }

  const tokenEsperado =
    criarTokenAdmin();

  try {

    const tokenBuffer =
      Buffer.from(token);

    const esperadoBuffer =
      Buffer.from(tokenEsperado);

    if (
      tokenBuffer.length !==
      esperadoBuffer.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      tokenBuffer,
      esperadoBuffer
    );

  } catch {

    return false;

  }
}

function enviarCookieLogin(res) {

  const token =
    criarTokenAdmin();

  res.setHeader(
    "Set-Cookie",
    `admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Max-Age=28800; Path=/; Secure`
  );
}

function apagarCookieLogin(res) {

  res.setHeader(
    "Set-Cookie",
    "admin_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/; Secure"
  );
}

function paginaLogin(
  mensagem = ""
) {

  return paginaHTML(
    `
    <div class="card login">

      <h2>
        🔐 Acesso administrativo
      </h2>

      <p>
        Digite a senha para acessar o painel do
        <strong>Mensagens Missionárias</strong>.
      </p>

      ${
        mensagem
          ? `
            <div class="erro">
              ${escaparHTML(mensagem)}
            </div>
          `
          : ""
      }

      <form
        method="POST"
        action="/admin/login"
      >

        <label for="senha">
          Senha
        </label>

        <input
          id="senha"
          type="password"
          name="senha"
          autocomplete="current-password"
          required
        >

        <button
          class="login-button"
          type="submit"
        >
          Entrar no painel
        </button>

      </form>

    </div>
    `,
    "Login - Mensagens Missionárias"
  );
}

function verificarAdmin(
  req,
  res,
  next
) {

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );

  if (!ADMIN_PASSWORD) {

    return res.status(500).send(
      paginaHTML(
        `
        <div class="card">

          <h2>
            ⚠️ Erro de configuração
          </h2>

          <div class="erro">

            A variável
            <strong>ADMIN_PASSWORD</strong>
            não está configurada no Render.

          </div>

          <p>
            Cadastre a variável ADMIN_PASSWORD
            nas variáveis de ambiente do serviço.
          </p>

        </div>
        `,
        "Erro - Mensagens Missionárias"
      )
    );
  }

  if (
    !usuarioEstaAutenticado(req)
  ) {

    return res.status(401).send(
      paginaLogin()
    );
  }

  next();
}

// ======================================================
// BANCO DE DADOS
// ======================================================

async function inicializarBanco() {

  if (!DATABASE_URL) {

    throw new Error(
      "DATABASE_URL não está configurada."
    );

  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mensagens (
      id SERIAL PRIMARY KEY,
      telefone VARCHAR(30),
      mensagem TEXT,
      whatsapp_message_id VARCHAR(255),
      recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log(
    "Tabela mensagens pronta."
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS missionarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL,
      ativo BOOLEAN DEFAULT TRUE,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log(
    "Tabela missionarios pronta."
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversas (
      id SERIAL PRIMARY KEY,
      telefone VARCHAR(30) UNIQUE NOT NULL,
      etapa VARCHAR(50) NOT NULL DEFAULT 'INICIO',
      missionario_id INTEGER REFERENCES missionarios(id),
      nome_familia VARCHAR(150),
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log(
    "Tabela conversas pronta."
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mensagens_missionarios (
      id SERIAL PRIMARY KEY,
      telefone VARCHAR(30),
      missionario_id INTEGER REFERENCES missionarios(id),
      nome_familia VARCHAR(150),
      mensagem TEXT NOT NULL,
      status VARCHAR(30) DEFAULT 'PENDENTE',
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      enviado_em TIMESTAMP
    )
  `);

  console.log(
    "Tabela mensagens_missionarios pronta."
  );

  // ====================================================
  // CORREÇÃO DE BANCO EXISTENTE
  // ====================================================
  // A tabela pode ter sido criada em uma versão anterior
  // do sistema sem a coluna telefone.
  //
  // CREATE TABLE IF NOT EXISTS não altera uma tabela
  // que já existe. Por isso fazemos a correção aqui.
  // ====================================================

  await pool.query(`
    ALTER TABLE mensagens_missionarios
    ADD COLUMN IF NOT EXISTS telefone VARCHAR(30)
  `);

  console.log(
    "Coluna telefone verificada em mensagens_missionarios."
  );

  console.log(
    "Banco de dados conectado."
  );

  if (resend) {

    console.log(
      "Resend configurado."
    );

  } else {

    console.log(
      "AVISO: RESEND_API_KEY não configurada."
    );

  }
}

// ======================================================
// WHATSAPP
// ======================================================

async function enviarMensagemWhatsApp(
  telefone,
  texto
) {

  if (
    !WHATSAPP_TOKEN ||
    !PHONE_NUMBER_ID
  ) {

    console.error(
      "WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurado."
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

    const dados =
      await resposta.json();

    if (!resposta.ok) {

      console.error(
        "Erro WhatsApp:",
        JSON.stringify(
          dados,
          null,
          2
        )
      );

      return false;
    }

    console.log(
      "Mensagem enviada pelo WhatsApp com sucesso."
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
// CONVERSAS
// ======================================================

async function obterConversa(
  telefone
) {

  const resultado =
    await pool.query(
      `
      SELECT *
      FROM conversas
      WHERE telefone = $1
      `,
      [telefone]
    );

  return (
    resultado.rows[0] ||
    null
  );
}

async function salvarEtapa(
  telefone,
  etapa,
  missionarioId = null,
  nomeFamilia = null
) {

  await pool.query(
    `
    INSERT INTO conversas
    (
      telefone,
      etapa,
      missionario_id,
      nome_familia,
      atualizado_em
    )
    VALUES
    (
      $1,
      $2,
      $3,
      $4,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT (telefone)

    DO UPDATE SET

      etapa =
        EXCLUDED.etapa,

      missionario_id =
        EXCLUDED.missionario_id,

      nome_familia =
        EXCLUDED.nome_familia,

      atualizado_em =
        CURRENT_TIMESTAMP
    `,
    [
      telefone,
      etapa,
      missionarioId,
      nomeFamilia
    ]
  );
}

async function enviarMenuMissionarios(
  telefone
) {

  const resultado =
    await pool.query(`
      SELECT
        id,
        nome
      FROM missionarios
      WHERE ativo = TRUE
      ORDER BY nome ASC
    `);

  if (
    resultado.rows.length === 0
  ) {

    await enviarMensagemWhatsApp(
      telefone,
      "No momento não há missionários disponíveis para receber mensagens."
    );

    return;
  }

  await salvarEtapa(
    telefone,
    "AGUARDANDO_MISSIONARIO"
  );

  if (
    resultado.rows.length > 10
  ) {

    let texto =
      "Escolha o missionário digitando o número correspondente:\n\n";

    resultado.rows.forEach(
      (missionario, indice) => {

        texto +=
          `${indice + 1} - ${missionario.nome}\n`;

      }
    );

    await enviarMensagemWhatsApp(
      telefone,
      texto
    );

    return;
  }

  const rows =
    resultado.rows.map(
      (missionario) => ({

        id:
          `missionario_${missionario.id}`,

        title:
          missionario.nome
            .substring(0, 24),

        description:
          "Enviar uma mensagem"

      })
    );

  const payload = {

    messaging_product:
      "whatsapp",

    recipient_type:
      "individual",

    to: telefone,

    type:
      "interactive",

    interactive: {

      type:
        "list",

      body: {

        text:
          "Para qual missionário você deseja enviar a mensagem?"

      },

      action: {

        button:
          "Escolher missionário",

        sections: [
          {
            title:
              "Missionários",

            rows
          }
        ]

      }

    }

  };

  try {

    const resposta =
      await fetch(
        `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`,
        {

          method:
            "POST",

          headers: {

            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify(payload)

        }
      );

    const dados =
      await resposta.json();

    if (!resposta.ok) {

      console.error(
        "Erro ao enviar menu:",
        JSON.stringify(
          dados,
          null,
          2
        )
      );

      await enviarMensagemWhatsApp(
        telefone,
        "Não consegui apresentar a lista. Digite o número do missionário."
      );
    }

  } catch (error) {

    console.error(
      "Erro no menu:",
      error
    );

    await enviarMensagemWhatsApp(
      telefone,
      "Ocorreu um erro. Digite MENU para tentar novamente."
    );
  }
}

// ======================================================
// PROCESSAMENTO DA CONVERSA
// ======================================================

async function processarConversa(
  telefone,
  texto,
  whatsappMessageId,
  missionarioSelecionadoId = null
) {

  try {

    console.log(
      "===================================="
    );

    console.log(
      "PROCESSANDO CONVERSA"
    );

    console.log(
      "Telefone:",
      telefone
    );

    console.log(
      "Texto:",
      texto
    );

    console.log(
      "ID WhatsApp:",
      whatsappMessageId
    );

    console.log(
      "Missionário selecionado:",
      missionarioSelecionadoId
    );

    console.log(
      "===================================="
    );

    const textoNormalizado =
      String(texto || "")
        .trim()
        .toLowerCase();

    let conversa =
      await obterConversa(
        telefone
      );

    console.log(
      "Conversa encontrada:",
      conversa
    );

    // ==================================================
    // MENU
    // ==================================================

    if (
      textoNormalizado === "inicio" ||
      textoNormalizado === "início" ||
      textoNormalizado === "menu"
    ) {

      await enviarMensagemWhatsApp(
        telefone,
        "Olá! 👋\n\nBem-vindo ao Mensagens Missionárias.\n\nVou ajudar você a enviar uma mensagem para um missionário."
      );

      await enviarMenuMissionarios(
        telefone
      );

      return;
    }

    // ==================================================
    // NOVA CONVERSA
    // ==================================================

    if (!conversa) {

      await salvarEtapa(
        telefone,
        "AGUARDANDO_MISSIONARIO"
      );

      await enviarMensagemWhatsApp(
        telefone,
        "Olá! 👋\n\nVamos enviar uma mensagem para um missionário."
      );

      await enviarMenuMissionarios(
        telefone
      );

      return;
    }

    // ==================================================
    // ESCOLHA DO MISSIONÁRIO
    // ==================================================

    if (
      conversa.etapa ===
      "AGUARDANDO_MISSIONARIO"
    ) {

      let missionarioId =
        missionarioSelecionadoId;

      if (!missionarioId) {

        const numero =
          Number.parseInt(
            textoNormalizado,
            10
          );

        if (
          Number.isInteger(numero) &&
          numero > 0
        ) {

          const resultado =
            await pool.query(`
              SELECT
                id
              FROM missionarios
              WHERE ativo = TRUE
              ORDER BY nome ASC
            `);

          if (
            numero <=
            resultado.rows.length
          ) {

            missionarioId =
              resultado.rows[
                numero - 1
              ].id;

          }

        }

      }

      if (!missionarioId) {

        await enviarMensagemWhatsApp(
          telefone,
          "Não consegui identificar o missionário.\n\nDigite MENU para escolher novamente."
        );

        return;
      }

      const missionario =
        await pool.query(
          `
          SELECT
            id,
            nome
          FROM missionarios
          WHERE id = $1
            AND ativo = TRUE
          `,
          [missionarioId]
        );

      if (
        missionario.rows.length === 0
      ) {

        await enviarMensagemWhatsApp(
          telefone,
          "Esse missionário não está disponível."
        );

        await enviarMenuMissionarios(
          telefone
        );

        return;
      }

      await salvarEtapa(
        telefone,
        "AGUARDANDO_FAMILIA",
        missionarioId,
        null
      );

      console.log(
        "Missionário selecionado:",
        missionario.rows[0].nome
      );

      await enviarMensagemWhatsApp(
        telefone,
        `Você escolheu o missionário ${missionario.rows[0].nome}.\n\nAgora informe o nome da família que está enviando a mensagem.`
      );

      return;
    }

    // ==================================================
    // NOME DA FAMÍLIA
    // ==================================================

    if (
      conversa.etapa ===
      "AGUARDANDO_FAMILIA"
    ) {

      const nomeFamilia =
        String(texto || "")
          .trim();

      if (!nomeFamilia) {

        await enviarMensagemWhatsApp(
          telefone,
          "Por favor, informe o nome da família."
        );

        return;
      }

      if (
        !conversa.missionario_id
      ) {

        console.error(
          "ERRO: conversa sem missionario_id"
        );

        await enviarMensagemWhatsApp(
          telefone,
          "Ocorreu um problema com a escolha do missionário. Digite MENU para começar novamente."
        );

        return;
      }

      await salvarEtapa(
        telefone,
        "AGUARDANDO_MENSAGEM",
        conversa.missionario_id,
        nomeFamilia
      );

      console.log(
        "Nome da família salvo:",
        nomeFamilia
      );

      await enviarMensagemWhatsApp(
        telefone,
        "Agora escreva a mensagem que deseja enviar ao missionário."
      );

      return;
    }

    // ==================================================
    // MENSAGEM FINAL
    // ==================================================

    if (
      conversa.etapa ===
      "AGUARDANDO_MENSAGEM"
    ) {

      const mensagemFinal =
        String(texto || "")
          .trim();

      console.log(
        "Recebendo mensagem final:",
        mensagemFinal
      );

      if (!mensagemFinal) {

        await enviarMensagemWhatsApp(
          telefone,
          "Por favor, escreva a mensagem."
        );

        return;
      }

      if (
        !conversa.missionario_id
      ) {

        console.error(
          "ERRO: missionario_id não encontrado na conversa."
        );

        await enviarMensagemWhatsApp(
          telefone,
          "Ocorreu um problema com o missionário selecionado. Digite MENU para começar novamente."
        );

        return;
      }

      if (
        !conversa.nome_familia
      ) {

        console.error(
          "ERRO: nome_familia não encontrado na conversa."
        );

        await enviarMensagemWhatsApp(
          telefone,
          "Ocorreu um problema com o nome da família. Digite MENU para começar novamente."
        );

        return;
      }

      console.log(
        "Gravando mensagem no banco..."
      );

      // ================================================
      // GRAVAR MENSAGEM
      // ================================================

      const resultado =
        await pool.query(
          `
          INSERT INTO mensagens_missionarios
          (
            telefone,
            missionario_id,
            nome_familia,
            mensagem,
            status
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            'PENDENTE'
          )
          RETURNING id
          `,
          [
            telefone,
            conversa.missionario_id,
            conversa.nome_familia,
            mensagemFinal
          ]
        );

      console.log(
        "Mensagem gravada com sucesso. ID:",
        resultado.rows[0]?.id
      );

      // ================================================
      // REINICIAR CONVERSA
      // ================================================

      await salvarEtapa(
        telefone,
        "INICIO",
        null,
        null
      );

      console.log(
        "Conversa reiniciada."
      );

      // ================================================
      // CONFIRMAÇÃO
      // ================================================

      const enviouConfirmacao =
        await enviarMensagemWhatsApp(
          telefone,
          "✅ Sua mensagem foi recebida com sucesso!\n\nObrigado por enviar uma mensagem ao missionário. ❤️"
        );

      console.log(
        "Confirmação enviada:",
        enviouConfirmacao
      );

      return;
    }

    // ==================================================
    // ETAPA DESCONHECIDA
    // ==================================================

    console.log(
      "Etapa desconhecida:",
      conversa.etapa
    );

    await salvarEtapa(
      telefone,
      "AGUARDANDO_MISSIONARIO",
      null,
      null
    );

    await enviarMensagemWhatsApp(
      telefone,
      "Vamos começar novamente. Escolha o missionário."
    );

    await enviarMenuMissionarios(
      telefone
    );

  } catch (error) {

    console.error(
      "===================================="
    );

    console.error(
      "ERRO AO PROCESSAR CONVERSA"
    );

    console.error(
      "Mensagem:",
      error?.message
    );

    console.error(
      "Stack:",
      error?.stack
    );

    console.error(
      "===================================="
    );

    try {

      await enviarMensagemWhatsApp(
        telefone,
        "⚠️ Ocorreu um problema ao registrar sua mensagem. Por favor, tente novamente ou digite MENU para começar novamente."
      );

    } catch (erroWhatsApp) {

      console.error(
        "Também ocorreu erro ao enviar mensagem de erro para o WhatsApp:",
        erroWhatsApp
      );

    }
  }
}

// ======================================================
// COMPILAÇÃO E E-MAIL
// ======================================================

async function enviarCompilacoesPendentes() {

  if (!resend) {

    throw new Error(
      "RESEND_API_KEY não configurada."
    );

  }

  const resultado =
    await pool.query(`
      SELECT
        mm.id,
        mm.telefone,
        mm.nome_familia,
        mm.mensagem,
        mm.criado_em,
        m.id AS missionario_id,
        m.nome AS missionario_nome,
        m.email AS missionario_email

      FROM mensagens_missionarios mm

      INNER JOIN missionarios m
        ON m.id = mm.missionario_id

      WHERE mm.status = 'PENDENTE'

      ORDER BY
        m.nome ASC,
        mm.criado_em ASC
    `);

  const mensagens =
    resultado.rows;

  if (
    mensagens.length === 0
  ) {

    return {
      missionarios: 0,
      mensagens: 0,
      semEmail: 0,
      erros: 0
    };
  }

  const grupos =
    new Map();

  for (
    const mensagem
    of mensagens
  ) {

    if (
      !grupos.has(
        mensagem.missionario_id
      )
    ) {

      grupos.set(
        mensagem.missionario_id,
        {
          missionario_id:
            mensagem.missionario_id,

          nome:
            mensagem.missionario_nome,

          email:
            mensagem.missionario_email,

          mensagens: []
        }
      );

    }

    grupos
      .get(
        mensagem.missionario_id
      )
      .mensagens
      .push(mensagem);
  }

  let totalMissionarios = 0;
  let totalMensagens = 0;
  let semEmail = 0;
  let erros = 0;

  for (
    const grupo
    of grupos.values()
  ) {

    if (!grupo.email) {

      semEmail++;

      continue;
    }

    const listaHTML =
      grupo.mensagens
        .map(
          (item) => `
            <div
              style="
                margin-bottom:20px;
                padding:15px;
                border:1px solid #ddd;
                border-radius:8px;
              "
            >

              <p>
                <strong>
                  Família:
                </strong>

                ${escaparHTML(
                  item.nome_familia
                )}
              </p>

              <p>
                ${escaparHTML(
                  item.mensagem
                )}
              </p>

              <p
                style="
                  color:#666;
                  font-size:12px;
                "
              >

                Recebida em:

                ${new Date(
                  item.criado_em
                ).toLocaleString(
                  "pt-BR",
                  {
                    timeZone:
                      TIMEZONE
                  }
                )}

              </p>

            </div>
          `
        )
        .join("");

    try {

      const resposta =
        await resend.emails.send({

          from:
            "Mensagens Missionárias <mensagens@mail.familycode.com.br>",

          to: [
            grupo.email
          ],

          subject:
            `Mensagens Missionárias - ${grupo.nome}`,

          html: `

            <div
              style="
                font-family:Arial,sans-serif;
                max-width:700px;
                margin:auto;
              "
            >

              <h1>
                Mensagens Missionárias
              </h1>

              <p>
                Olá,
                ${escaparHTML(
                  grupo.nome
                )}!
              </p>

              <p>
                Você recebeu as seguintes mensagens:
              </p>

              ${listaHTML}

              <p>
                Que estas mensagens possam levar
                carinho, fé e apoio.
              </p>

              <hr>

              <p
                style="
                  color:#777;
                  font-size:12px;
                "
              >
                Mensagens Missionárias
              </p>

            </div>

          `
        });

      if (resposta.error) {

        console.error(
          "Erro Resend:",
          resposta.error
        );

        erros++;

        continue;
      }

      const ids =
        grupo.mensagens.map(
          (item) => item.id
        );

      await pool.query(
        `
        UPDATE mensagens_missionarios
        SET
          status = 'ENVIADA',
          enviado_em = CURRENT_TIMESTAMP
        WHERE id = ANY($1::int[])
        `,
        [ids]
      );

      totalMissionarios++;

      totalMensagens +=
        grupo.mensagens.length;

    } catch (error) {

      console.error(
        "Erro ao enviar compilação:",
        error
      );

      erros++;
    }
  }

  return {
    missionarios:
      totalMissionarios,

    mensagens:
      totalMensagens,

    semEmail,

    erros
  };
}

// ======================================================
// PÁGINA INICIAL
// ======================================================

app.get(
  "/",
  (req, res) => {

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.send(
      paginaHTML(
        `
        <div class="card home">

          <h1>
            Mensagens Missionárias
          </h1>

          <p>
            Servidor online e funcionando corretamente.
          </p>

          <p>
            O sistema está preparado para receber
            mensagens pelo WhatsApp.
          </p>

          <a
            class="botao"
            href="/admin"
          >
            🔐 Entrar no painel administrativo
          </a>

        </div>
        `,
        "Mensagens Missionárias"
      )
    );
  }
);

// ======================================================
// LOGIN
// ======================================================

app.get(
  "/admin/login",
  (req, res) => {

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    if (
      usuarioEstaAutenticado(req)
    ) {

      return res.redirect(
        "/admin"
      );
    }

    res.status(200).send(
      paginaLogin()
    );
  }
);

app.post(
  "/admin/login",
  (req, res) => {

    const senha =
      String(
        req.body?.senha || ""
      );

    if (
      !ADMIN_PASSWORD
    ) {

      return res.status(500).send(
        paginaHTML(
          `
          <div class="card">

            <h2>
              Erro de configuração
            </h2>

            <div class="erro">
              ADMIN_PASSWORD não está configurada.
            </div>

          </div>
          `
        )
      );
    }

    if (
      senha !==
      ADMIN_PASSWORD
    ) {

      return res.status(401).send(
        paginaLogin(
          "Senha incorreta."
        )
      );
    }

    enviarCookieLogin(res);

    res.redirect(
      303,
      "/admin"
    );
  }
);

app.post(
  "/admin/logout",
  (req, res) => {

    apagarCookieLogin(res);

    res.redirect(
      303,
      "/admin/login"
    );
  }
);

// ======================================================
// PAINEL ADMINISTRATIVO
// ======================================================

app.get(
  "/admin",
  verificarAdmin,
  async (req, res) => {

    try {

      console.log(
        "Acessando painel administrativo..."
      );

      const inicio =
        Date.now();

      const [
        missionariosResult,
        mensagensResult,
        pendentesResult,
        enviadasResult
      ] = await Promise.all([

        pool.query(`
          SELECT
            id,
            nome,
            email,
            ativo,
            criado_em
          FROM missionarios
          ORDER BY nome ASC
        `),

        pool.query(`
          SELECT
            mm.id,
            mm.nome_familia,
            mm.mensagem,
            mm.status,
            mm.criado_em,
            mm.enviado_em,
            m.nome AS missionario_nome

          FROM mensagens_missionarios mm

          LEFT JOIN missionarios m
            ON m.id = mm.missionario_id

          ORDER BY
            mm.criado_em DESC

          LIMIT 200
        `),

        pool.query(`
          SELECT
            COUNT(*) AS total
          FROM mensagens_missionarios
          WHERE status = 'PENDENTE'
        `),

        pool.query(`
          SELECT
            COUNT(*) AS total
          FROM mensagens_missionarios
          WHERE status = 'ENVIADA'
        `)

      ]);

      const missionarios =
        missionariosResult.rows;

      const mensagens =
        mensagensResult.rows;

      const pendentes =
        Number(
          pendentesResult.rows[0]?.total ||
          0
        );

      const enviadas =
        Number(
          enviadasResult.rows[0]?.total ||
          0
        );

      console.log(
        `Painel carregado em ${Date.now() - inicio}ms.`
      );

      let html = `

        <div class="cabecalho-painel">

          <div>

            <h2>
              📊 Painel administrativo
            </h2>

            <p>
              Gerenciamento das Mensagens Missionárias.
            </p>

          </div>

          <form
            method="POST"
            action="/admin/logout"
          >

            <button
              class="botao-vermelho"
              type="submit"
            >
              Sair
            </button>

          </form>

        </div>

        <div class="estatisticas">

          <div class="estatistica">

            <span>
              Missionários
            </span>

            <strong>
              ${missionarios.length}
            </strong>

          </div>

          <div class="estatistica">

            <span>
              Mensagens pendentes
            </span>

            <strong class="pendente">
              ${pendentes}
            </strong>

          </div>

          <div class="estatistica">

            <span>
              Mensagens enviadas
            </span>

            <strong class="enviada">
              ${enviadas}
            </strong>

          </div>

          <div class="estatistica">

            <span>
              Total de mensagens
            </span>

            <strong>
              ${mensagens.length}
            </strong>

          </div>

        </div>

        <div class="card">

          <h2>
            📬 Compilação
          </h2>

          <p>
            Envie agora as mensagens pendentes
            para os respectivos missionários.
          </p>

          <form
            method="POST"
            action="/admin/enviar-compilacao"
          >

            <button
              class="botao-verde"
              type="submit"
            >
              📤 Enviar compilação
            </button>

          </form>

          <form
            method="POST"
            action="/admin/testar-email"
          >

            <button
              class="botao-amarelo"
              type="submit"
            >
              ✉️ Testar envio de e-mail
            </button>

          </form>

        </div>

        <div class="card">

          <h2>
            ➕ Cadastrar missionário
          </h2>

          <form
            method="POST"
            action="/admin/missionarios"
          >

            <label for="nome">
              Nome
            </label>

            <input
              id="nome"
              name="nome"
              required
            >

            <label for="email">
              E-mail
            </label>

            <input
              id="email"
              name="email"
              type="email"
              required
            >

            <button
              type="submit"
              class="botao-verde"
            >
              Cadastrar
            </button>

          </form>

        </div>

        <div class="card">

          <h2>
            👤 Missionários cadastrados
          </h2>

          <div class="tabela-container">

            <table>

              <thead>

                <tr>

                  <th>
                    Nome
                  </th>

                  <th>
                    E-mail
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Ações
                  </th>

                </tr>

              </thead>

              <tbody>
      `;

      if (
        missionarios.length === 0
      ) {

        html += `
          <tr>

            <td
              colspan="4"
              class="centralizado"
            >
              Nenhum missionário cadastrado.
            </td>

          </tr>
        `;

      } else {

        for (
          const missionario
          of missionarios
        ) {

          html += `

            <tr>

              <td>
                ${escaparHTML(
                  missionario.nome
                )}
              </td>

              <td>
                ${escaparHTML(
                  missionario.email
                )}
              </td>

              <td>

                ${
                  missionario.ativo
                    ? `
                      <span class="ativo">
                        ATIVO
                      </span>
                    `
                    : `
                      <span class="inativo">
                        INATIVO
                      </span>
                    `
                }

              </td>

              <td>

                <div class="acoes">

                  <a
                    class="botao botao-cinza"
                    href="/admin/missionarios/${missionario.id}/editar"
                  >
                    Editar
                  </a>

                  <form
                    method="POST"
                    action="/admin/missionarios/${missionario.id}/status"
                  >

                    <button
                      class="${
                        missionario.ativo
                          ? "botao-vermelho"
                          : "botao-verde"
                      }"
                      type="submit"
                    >

                      ${
                        missionario.ativo
                          ? "Desativar"
                          : "Ativar"
                      }

                    </button>

                  </form>

                </div>

              </td>

            </tr>

          `;
        }

      }

      html += `

              </tbody>

            </table>

          </div>

        </div>

        <div class="card">

          <h2>
            💬 Mensagens recebidas
          </h2>

          <div class="tabela-container">

            <table>

              <thead>

                <tr>

                  <th>
                    Data
                  </th>

                  <th>
                    Missionário
                  </th>

                  <th>
                    Família
                  </th>

                  <th>
                    Mensagem
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>

              <tbody>
      `;

      if (
        mensagens.length === 0
      ) {

        html += `

          <tr>

            <td
              colspan="5"
              class="centralizado"
            >
              Nenhuma mensagem recebida.
            </td>

          </tr>

        `;

      } else {

        for (
          const mensagem
          of mensagens
        ) {

          html += `

            <tr>

              <td>

                ${new Date(
                  mensagem.criado_em
                ).toLocaleString(
                  "pt-BR",
                  {
                    timeZone:
                      TIMEZONE
                  }
                )}

              </td>

              <td>

                ${escaparHTML(
                  mensagem.missionario_nome ||
                  "Não informado"
                )}

              </td>

              <td>

                ${escaparHTML(
                  mensagem.nome_familia ||
                  ""
                )}

              </td>

              <td>

                ${escaparHTML(
                  mensagem.mensagem
                )}

              </td>

              <td>

                ${
                  mensagem.status === "ENVIADA"
                    ? `
                      <span class="enviada">
                        ENVIADA
                      </span>
                    `
                    : `
                      <span class="pendente">
                        PENDENTE
                      </span>
                    `
                }

              </td>

            </tr>

          `;
        }

      }

      html += `

              </tbody>

            </table>

          </div>

        </div>

      `;

      res
        .status(200)
        .send(
          paginaHTML(
            html,
            "Painel - Mensagens Missionárias"
          )
        );

    } catch (error) {

      console.error(
        "ERRO AO CARREGAR /admin:",
        error
      );

      res
        .status(500)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ❌ Erro ao carregar o painel
              </h2>

              <div class="erro">

                <strong>
                  O servidor respondeu, mas ocorreu
                  um erro ao consultar o banco de dados.
                </strong>

              </div>

              <p>
                Detalhes técnicos:
              </p>

              <pre
                style="
                  white-space:pre-wrap;
                  background:#f3f4f6;
                  padding:15px;
                  border-radius:8px;
                  overflow:auto;
                "
              >${escaparHTML(
                error?.message ||
                String(error)
              )}</pre>

              <p>
                Verifique também os logs do Render.
              </p>

              <a
                href="/admin"
                class="botao"
              >
                Tentar novamente
              </a>

            </div>

            `,
            "Erro - Painel"
          )
        );
    }
  }
);

// ======================================================
// ENVIO MANUAL DA COMPILAÇÃO
// ======================================================

app.post(
  "/admin/enviar-compilacao",
  verificarAdmin,
  async (req, res) => {

    try {

      const resultado =
        await enviarCompilacoesPendentes();

      res
        .status(200)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ✅ Compilação concluída!
              </h2>

              <div class="sucesso">

                <strong>

                  ${resultado.mensagens}
                  mensagem(ns) enviada(s)
                  para
                  ${resultado.missionarios}
                  missionário(s).

                </strong>

              </div>

              ${
                resultado.semEmail > 0
                  ? `

                    <div class="aviso">

                      ${resultado.semEmail}
                      missionário(s) sem e-mail cadastrado.

                    </div>

                  `
                  : ""
              }

              ${
                resultado.erros > 0
                  ? `

                    <div class="erro">

                      Ocorreram
                      ${resultado.erros}
                      erro(s) durante o envio.

                    </div>

                  `
                  : ""
              }

              <a
                href="/admin"
                class="botao"
              >
                Voltar ao painel
              </a>

            </div>

            `,
            "Compilação concluída"
          )
        );

    } catch (error) {

      console.error(
        "Erro na compilação manual:",
        error
      );

      res
        .status(500)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ❌ Erro ao enviar compilação
              </h2>

              <div class="erro">

                ${escaparHTML(
                  error?.message ||
                  String(error)
                )}

              </div>

              <a
                href="/admin"
                class="botao"
              >
                Voltar ao painel
              </a>

            </div>

            `,
            "Erro"
          )
        );
    }
  }
);

// ======================================================
// TESTE DE E-MAIL
// ======================================================

app.post(
  "/admin/testar-email",
  verificarAdmin,
  async (req, res) => {

    try {

      if (!resend) {

        throw new Error(
          "RESEND_API_KEY não configurada."
        );

      }

      const emailTeste =
        process.env.TEST_EMAIL ||
        "mensagens@mail.familycode.com.br";

      const resposta =
        await resend.emails.send({

          from:
            "Mensagens Missionárias <mensagens@mail.familycode.com.br>",

          to: [
            emailTeste
          ],

          subject:
            "Teste - Mensagens Missionárias",

          html: `

            <div
              style="
                font-family:Arial,sans-serif;
              "
            >

              <h1>
                Mensagens Missionárias
              </h1>

              <p>
                Este é um e-mail de teste.
              </p>

              <p>
                O sistema de envio de e-mails
                está funcionando corretamente.
              </p>

            </div>

          `
        });

      if (resposta.error) {

        throw new Error(
          resposta.error.message ||
          JSON.stringify(
            resposta.error
          )
        );

      }

      res
        .status(200)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ✅ E-mail de teste enviado!
              </h2>

              <div class="sucesso">

                O e-mail de teste foi enviado
                com sucesso.

              </div>

              <a
                href="/admin"
                class="botao"
              >
                Voltar ao painel
              </a>

            </div>

            `,
            "Teste de e-mail"
          )
        );

    } catch (error) {

      console.error(
        "Erro no teste de e-mail:",
        error
      );

      res
        .status(500)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ❌ Erro no teste de e-mail
              </h2>

              <div class="erro">

                ${escaparHTML(
                  error?.message ||
                  String(error)
                )}

              </div>

              <a
                href="/admin"
                class="botao"
              >
                Voltar ao painel
              </a>

            </div>

            `,
            "Erro"
          )
        );
    }
  }
);

// ======================================================
// CADASTRAR MISSIONÁRIO
// ======================================================

app.post(
  "/admin/missionarios",
  verificarAdmin,
  async (req, res) => {

    try {

      const nome =
        String(
          req.body?.nome || ""
        ).trim();

      const email =
        String(
          req.body?.email || ""
        ).trim();

      if (!nome || !email) {

        throw new Error(
          "Nome e e-mail são obrigatórios."
        );

      }

      await pool.query(
        `
        INSERT INTO missionarios
        (
          nome,
          email,
          ativo
        )
        VALUES
        (
          $1,
          $2,
          TRUE
        )
        `,
        [
          nome,
          email
        ]
      );

      res.redirect(
        303,
        "/admin"
      );

    } catch (error) {

      console.error(
        "Erro ao cadastrar missionário:",
        error
      );

      res
        .status(500)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ❌ Erro ao cadastrar missionário
              </h2>

              <div class="erro">

                ${escaparHTML(
                  error?.message ||
                  String(error)
                )}

              </div>

              <a
                href="/admin"
                class="botao"
              >
                Voltar ao painel
              </a>

            </div>

            `
          )
        );
    }
  }
);

// ======================================================
// EDITAR MISSIONÁRIO
// ======================================================

app.get(
  "/admin/missionarios/:id/editar",
  verificarAdmin,
  async (req, res) => {

    try {

      const id =
        Number.parseInt(
          req.params.id,
          10
        );

      if (
        !Number.isInteger(id)
      ) {

        throw new Error(
          "ID inválido."
        );

      }

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            nome,
            email,
            ativo
          FROM missionarios
          WHERE id = $1
          `,
          [id]
        );

      if (
        resultado.rows.length === 0
      ) {

        return res
          .status(404)
          .send(
            paginaHTML(
              `

              <div class="card">

                <h2>
                  Missionário não encontrado
                </h2>

                <a
                  href="/admin"
                  class="botao"
                >
                  Voltar
                </a>

              </div>

              `
            )
          );
      }

      const missionario =
        resultado.rows[0];

      res.send(
        paginaHTML(
          `

          <div class="card">

            <h2>
              ✏️ Editar missionário
            </h2>

            <form
              method="POST"
              action="/admin/missionarios/${id}/editar"
            >

              <label for="nome">
                Nome
              </label>

              <input
                id="nome"
                name="nome"
                value="${escaparHTML(
                  missionario.nome
                )}"
                required
              >

              <label for="email">
                E-mail
              </label>

              <input
                id="email"
                name="email"
                type="email"
                value="${escaparHTML(
                  missionario.email
                )}"
                required
              >

              <button
                type="submit"
                class="botao-verde"
              >
                Salvar alterações
              </button>

              <a
                href="/admin"
                class="botao botao-cinza"
              >
                Cancelar
              </a>

            </form>

          </div>

          `,
          "Editar missionário"
        )
      );

    } catch (error) {

      console.error(
        "Erro ao abrir edição:",
        error
      );

      res
        .status(500)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ❌ Erro
              </h2>

              <div class="erro">

                ${escaparHTML(
                  error?.message ||
                  String(error)
                )}

              </div>

              <a
                href="/admin"
                class="botao"
              >
                Voltar
              </a>

            </div>

            `
          )
        );
    }
  }
);

app.post(
  "/admin/missionarios/:id/editar",
  verificarAdmin,
  async (req, res) => {

    try {

      const id =
        Number.parseInt(
          req.params.id,
          10
        );

      const nome =
        String(
          req.body?.nome || ""
        ).trim();

      const email =
        String(
          req.body?.email || ""
        ).trim();

      if (
        !Number.isInteger(id)
      ) {

        throw new Error(
          "ID inválido."
        );

      }

      if (
        !nome ||
        !email
      ) {

        throw new Error(
          "Nome e e-mail são obrigatórios."
        );

      }

      await pool.query(
        `
        UPDATE missionarios
        SET
          nome = $1,
          email = $2
        WHERE id = $3
        `,
        [
          nome,
          email,
          id
        ]
      );

      res.redirect(
        303,
        "/admin"
      );

    } catch (error) {

      console.error(
        "Erro ao editar missionário:",
        error
      );

      res
        .status(500)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ❌ Erro ao editar missionário
              </h2>

              <div class="erro">

                ${escaparHTML(
                  error?.message ||
                  String(error)
                )}

              </div>

              <a
                href="/admin"
                class="botao"
              >
                Voltar ao painel
              </a>

            </div>

            `
          )
        );
    }
  }
);

// ======================================================
// ATIVAR / DESATIVAR MISSIONÁRIO
// ======================================================

app.post(
  "/admin/missionarios/:id/status",
  verificarAdmin,
  async (req, res) => {

    try {

      const id =
        Number.parseInt(
          req.params.id,
          10
        );

      if (
        !Number.isInteger(id)
      ) {

        throw new Error(
          "ID inválido."
        );

      }

      await pool.query(
        `
        UPDATE missionarios
        SET ativo = NOT ativo
        WHERE id = $1
        `,
        [id]
      );

      res.redirect(
        303,
        "/admin"
      );

    } catch (error) {

      console.error(
        "Erro ao alterar status:",
        error
      );

      res
        .status(500)
        .send(
          paginaHTML(
            `

            <div class="card">

              <h2>
                ❌ Erro
              </h2>

              <div class="erro">

                ${escaparHTML(
                  error?.message ||
                  String(error)
                )}

              </div>

              <a
                href="/admin"
                class="botao"
              >
                Voltar
              </a>

            </div>

            `
          )
        );
    }
  }
);

import express from "express";
import pg from "pg";
import cron from "node-cron";
import { Resend } from "resend";

const { Pool } = pg;

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================================
// VARIÁVEIS DE AMBIENTE
// ======================================================

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const WEEKLY_CRON =
  process.env.WEEKLY_CRON ||
  "0 6 * * 1";

const TIMEZONE =
  process.env.TIMEZONE ||
  "America/Sao_Paulo";

// ======================================================
// RESEND
// ======================================================

const resend = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversas (
        telefone TEXT PRIMARY KEY,
        etapa TEXT NOT NULL DEFAULT 'INICIO',
        missionario_id INTEGER REFERENCES missionarios(id),
        nome_familia TEXT,
        atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mensagens_missionarios (
        id SERIAL PRIMARY KEY,
        whatsapp_message_id TEXT UNIQUE NOT NULL,
        missionario_id INTEGER NOT NULL REFERENCES missionarios(id),
        telefone_familia TEXT NOT NULL,
        nome_familia TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDENTE',
        criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        enviado_em TIMESTAMPTZ
      );
    `);

    console.log("Banco de dados conectado.");
    console.log("Tabela mensagens pronta.");
    console.log("Tabela missionarios pronta.");
    console.log("Tabela conversas pronta.");
    console.log("Tabela mensagens_missionarios pronta.");

    if (RESEND_API_KEY) {
      console.log("Resend configurado.");
    } else {
      console.log(
        "AVISO: RESEND_API_KEY não configurada."
      );
    }
  } catch (error) {
    console.error(
      "Erro ao inicializar banco:",
      error
    );

    throw error;
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
      max-width: 1200px;
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

    h2,
    h3 {
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

    button,
    .botao {
      border: 0;
      border-radius: 6px;
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      text-decoration: none;
      display: inline-block;
    }

    .principal {
      margin-top: 20px;
      background: #173b57;
      color: white;
    }

    .editar {
      background: #2563eb;
      color: white;
      margin-right: 6px;
    }

    .teste-email {
      margin-top: 10px;
      background: #2563eb;
      color: white;
    }

    .compilacao {
      margin-top: 10px;
      background: #7c3aed;
      color: white;
      font-weight: bold;
    }

    .ativar {
      background: #157347;
      color: white;
    }

    .desativar {
      background: #b42318;
      color: white;
    }

    .sucesso {
      padding: 14px;
      margin-bottom: 20px;
      border-radius: 6px;
      background: #dcfce7;
      color: #166534;
      font-weight: bold;
    }

    .erro {
      padding: 14px;
      margin-bottom: 20px;
      border-radius: 6px;
      background: #fee2e2;
      color: #991b1b;
      font-weight: bold;
    }

    .aviso {
      padding: 14px;
      margin-bottom: 20px;
      border-radius: 6px;
      background: #fef3c7;
      color: #92400e;
      font-weight: bold;
    }

    .info {
      padding: 14px;
      border-radius: 6px;
      background: #eff6ff;
      color: #1e40af;
      margin-top: 15px;
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
      vertical-align: top;
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

    .pendente {
      color: #b45309;
      font-weight: bold;
    }

    .enviada {
      color: #157347;
      font-weight: bold;
    }

    .login {
      max-width: 450px;
      margin: 80px auto;
    }

    .mensagem-texto {
      max-width: 400px;
      white-space: normal;
      line-height: 1.5;
    }

    .numero {
      font-size: 32px;
      font-weight: bold;
      color: #173b57;
      margin: 5px 0;
    }

    .estatisticas {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));
      gap: 15px;
      margin-bottom: 24px;
    }

    .estatistica {
      background: white;
      border-radius: 10px;
      padding: 20px;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .estatistica p {
      margin: 0;
      color: #64748b;
    }

    .acoes {
      white-space: nowrap;
    }

    .acoes form {
      display: inline-block;
      margin: 0;
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

  <p>
    Painel administrativo
  </p>
</header>

<main>
  ${conteudo}
</main>

</body>
</html>
`;
}

// ======================================================
// SEGURANÇA DO PAINEL
// ======================================================

function verificarAdmin(req, res, next) {
  const senha =
    req.headers["x-admin-password"] ||
    req.query.senha ||
    req.body?.senha_admin;

  if (!ADMIN_PASSWORD) {
    return res
      .status(500)
      .send(
        "ADMIN_PASSWORD não configurado."
      );
  }

  if (senha !== ADMIN_PASSWORD) {
    return res
      .status(401)
      .send(
        paginaHTML(`
          <div class="card login">

            <h2>
              Acesso administrativo
            </h2>

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
        `)
      );
  }

  next();
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
      `Mensagem enviada para ${telefone}.`
    );

    return true;
  } catch (error) {
    console.error(
      "Erro ao enviar mensagem:",
      error
    );

    return false;
  }
}

// ======================================================
// CONTROLE DA CONVERSA
// ======================================================

async function buscarConversa(telefone) {
  const resultado =
    await pool.query(
      `
      SELECT
        telefone,
        etapa,
        missionario_id,
        nome_familia
      FROM conversas
      WHERE telefone = $1
      `,
      [telefone]
    );

  return resultado.rows[0] || null;
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
      etapa = EXCLUDED.etapa,
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

async function reiniciarConversa(
  telefone
) {
  await pool.query(
    `
    DELETE FROM conversas
    WHERE telefone = $1
    `,
    [telefone]
  );
}

async function enviarListaMissionarios(
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

  let texto =
    "💙 *Mensagens Missionárias*\n\n" +
    "Para qual missionário você deseja enviar uma mensagem?\n\n";

  resultado.rows.forEach(
    (missionario, indice) => {
      texto +=
        `${indice + 1} - ${missionario.nome}\n`;
    }
  );

  texto +=
    "\nDigite somente o número correspondente ao missionário.";

  await salvarEtapa(
    telefone,
    "AGUARDANDO_MISSIONARIO"
  );

  await enviarMensagemWhatsApp(
    telefone,
    texto
  );
}

// ======================================================
// FLUXO DA FAMÍLIA
// ======================================================

async function processarConversa(
  telefone,
  texto,
  whatsappMessageId
) {
  const mensagem =
    texto.trim();

  let conversa =
    await buscarConversa(
      telefone
    );

  const comando =
    mensagem.toLowerCase();

  if (
    comando === "inicio" ||
    comando === "início" ||
    comando === "menu"
  ) {
    await reiniciarConversa(
      telefone
    );

    conversa = null;
  }

  if (!conversa) {
    await enviarMensagemWhatsApp(
      telefone,
      "Olá! 👋\n\n" +
      "Bem-vindo ao *Mensagens Missionárias*.\n\n" +
      "Aqui você pode deixar uma mensagem para um missionário."
    );

    await enviarListaMissionarios(
      telefone
    );

    return;
  }

  if (
    conversa.etapa ===
    "AGUARDANDO_MISSIONARIO"
  ) {
    const numero =
      Number.parseInt(
        mensagem,
        10
      );

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
      !Number.isInteger(numero) ||
      numero < 1 ||
      numero >
        resultado.rows.length
    ) {
      await enviarMensagemWhatsApp(
        telefone,
        "Opção inválida.\n\n" +
        "Digite somente o número correspondente ao missionário."
      );

      return;
    }

    const missionario =
      resultado.rows[
        numero - 1
      ];

    await salvarEtapa(
      telefone,
      "AGUARDANDO_FAMILIA",
      missionario.id,
      null
    );

    await enviarMensagemWhatsApp(
      telefone,
      `Você selecionou *${missionario.nome}*.\n\n` +
      "Qual é o nome da sua família?\n\n" +
      "Exemplo: Família Silva"
    );

    return;
  }

  if (
    conversa.etapa ===
    "AGUARDANDO_FAMILIA"
  ) {
    if (
      mensagem.length < 2
    ) {
      await enviarMensagemWhatsApp(
        telefone,
        "Digite o nome da sua família."
      );

      return;
    }

    await salvarEtapa(
      telefone,
      "AGUARDANDO_MENSAGEM",
      conversa.missionario_id,
      mensagem
    );

    const missionario =
      await pool.query(
        `
        SELECT nome
        FROM missionarios
        WHERE id = $1
        `,
        [
          conversa.missionario_id
        ]
      );

    await enviarMensagemWhatsApp(
      telefone,
      `${mensagem}, agora escreva sua mensagem para *${missionario.rows[0]?.nome}*.\n\n` +
      "Pode escrever normalmente em uma única mensagem."
    );

    return;
  }

  if (
    conversa.etapa ===
    "AGUARDANDO_MENSAGEM"
  ) {
    if (!mensagem) {
      await enviarMensagemWhatsApp(
        telefone,
        "A mensagem não pode ficar vazia."
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
        [
          conversa.missionario_id
        ]
      );

    if (
      missionario.rowCount === 0
    ) {
      await reiniciarConversa(
        telefone
      );

      await enviarMensagemWhatsApp(
        telefone,
        "Esse missionário não está mais disponível.\n\n" +
        "Envie *menu* para começar novamente."
      );

      return;
    }

    await pool.query(
      `
      INSERT INTO
        mensagens_missionarios
      (
        whatsapp_message_id,
        missionario_id,
        telefone_familia,
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
        $5,
        'PENDENTE'
      )

      ON CONFLICT
      (whatsapp_message_id)
      DO NOTHING
      `,
      [
        whatsappMessageId,
        conversa.missionario_id,
        telefone,
        conversa.nome_familia,
        mensagem
      ]
    );

    await reiniciarConversa(
      telefone
    );

    await enviarMensagemWhatsApp(
      telefone,
      "✅ *Mensagem recebida!*\n\n" +
      `Missionário: *${missionario.rows[0].nome}*\n` +
      `Família: *${conversa.nome_familia}*\n\n` +
      "Sua mensagem foi guardada e será incluída na próxima compilação semanal.\n\n" +
      "Obrigado por participar do *Mensagens Missionárias*. 💙\n\n" +
      "Se quiser enviar outra mensagem, digite *menu*."
    );

    console.log(
      `Mensagem destinada ao missionário ${missionario.rows[0].nome} salva com sucesso.`
    );

    return;
  }

  await reiniciarConversa(
    telefone
  );

  await enviarMensagemWhatsApp(
    telefone,
    "Vamos começar novamente.\n\n" +
    "Digite *menu*."
  );
}

// ======================================================
// COMPILAÇÃO DAS MENSAGENS
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
        mm.missionario_id,
        mm.nome_familia,
        mm.mensagem,
        mm.criado_em,
        m.nome
          AS missionario_nome,
        m.email
          AS missionario_email

      FROM mensagens_missionarios mm

      INNER JOIN missionarios m
        ON m.id =
          mm.missionario_id

      WHERE
        mm.status = 'PENDENTE'

      ORDER BY
        m.id ASC,
        mm.criado_em ASC
    `);

  if (
    resultado.rows.length === 0
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
    const item of
    resultado.rows
  ) {
    if (
      !grupos.has(
        item.missionario_id
      )
    ) {
      grupos.set(
        item.missionario_id,
        {
          id:
            item.missionario_id,

          nome:
            item.missionario_nome,

          email:
            item.missionario_email,

          mensagens: []
        }
      );
    }

    grupos
      .get(
        item.missionario_id
      )
      .mensagens
      .push(item);
  }

  let totalMissionarios = 0;
  let totalMensagens = 0;
  let totalSemEmail = 0;
  let totalErros = 0;

  for (
    const missionario of
    grupos.values()
  ) {
    if (
      !missionario.email?.trim()
    ) {
      console.log(
        `Missionário ${missionario.nome} não possui e-mail cadastrado.`
      );

      totalSemEmail++;

      continue;
    }

    const quantidade =
      missionario
        .mensagens
        .length;

    const blocosMensagens =
      missionario
        .mensagens
        .map(
          (item) => {
            const familia =
              escaparHTML(
                item.nome_familia
              );

            const mensagem =
              escaparHTML(
                item.mensagem
              )
                .replaceAll(
                  "\n",
                  "<br>"
                );

            const data =
              new Date(
                item.criado_em
              )
                .toLocaleString(
                  "pt-BR",
                  {
                    timeZone:
                      "America/Sao_Paulo"
                  }
                );

            return `
              <div
                style="
                  margin: 22px 0;
                  padding: 18px;
                  background: #f8fafc;
                  border-left: 4px solid #173b57;
                  border-radius: 6px;
                "
              >

                <p
                  style="
                    margin: 0 0 8px;
                    font-size: 17px;
                    font-weight: bold;
                    color: #173b57;
                  "
                >
                  ${familia}
                </p>

                <p
                  style="
                    margin: 0 0 12px;
                    line-height: 1.7;
                    font-size: 16px;
                  "
                >
                  ${mensagem}
                </p>

                <p
                  style="
                    margin: 0;
                    color: #64748b;
                    font-size: 12px;
                  "
                >
                  Recebida em
                  ${escaparHTML(data)}
                </p>

              </div>
            `;
          }
        )
        .join("");

    try {
      console.log(
        `Enviando compilação para ${missionario.nome} (${missionario.email})...`
      );

      const resultadoEmail =
        await resend.emails.send({
          from:
            "Mensagens Missionárias <mensagens@mail.familycode.com.br>",

          to: [
            missionario
              .email
              .trim()
          ],

          subject:
            quantidade === 1
              ? "Você recebeu uma nova mensagem - Mensagens Missionárias"
              : `Você recebeu ${quantidade} novas mensagens - Mensagens Missionárias`,

          html: `
            <div
              style="
                font-family: Arial, sans-serif;
                max-width: 650px;
                margin: 0 auto;
                color: #1f2937;
              "
            >

              <div
                style="
                  background: #173b57;
                  color: white;
                  padding: 24px;
                  border-radius: 8px 8px 0 0;
                "
              >

                <h2
                  style="
                    margin: 0;
                  "
                >
                  💙 Mensagens Missionárias
                </h2>

              </div>

              <div
                style="
                  padding: 25px;
                  border: 1px solid #e5e7eb;
                  border-top: 0;
                  border-radius: 0 0 8px 8px;
                "
              >

                <p>
                  Olá,
                  <strong>
                    ${escaparHTML(
                      missionario.nome
                    )}
                  </strong>!
                </p>

                <p>
                  ${
                    quantidade === 1
                      ? "Você recebeu uma nova mensagem de sua família."
                      : `Você recebeu <strong>${quantidade}</strong> novas mensagens de suas famílias.`
                  }
                </p>

                ${blocosMensagens}

                <p
                  style="
                    margin-top: 30px;
                  "
                >
                  Esperamos que essas
                  mensagens tragam
                  alegria e força para
                  sua missão.
                </p>

                <p>
                  Com carinho,<br>

                  <strong>
                    Mensagens Missionárias
                  </strong>
                </p>

              </div>

            </div>
          `
        });

      if (
        resultadoEmail.error
      ) {
        console.error(
          `Erro retornado pelo Resend para ${missionario.nome}:`,
          resultadoEmail.error
        );

        totalErros++;

        continue;
      }

      const ids =
        missionario
          .mensagens
          .map(
            (item) =>
              item.id
          );

      await pool.query(
        `
        UPDATE
          mensagens_missionarios

        SET
          status = 'ENVIADA',
          enviado_em =
            CURRENT_TIMESTAMP

        WHERE
          id = ANY($1::int[])
          AND status = 'PENDENTE'
        `,
        [ids]
      );

      totalMissionarios++;

      totalMensagens +=
        quantidade;

      console.log(
        `Compilação enviada para ${missionario.nome}.`
      );

      console.log(
        `${quantidade} mensagem(ns) marcada(s) como ENVIADA.`
      );
    } catch (error) {
      console.error(
        `Erro ao enviar compilação para ${missionario.nome}:`,
        error
      );

      totalErros++;
    }
  }

  return {
    missionarios:
      totalMissionarios,

    mensagens:
      totalMensagens,

    semEmail:
      totalSemEmail,

    erros:
      totalErros
  };
}

// ======================================================
// PÁGINA PRINCIPAL
// ======================================================

app.get(
  "/",
  (req, res) => {
    res
      .status(200)
      .send(
        "Mensagens Missionárias - servidor online"
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

      const resultadoMensagens =
        await pool.query(`
          SELECT
            mm.id,
            mm.nome_familia,
            mm.telefone_familia,
            mm.mensagem,
            mm.status,
            mm.criado_em,
            mm.enviado_em,
            m.nome
              AS missionario_nome

          FROM mensagens_missionarios mm

          INNER JOIN missionarios m
            ON m.id =
              mm.missionario_id

          ORDER BY
            mm.criado_em DESC
        `);

      const estatisticas =
        await pool.query(`
          SELECT

            COUNT(*)
              FILTER (
                WHERE status =
                  'PENDENTE'
              )
              AS pendentes,

            COUNT(*)
              FILTER (
                WHERE status =
                  'ENVIADA'
              )
              AS enviadas

          FROM
            mensagens_missionarios
        `);

      const senha =
        escaparHTML(
          req.query.senha || ""
        );

      let aviso = "";

      if (
        req.query.email === "ok"
      ) {
        aviso = `
          <div class="sucesso">
            E-mail de teste enviado com sucesso.
          </div>
        `;
      }

      if (
        req.query.email ===
        "erro"
      ) {
        aviso = `
          <div class="erro">
            Não foi possível enviar o e-mail de teste.
            Consulte os Logs do Render.
          </div>
        `;
      }

      if (
        req.query.editado === "ok"
      ) {
        aviso = `
          <div class="sucesso">
            Missionário atualizado com sucesso.
          </div>
        `;
      }

      if (
        req.query.compilacao ===
        "ok"
      ) {
        const totalMensagens =
          Number(
            req.query.mensagens ||
            0
          );

        const totalMissionarios =
          Number(
            req.query.missionarios ||
            0
          );

        const semEmail =
          Number(
            req.query.semEmail ||
            0
          );

        const erros =
          Number(
            req.query.erros ||
            0
          );

        aviso = `
          <div class="sucesso">

            Compilação concluída!

            <br><br>

            ${totalMensagens}
            mensagem(ns) enviada(s)
            para
            ${totalMissionarios}
            missionário(s).

            ${
              semEmail > 0
                ? `<br><br>${semEmail} missionário(s) não possui(em) e-mail cadastrado.`
                : ""
            }

            ${
              erros > 0
                ? `<br><br>${erros} envio(s) apresentou(aram) erro. As mensagens permaneceram PENDENTES.`
                : ""
            }

          </div>
        `;
      }

      if (
        req.query.compilacao ===
        "vazia"
      ) {
        aviso = `
          <div class="aviso">
            Não existem mensagens PENDENTES
            para enviar.
          </div>
        `;
      }

      if (
        req.query.compilacao ===
        "erro"
      ) {
        aviso = `
          <div class="erro">
            Ocorreu um erro ao processar
            a compilação.
            Consulte os Logs do Render.
          </div>
        `;
      }

      const linhas =
        resultado.rows
          .map(
            (missionario) => {

              const status =
                missionario.ativo
                  ? `<span class="ativo">Ativo</span>`
                  : `<span class="inativo">Inativo</span>`;

              const novoStatus =
                !missionario.ativo;

              const classe =
                missionario.ativo
                  ? "desativar"
                  : "ativar";

              const texto =
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
                      missionario.email ||
                      "-"
                    )}
                  </td>

                  <td>
                    ${escaparHTML(
                      missionario.telefone ||
                      "-"
                    )}
                  </td>

                  <td>
                    ${status}
                  </td>

                  <td class="acoes">

                    <a
                      class="botao editar"
                      href="/admin/missionarios/${missionario.id}/editar?senha=${encodeURIComponent(
                        req.query.senha || ""
                      )}"
                    >
                      Editar
                    </a>

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
                        class="${classe}"
                        type="submit"
                      >
                        ${texto}
                      </button>

                    </form>

                  </td>

                </tr>
              `;
            }
          )
          .join("");

      const linhasMensagens =
        resultadoMensagens.rows
          .map(
            (item) => {

              const data =
                new Date(
                  item.criado_em
                )
                  .toLocaleString(
                    "pt-BR",
                    {
                      timeZone:
                        "America/Sao_Paulo"
                    }
                  );

              let classeStatus =
                "pendente";

              if (
                item.status ===
                "ENVIADA"
              ) {
                classeStatus =
                  "enviada";
              }

              return `
                <tr>

                  <td>
                    ${item.id}
                  </td>

                  <td>
                    ${escaparHTML(
                      item.missionario_nome
                    )}
                  </td>

                  <td>
                    ${escaparHTML(
                      item.nome_familia
                    )}
                  </td>

                  <td
                    class="mensagem-texto"
                  >
                    ${escaparHTML(
                      item.mensagem
                    )}
                  </td>

                  <td>
                    ${escaparHTML(
                      data
                    )}
                  </td>

                  <td>
                    <span
                      class="${classeStatus}"
                    >
                      ${escaparHTML(
                        item.status
                      )}
                    </span>
                  </td>

                </tr>
              `;
            }
          )
          .join("");

      const pendentes =
        estatisticas
          .rows[0]
          ?.pendentes || 0;

      const enviadas =
        estatisticas
          .rows[0]
          ?.enviadas || 0;
            res.send(
        paginaHTML(`

          ${aviso}

          <div class="estatisticas">

            <div class="estatistica">
              <p>Mensagens pendentes</p>

              <div class="numero">
                ${pendentes}
              </div>
            </div>

            <div class="estatistica">
              <p>Mensagens enviadas</p>

              <div class="numero">
                ${enviadas}
              </div>
            </div>

          </div>

          <div class="card">

            <h2>
              📬 Enviar compilação
            </h2>

            <p>
              Envia todas as mensagens
              <strong>PENDENTES</strong>
              agrupadas por missionário.
            </p>

            <p>
              Cada missionário receberá apenas
              um e-mail contendo todas as mensagens
              que estiverem pendentes para ele.
            </p>

            <div class="info">
              As mensagens somente serão marcadas
              como <strong>ENVIADA</strong> depois
              que o Resend confirmar o envio.
            </div>

            <form
              method="POST"
              action="/admin/enviar-compilacao"
              onsubmit="
                return confirm(
                  'Deseja enviar agora todas as mensagens pendentes?'
                );
              "
            >

              <input
                type="hidden"
                name="senha_admin"
                value="${senha}"
              >

              <button
                class="compilacao"
                type="submit"
              >
                Enviar compilação agora
              </button>

            </form>

          </div>

          <div class="card">

            <h2>
              Testar envio de e-mail
            </h2>

            <p>
              Digite um endereço de e-mail para
              verificar se a integração com o
              Resend está funcionando.
            </p>

            <form
              method="POST"
              action="/admin/testar-email"
            >

              <input
                type="hidden"
                name="senha_admin"
                value="${senha}"
              >

              <label>
                E-mail para o teste
              </label>

              <input
                type="email"
                name="email_teste"
                required
              >

              <button
                class="teste-email"
                type="submit"
              >
                Enviar e-mail de teste
              </button>

            </form>

          </div>

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

          <div class="card">

            <h2>
              Mensagens recebidas
            </h2>

            <p>
              Mensagens enviadas pelas famílias
              e destinadas aos missionários.
            </p>

            <table>

              <thead>
                <tr>
                  <th>ID</th>
                  <th>Missionário</th>
                  <th>Família</th>
                  <th>Mensagem</th>
                  <th>Recebida em</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                ${
                  linhasMensagens ||
                  `
                    <tr>
                      <td colspan="6">
                        Nenhuma mensagem recebida.
                      </td>
                    </tr>
                  `
                }
              </tbody>

            </table>

          </div>

        `)
      );

    } catch (error) {

      console.error(
        "Erro ao carregar painel:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao carregar painel."
        );
    }
  }
);

// ======================================================
// ENVIAR COMPILAÇÃO MANUALMENTE
// ======================================================

app.post(
  "/admin/enviar-compilacao",
  verificarAdmin,
  async (req, res) => {

    const senhaAdmin =
      req.body.senha_admin;

    try {

      console.log(
        "Iniciando compilação manual..."
      );

      const resultado =
        await enviarCompilacoesPendentes();

      console.log(
        "Resultado da compilação:",
        resultado
      );

      if (
        resultado.mensagens === 0 &&
        resultado.semEmail === 0 &&
        resultado.erros === 0
      ) {

        return res.redirect(
          `/admin?senha=${encodeURIComponent(
            senhaAdmin
          )}&compilacao=vazia`
        );
      }

      return res.redirect(
        `/admin?senha=${encodeURIComponent(
          senhaAdmin
        )}` +
        `&compilacao=ok` +
        `&mensagens=${resultado.mensagens}` +
        `&missionarios=${resultado.missionarios}` +
        `&semEmail=${resultado.semEmail}` +
        `&erros=${resultado.erros}`
      );

    } catch (error) {

      console.error(
        "Erro na compilação manual:",
        error
      );

      return res.redirect(
        `/admin?senha=${encodeURIComponent(
          senhaAdmin
        )}&compilacao=erro`
      );
    }
  }
);

// ======================================================
// TESTE DE E-MAIL - RESEND
// ======================================================

app.post(
  "/admin/testar-email",
  verificarAdmin,
  async (req, res) => {

    const senhaAdmin =
      req.body.senha_admin;

    try {

      if (!resend) {
        throw new Error(
          "RESEND_API_KEY não configurada."
        );
      }

      const emailTeste =
        req.body
          .email_teste
          ?.trim();

      if (!emailTeste) {

        return res
          .status(400)
          .send(
            "Informe um e-mail para realizar o teste."
          );
      }

      console.log(
        `Enviando e-mail de teste para ${emailTeste}...`
      );

      const resultado =
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
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: auto;
                line-height: 1.6;
              "
            >

              <h2>
                💙 Mensagens Missionárias
              </h2>

              <p>
                Este é um e-mail de teste do
                sistema Mensagens Missionárias.
              </p>

              <p>
                Se você recebeu esta mensagem,
                a integração entre
                <strong>Render</strong>
                e
                <strong>Resend</strong>
                está funcionando.
              </p>

              <hr>

              <p
                style="
                  color: #64748b;
                  font-size: 13px;
                "
              >
                Mensagens Missionárias
              </p>

            </div>
          `
        });

      if (resultado.error) {

        console.error(
          "Erro retornado pelo Resend:",
          resultado.error
        );

        throw new Error(
          resultado.error.message ||
          "Erro no Resend."
        );
      }

      console.log(
        "E-mail enviado pelo Resend:",
        resultado.data
      );

      res.redirect(
        `/admin?senha=${encodeURIComponent(
          senhaAdmin
        )}&email=ok`
      );

    } catch (error) {

      console.error(
        "Erro ao enviar e-mail de teste:",
        error
      );

      res.redirect(
        `/admin?senha=${encodeURIComponent(
          senhaAdmin
        )}&email=erro`
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

      const {
        nome,
        email,
        telefone,
        senha_admin
      } = req.body;

      if (!nome?.trim()) {

        return res
          .status(400)
          .send(
            "Nome obrigatório."
          );
      }

      if (
        !email?.trim() &&
        !telefone?.trim()
      ) {

        return res
          .status(400)
          .send(
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

        VALUES
        (
          $1,
          $2,
          $3
        )
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

      if (
        error.code ===
        "23505"
      ) {

        return res
          .status(409)
          .send(
            "Já existe um missionário com esse telefone."
          );
      }

      console.error(
        "Erro ao cadastrar missionário:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao cadastrar missionário."
        );
    }
  }
);

// ======================================================
// EDITAR MISSIONÁRIO - FORMULÁRIO
// ======================================================

app.get(
  "/admin/missionarios/:id/editar",
  verificarAdmin,
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            nome,
            email,
            telefone,
            ativo
          FROM missionarios
          WHERE id = $1
          `,
          [
            req.params.id
          ]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res
          .status(404)
          .send(
            paginaHTML(`
              <div class="card">

                <h2>
                  Missionário não encontrado
                </h2>

                <p>
                  O cadastro solicitado
                  não existe.
                </p>

              </div>
            `)
          );
      }

      const missionario =
        resultado.rows[0];

      const senha =
        escaparHTML(
          req.query.senha || ""
        );

      res.send(
        paginaHTML(`

          <div class="card">

            <h2>
              Editar missionário
            </h2>

            <p>
              Você está alterando o cadastro de
              <strong>
                ${escaparHTML(
                  missionario.nome
                )}
              </strong>.
            </p>

            <div class="info">

              Esta edição mantém o mesmo
              ID do missionário.

              <br><br>

              Portanto, as mensagens que
              já estão vinculadas a ele
              continuarão normalmente no
              sistema.

            </div>

            <form
              method="POST"
              action="/admin/missionarios/${missionario.id}/editar"
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
                value="${escaparHTML(
                  missionario.nome
                )}"
                required
              >

              <label>
                E-mail
              </label>

              <input
                type="email"
                name="email"
                value="${escaparHTML(
                  missionario.email ||
                  ""
                )}"
              >

              <label>
                WhatsApp / telefone
              </label>

              <input
                type="text"
                name="telefone"
                value="${escaparHTML(
                  missionario.telefone ||
                  ""
                )}"
                placeholder="5513999999999"
              >

              <button
                class="principal"
                type="submit"
              >
                Salvar alterações
              </button>

            </form>

            <p
              style="
                margin-top: 25px;
              "
            >

              <a
                href="/admin?senha=${encodeURIComponent(
                  req.query.senha || ""
                )}"
              >
                ← Voltar ao painel
              </a>

            </p>

          </div>

        `)
      );

    } catch (error) {

      console.error(
        "Erro ao abrir edição do missionário:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao carregar missionário."
        );
    }
  }
);

// ======================================================
// EDITAR MISSIONÁRIO - SALVAR
// ======================================================

app.post(
  "/admin/missionarios/:id/editar",
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

        return res
          .status(400)
          .send(
            "Nome obrigatório."
          );
      }

      if (
        !email?.trim() &&
        !telefone?.trim()
      ) {

        return res
          .status(400)
          .send(
            "Informe e-mail ou telefone."
          );
      }

      const resultado =
        await pool.query(
          `
          UPDATE missionarios

          SET
            nome = $1,
            email = $2,
            telefone = $3

          WHERE id = $4

          RETURNING
            id,
            nome,
            email,
            telefone
          `,
          [
            nome.trim(),
            email?.trim() || null,
            telefone?.trim() || null,
            req.params.id
          ]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res
          .status(404)
          .send(
            "Missionário não encontrado."
          );
      }

      console.log(
        `Missionário ${resultado.rows[0].nome} atualizado com sucesso.`
      );

      res.redirect(
        `/admin?senha=${encodeURIComponent(
          senha_admin
        )}&editado=ok`
      );

    } catch (error) {

      if (
        error.code ===
        "23505"
      ) {

        return res
          .status(409)
          .send(
            "Esse telefone já está cadastrado para outro missionário."
          );
      }

      console.error(
        "Erro ao atualizar missionário:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao atualizar missionário."
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

      const ativo =
        req.body.ativo ===
        "true";

      await pool.query(
        `
        UPDATE missionarios
        SET ativo = $1
        WHERE id = $2
        `,
        [
          ativo,
          req.params.id
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

      res
        .status(500)
        .send(
          "Erro ao alterar missionário."
        );
    }
  }
);

// ======================================================
// VERIFICAÇÃO DO WEBHOOK
// ======================================================

app.get(
  "/webhook",
  (req, res) => {

    const mode =
      req.query[
        "hub.mode"
      ];

    const token =
      req.query[
        "hub.verify_token"
      ];

    const challenge =
      req.query[
        "hub.challenge"
      ];

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      console.log(
        "Webhook verificado com sucesso."
      );

      return res
        .status(200)
        .send(
          challenge
        );
    }

    return res
      .sendStatus(403);
  }
);

// ======================================================
// WEBHOOK DO WHATSAPP
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
        value
          ?.messages?.[0];

      const contact =
        value
          ?.contacts?.[0];

      if (!message) {
        return;
      }

      const whatsappMessageId =
        message.id;

      const telefone =
        message.from;

      const nome =
        contact
          ?.profile
          ?.name ||
        "Sem nome";

      const tipo =
        message.type ||
        "desconhecido";

      const texto =
        message
          .text
          ?.body || "";

      console.log(
        "Nova mensagem recebida:"
      );

      console.log(
        `Nome: ${nome}`
      );

      console.log(
        `Telefone: ${telefone}`
      );

      console.log(
        `Mensagem: ${texto}`
      );

      console.log(
        `Tipo: ${tipo}`
      );

      const registro =
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
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )

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
        registro.rowCount ===
        0
      ) {

        console.log(
          "Mensagem já processada anteriormente."
        );

        return;
      }

      console.log(
        "Mensagem salva no banco de dados."
      );

      if (
        tipo !== "text"
      ) {

        await enviarMensagemWhatsApp(
          telefone,
          "Por enquanto, envie sua mensagem em formato de texto."
        );

        return;
      }

      await processarConversa(
        telefone,
        texto,
        whatsappMessageId
      );

    } catch (error) {

      console.error(
        "Erro ao processar webhook:",
        error
      );
    }
  }
);

// ======================================================
// ENVIO AUTOMÁTICO SEMANAL
// ======================================================

function iniciarAgendamentoSemanal() {

  if (
    !cron.validate(
      WEEKLY_CRON
    )
  ) {

    console.error(
      `WEEKLY_CRON inválido: ${WEEKLY_CRON}`
    );

    return;
  }

  console.log(
    `Compilação semanal agendada: ${WEEKLY_CRON}`
  );

  console.log(
    `Fuso horário da compilação: ${TIMEZONE}`
  );

  cron.schedule(
    WEEKLY_CRON,

    async () => {

      console.log(
        "=========================================="
      );

      console.log(
        "Iniciando compilação semanal automática..."
      );

      console.log(
        `Data/hora: ${new Date().toLocaleString(
          "pt-BR",
          {
            timeZone:
              TIMEZONE
          }
        )}`
      );

      try {

        const resultado =
          await enviarCompilacoesPendentes();

        console.log(
          "Resultado da compilação semanal automática:",
          resultado
        );

        if (
          resultado.mensagens === 0 &&
          resultado.semEmail === 0 &&
          resultado.erros === 0
        ) {

          console.log(
            "Nenhuma mensagem pendente para a compilação desta semana."
          );

          console.log(
            "=========================================="
          );

          return;
        }

        console.log(
          `Compilação automática concluída: ${resultado.mensagens} mensagem(ns) enviada(s) para ${resultado.missionarios} missionário(s).`
        );

        if (
          resultado.semEmail > 0
        ) {

          console.log(
            `${resultado.semEmail} missionário(s) sem e-mail cadastrado.`
          );
        }

        if (
          resultado.erros > 0
        ) {

          console.error(
            `${resultado.erros} envio(s) apresentou(aram) erro. As respectivas mensagens permaneceram PENDENTES.`
          );
        }

      } catch (error) {

        console.error(
          "Erro na compilação semanal automática:",
          error
        );
      }

      console.log(
        "=========================================="
      );
    },

    {
      timezone:
        TIMEZONE,

      noOverlap:
        true
    }
  );
}

// ======================================================
// INICIALIZAÇÃO
// ======================================================

async function iniciarServidor() {

  try {

    await inicializarBanco();

    iniciarAgendamentoSemanal();

    app.listen(
      PORT,
      () => {

        console.log(
          `Servidor iniciado na porta ${PORT}`
        );
      }
    );

  } catch (error) {

    console.error(
      "Não foi possível iniciar o servidor:",
      error
    );

    process.exit(1);
  }
}

iniciarServidor();

import { Resend } from "resend";

let resend: Resend | undefined;

function client() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY não configurada. Defina-a em .env para enviar e-mails de cobrança."
    );
  }
  resend ??= new Resend(apiKey);
  return resend;
}

export async function enviarEmailCobranca(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const from = process.env.EMAIL_FROM ?? "HubFinance <cobranca@hubfinance.app>";

  const { error } = await client().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    throw new Error(error.message);
  }
}

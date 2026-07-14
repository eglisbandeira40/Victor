export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: "whatsapp";
        metadata?: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<WhatsAppInboundMessage>;
        statuses?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
}

export interface WhatsAppSharedContact {
  name?: { formatted_name?: string };
  phones?: Array<{ phone?: string; wa_id?: string }>;
}

export interface WhatsAppInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  /** Presente quando type === "contacts": cartao(oes) de contato compartilhado pelo comerciante. */
  contacts?: WhatsAppSharedContact[];
  /** Presente quando type === "interactive": resposta a um menu/lista/botao enviado pelo bot. */
  interactive?: {
    type: "list_reply" | "button_reply";
    list_reply?: { id: string; title: string; description?: string };
    button_reply?: { id: string; title: string };
  };
}

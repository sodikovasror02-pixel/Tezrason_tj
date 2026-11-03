/**
 * Интерфейси провайдери SMS. Дар production — оператори маҳаллӣ
 * (масалан, Tcell / Megafon / Babilon SMS-шлюз) ё агрегатор.
 */
export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

export class ConsoleSms implements SmsSender {
  sent: { phone: string; text: string }[] = [];
  async send(phone: string, text: string) {
    this.sent.push({ phone, text });
    if (process.env.NODE_ENV !== 'test') console.log(`[SMS] ${phone}: ${text}`);
  }
}

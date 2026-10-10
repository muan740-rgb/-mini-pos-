// app/api/notify/route.js
// ส่งแจ้งเตือน Telegram จากฝั่ง Server เพื่อไม่ให้ Token หลุดไปที่เบราว์เซอร์
import { NextResponse } from 'next/server';

const LOW_STOCK_THRESHOLD = 5; // เตือนเมื่อสต๊อก <= 5

// กัน error จาก parse_mode HTML ถ้าชื่อสินค้ามีตัวอักษร < > &
function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('Telegram: ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      console.error('Telegram error:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Telegram fetch failed:', err);
    return false;
  }
}

export async function POST(request) {
  try {
    const { items } = await request.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'no items' }, { status: 400 });
    }

    const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // งานที่ 1: แจ้งเตือน Order ใหม่ (1 ข้อความต่อการขาย 1 ครั้ง)
    const itemBlocks = items
      .map(
        (it) =>
          `สินค้า: ${esc(it.name)}\n` +
          `จำนวน: ${Number(it.quantity)} ชิ้น\n` +
          `ราคารวม: ${Number(it.total).toLocaleString('th-TH')} บาท\n` +
          `สต๊อกคงเหลือปัจจุบัน: ${Number(it.stockAfter)} ชิ้น`
      )
      .join('\n\n');

    const orderText = `🛍️ <b>มีรายการขายใหม่!</b>\n\n${itemBlocks}\n\nเวลา: ${esc(time)}`;
    await sendTelegram(orderText);

    // งานที่ 2: แจ้งเตือนสต๊อกเหลือน้อย (แยกข้อความต่อสินค้า)
    for (const it of items) {
      if (Number(it.stockAfter) <= LOW_STOCK_THRESHOLD) {
        const lowText =
          `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n\n` +
          `สินค้า: ${esc(it.name)}\n` +
          `คงเหลือเพียง: ${Number(it.stockAfter)} ชิ้น\n\n` +
          `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;
        await sendTelegram(lowText);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('notify route error:', err);
    // ตอบ 200 เสมอ เพื่อไม่ให้กระทบหน้าขาย
    return NextResponse.json({ ok: false });
  }
}

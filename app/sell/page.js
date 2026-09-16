'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

// ฟังก์ชันสำหรับส่งข้อความแจ้งเตือนผ่าน Telegram Bot API
async function sendTelegramNotification(messageText) {
  const botToken = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// ============================================================
// ฟังก์ชันส่งข้อความแจ้งเตือนไปยัง Telegram Channel
// ทำงานแบบ async/try-catch เพื่อไม่ให้กระทบระบบขายหลัก
// ============================================================
async function sendTelegramNotification(message) {
  const TELEGRAM_BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

  // ถ้าไม่ได้ตั้งค่า env ไว้ ให้ข้ามไปเงียบๆ ไม่ทำให้ระบบพัง
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] ไม่พบ Bot Token หรือ Chat ID, ข้ามการแจ้งเตือน');
    return;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[Telegram] ส่งข้อความไม่สำเร็จ:', res.status, errText);
    }
  } catch (err) {
    // สำคัญ: ห้าม throw ต่อ ป้องกันกระทบระบบขายหลัก
    console.error('[Telegram] เกิดข้อผิดพลาดขณะเรียก API:', err);
  }
}

export default function SellPage() {
  // รายการสินค้าทั้งหมดสำหรับ dropdown
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // สินค้าที่เลือกและจำนวนที่จะขาย
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');

  // ข้อความแจ้งเตือน / สำเร็จ
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // โหลดรายการสินค้าเมื่อเปิดหน้า
  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setError('โหลดข้อมูลสินค้าไม่สำเร็จ: ' + error.message);
    } else {
      setProducts(data);
    }
    setLoading(false);
  }

  // หาสินค้าที่ถูกเลือกอยู่จาก id
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // คำนวณยอดรวมอัตโนมัติ (ราคา x จำนวน)
  const totalPrice =
    selectedProduct && quantity
      ? (parseFloat(selectedProduct.price) * parseInt(quantity, 10)).toFixed(2)
      : '0.00';

  // รีเซ็ตฟอร์มหลังขายสำเร็จ
  function resetForm() {
    setSelectedProductId('');
    setQuantity('');
  }

  // จัดการการขายสินค้า
  async function handleSell(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedProduct) {
      setError('กรุณาเลือกสินค้า');
      return;
    }

    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError('กรุณากรอกจำนวนที่ถูกต้อง');
      return;
    }

    // ตรวจสอบ stock เพียงพอหรือไม่
    if (qty > selectedProduct.stock) {
      setError(
        `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`
      );
      return;
    }

    setSubmitting(true);

    const total = parseFloat(selectedProduct.price) * qty;

    // 1. บันทึกรายการขายลงตาราง sales
    const { error: saleError } = await supabase.from('sales').insert([
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: qty,
        total_price: total,
        sold_at: new Date().toISOString(),
      },
    ]);

    if (saleError) {
      setError('บันทึกการขายไม่สำเร็จ: ' + saleError.message);
      setSubmitting(false);
      return;
    }

    // 2. อัปเดต stock ในตาราง products ให้ลดลง
    const newStock = selectedProduct.stock - qty;
    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', selectedProduct.id);

    if (updateError) {
      setError('อัปเดตสต็อกไม่สำเร็จ: ' + updateError.message);
      setSubmitting(false);
      return;
    }

    // ============================================================
    // ✅ ตัดสต๊อกสำเร็จแล้ว -> ยิงแจ้งเตือนเข้า Telegram
    // ทำงานแบบ fire-and-forget (ไม่ await) และมี try-catch อยู่ในฟังก์ชัน
    // เพื่อไม่ให้ระบบขายขัดข้องหาก Telegram API มีปัญหา
    // ============================================================
    const now = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'short',
      timeStyle: 'medium',
    });

    // งานที่ 1: แจ้งเตือน Order เข้าใหม่
    const newOrderMessage =
      `🛍️ <b>มีรายการขายใหม่!</b>\n` +
      `สินค้า: ${selectedProduct.name}\n` +
      `จำนวน: ${qty} ${selectedProduct.unit}\n` +
      `ราคารวม: ${total.toFixed(2)} บาท\n` +
      `สต๊อกคงเหลือปัจจุบัน: ${newStock} ชิ้น\n` +
      `เวลา: ${now}`;

    sendTelegramNotification(newOrderMessage);

    // งานที่ 2: แจ้งเตือน Stock เหลือน้อย (threshold <= 5)
    const LOW_STOCK_THRESHOLD = 5;
    if (newStock <= LOW_STOCK_THRESHOLD) {
      const lowStockMessage =
        `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
        `สินค้า: ${selectedProduct.name}\n` +
        `คงเหลือเพียง: ${newStock} ชิ้น\n\n` +
        `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;

      sendTelegramNotification(lowStockMessage);
    }

    // สำเร็จ: แจ้งเตือนและรีเซ็ตฟอร์ม
    setSuccess(
      `ขาย ${selectedProduct.name} จำนวน ${qty} ${selectedProduct.unit} สำเร็จ ยอดรวม ${total.toFixed(2)} บาท`
    );
    resetForm();
    fetchProducts(); // โหลด stock ล่าสุดมาแสดง
    setSubmitting(false);
  }

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {error && (
        <p style={{ color: '#d63031', fontWeight: 'bold' }}>{error}</p>
      )}
      {success && (
        <p style={{ color: '#00b894', fontWeight: 'bold' }}>{success}</p>
      )}

      <div className="card">
        {loading ? (
          <p>กำลังโหลดข้อมูลสินค้า...</p>
        ) : products.length === 0 ? (
          <p>ยังไม่มีสินค้าในระบบ กรุณาเพิ่มสินค้าก่อน</p>
        ) : (
          <form onSubmit={handleSell}>
            <div className="form-row">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.price} บาท / {p.unit}) - คงเหลือ {p.stock}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="จำนวน"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            {/* แสดงยอดรวมอัตโนมัติ */}
            <div className="form-row">
              <strong>ยอดรวม: {totalPrice} บาท</strong>
            </div>

            <button type="submit" disabled={submitting}>
              {submitting ? 'กำลังบันทึก...' : 'ขาย'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

  if (!botToken || !chatId) {
    console.warn('Telegram Config ไม่ครบถ้วน (ตรวจสอบ NEXT_PUBLIC_TELEGRAM_BOT_TOKEN และ NEXT_PUBLIC_TELEGRAM_CHAT_ID)');
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML',
      }),
    });
  } catch (error) {
    // ดักจับ Error เพื่อไม่ให้กระทบระบบขายหลักหาก Telegram ยิงไม่ผ่าน
    console.error('เกิดข้อผิดพลาดในการส่ง Telegram Notification:', error);
  }
}

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      alert('เกิดข้อผิดพลาดในการดึงรายการสินค้า: ' + error.message);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  const grandTotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.cartQty),
    0
  );

  const totalItemsCount = cart.reduce(
    (sum, item) => sum + Number(item.cartQty),
    0
  );

  function handleAddToCart(e) {
    e.preventDefault();
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const qty = Number(quantity);
    if (qty <= 0) return;

    const existingIndex = cart.findIndex((item) => item.id === product.id);
    const currentInCart = existingIndex >= 0 ? cart[existingIndex].cartQty : 0;
    const newTotalQty = currentInCart + qty;

    if (newTotalQty > product.stock) {
      alert(`สินค้าคงเหลือไม่พอ! (สต็อก: ${product.stock} ${product.unit})`);
      return;
    }

    if (existingIndex >= 0) {
      const updatedCart = [...cart];
      updatedCart[existingIndex].cartQty = newTotalQty;
      setCart(updatedCart);
    } else {
      setCart([...cart, { ...product, cartQty: qty }]);
    }

    setSelectedProductId('');
    setQuantity(1);
  }

  function handleUpdateCartQty(id, newQty) {
    const qty = Number(newQty);
    const product = products.find((p) => p.id === id);

    if (qty <= 0) {
      handleRemoveFromCart(id);
      return;
    }

    if (product && qty > product.stock) {
      alert(`สินค้าคงเหลือไม่พอ! (มีเพียง ${product.stock} ${product.unit})`);
      return;
    }

    setCart(
      cart.map((item) => (item.id === id ? { ...item, cartQty: qty } : item))
    );
  }

  function handleRemoveFromCart(id) {
    setCart(cart.filter((item) => item.id !== id));
  }

  // ยืนยันการขาย + ตัดสต็อก + ส่งแจ้งเตือน Telegram
  async function handleCheckout() {
    if (cart.length === 0) return;

    if (!confirm(`ยืนยันการชำระเงิน ยอดรวม ${grandTotal.toLocaleString()} บาท?`)) {
      return;
    }

    setSubmitting(true);
    const now = new Date();
    const nowIso = now.toISOString();
    const nowFormatted = now.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    try {
      // 1. บันทึกประวัติลงตาราง sales
      const salesData = cart.map((item) => ({
        product_id: item.id,
        product_name: item.name,
        quantity: item.cartQty,
        total_price: Number(item.price) * item.cartQty,
        sold_at: nowIso,
      }));

      const { error: salesError } = await supabase
        .from('sales')
        .insert(salesData);

      if (salesError) throw salesError;

      // 2. ตัดสต็อกสินค้า และ ส่งแจ้งเตือน Telegram
      for (const item of cart) {
        const product = products.find((p) => p.id === item.id);
        const updatedStock = product.stock - item.cartQty;
        const itemTotalPrice = Number(item.price) * item.cartQty;

        // อัปเดตสต็อกใน Supabase
        const { error: updateError } = await supabase
          .from('products')
          .update({ stock: updatedStock })
          .eq('id', item.id);

        if (updateError) throw updateError;

        // --- งานที่ 1: แจ้งเตือน Order เข้า (New Order Alert) ---
        const orderMessage = `🛍️ <b>มีรายการขายใหม่!</b>
<b>สินค้า:</b> ${item.name}
<b>จำนวน:</b> ${item.cartQty} ชิ้น
<b>ราคารวม:</b> ${itemTotalPrice.toLocaleString()} บาท
<b>สต๊อกคงเหลือปัจจุบัน:</b> ${updatedStock} ชิ้น
<b>เวลา:</b> ${nowFormatted}`;

        await sendTelegramNotification(orderMessage);

        // --- งานที่ 2: แจ้งเตือน Stock เหลือน้อย (Stock <= 5) ---
        if (updatedStock <= 5) {
          const lowStockMessage = `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>
<b>สินค้า:</b> ${item.name}
<b>คงเหลือเพียง:</b> ${updatedStock} ชิ้น

⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;

          await sendTelegramNotification(lowStockMessage);
        }
      }

      alert('ทำรายการขายสำเร็จ!');
      setCart([]);
      fetchProducts();
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการบันทึกการขาย: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* สรุปราคารวมขนาดใหญ่ */}
      <div
        className="card"
        style={{
          backgroundColor: '#0f172a',
          color: '#ffffff',
          textAlign: 'center',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <span style={{ fontSize: '1.1rem', color: '#94a3b8', textTransform: 'uppercase' }}>
          ยอดชำระทั้งหมด ({totalItemsCount} ชิ้น)
        </span>
        <div style={{ fontSize: '3.5rem', fontWeight: '800', color: '#4ade80', margin: '0.2rem 0' }}>
          ฿{grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* เลือกสินค้า */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>เลือกสินค้า</h3>
          {loading ? (
            <p>กำลังโหลดรายการสินค้า...</p>
          ) : (
            <form onSubmit={handleAddToCart}>
              <div className="form-group">
                <label>รายการสินค้า</label>
                <select
                  className="form-control"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  required
                >
                  <option value="">-- เลือกสินค้า --</option>
                  {products.map((item) => (
                    <option key={item.id} value={item.id} disabled={item.stock <= 0}>
                      {item.name} - ฿{Number(item.price).toLocaleString()} (คงเหลือ {item.stock} {item.unit})
                      {item.stock <= 0 ? ' [สินค้าหมด]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>จำนวน</label>
                <input
                  type="number"
                  min="1"
                  className="form-control"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem' }}
                disabled={!selectedProductId}
              >
                + เพิ่มลงตะกร้า
              </button>
            </form>
          )}
        </div>

        {/* ตะกร้าสินค้า */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>
            รายการในตะกร้า ({cart.length} รายการ)
          </h3>

          {cart.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem 0' }}>
              ยังไม่มีสินค้าในตะกร้า
            </p>
          ) : (
            <>
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th style={{ width: '90px' }}>จำนวน</th>
                      <th style={{ textAlign: 'right' }}>รวม</th>
                      <th style={{ textAlign: 'center', width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <br />
                          <small style={{ color: '#64748b' }}>
                            ฿{Number(item.price).toLocaleString()} / {item.unit}
                          </small>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="form-control"
                            style={{ padding: '0.25rem 0.5rem' }}
                            value={item.cartQty}
                            onChange={(e) => handleUpdateCartQty(item.id, e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '600' }}>
                          ฿{(Number(item.price) * item.cartQty).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                            onClick={() => handleRemoveFromCart(item.id)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="btn btn-success"
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                }}
                onClick={handleCheckout}
                disabled={submitting}
              >
                {submitting ? 'กำลังบันทึกและส่งแจ้งเตือน...' : `ชำระเงิน ฿${grandTotal.toLocaleString()}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

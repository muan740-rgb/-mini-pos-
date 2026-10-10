'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const formatBaht = (n) =>
  Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// [เพิ่มใหม่] ส่งแจ้งเตือนเข้า Telegram ผ่าน /api/notify
// ถ้าส่งไม่สำเร็จ จะแค่ log error ไม่ทำให้ระบบขายพัง
async function notifyTelegram(items) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  } catch (err) {
    console.error('Telegram notify failed:', err);
  }
}

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // { product_id, name, price, unit, stock, quantity }
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error' | 'success', text }

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      setMessage({ type: 'error', text: 'โหลดสินค้าไม่สำเร็จ: ' + error.message });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const grandTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0),
    [cart]
  );
  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  function addToCart(product) {
    setMessage(null);
    const stock = Number(product.stock);
    const existing = cart.find((i) => i.product_id === product.id);
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty + 1 > stock) {
      setMessage({ type: 'error', text: `"${product.name}" มีสต็อกเหลือ ${stock} ${product.unit || ''}` });
      return;
    }

    if (existing) {
      setCart(cart.map((i) => (i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i)));
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          name: product.name,
          price: Number(product.price),
          unit: product.unit,
          stock,
          quantity: 1,
        },
      ]);
    }
  }

  function changeQty(productId, delta) {
    setMessage(null);
    setCart(
      cart
        .map((i) => {
          if (i.product_id !== productId) return i;
          const next = i.quantity + delta;
          if (next > i.stock) {
            setMessage({ type: 'error', text: `"${i.name}" มีสต็อกเหลือ ${i.stock} ${i.unit || ''}` });
            return i;
          }
          return { ...i, quantity: next };
        })
        .filter((i) => i.quantity > 0)
    );
  }

  function removeItem(productId) {
    setCart(cart.filter((i) => i.product_id !== productId));
  }

  function clearCart() {
    setCart([]);
    setMessage(null);
  }

  async function confirmSale() {
    if (cart.length === 0) return;
    setSaving(true);
    setMessage(null);

    // 1) เช็คสต็อกล่าสุดจากฐานข้อมูลก่อนขายจริง
    const ids = cart.map((i) => i.product_id);
    const { data: latest, error: fetchError } = await supabase
      .from('products')
      .select('id, name, stock')
      .in('id', ids);

    if (fetchError) {
      setMessage({ type: 'error', text: 'ตรวจสอบสต็อกไม่สำเร็จ: ' + fetchError.message });
      setSaving(false);
      return;
    }

    const latestMap = new Map((latest || []).map((p) => [p.id, p]));
    for (const item of cart) {
      const p = latestMap.get(item.product_id);
      if (!p) {
        setMessage({ type: 'error', text: `ไม่พบสินค้า "${item.name}" ในระบบแล้ว` });
        setSaving(false);
        return;
      }
      if (Number(p.stock) < item.quantity) {
        setMessage({
          type: 'error',
          text: `"${item.name}" สต็อกไม่พอ (เหลือ ${p.stock}, ต้องการ ${item.quantity})`,
        });
        setSaving(false);
        await loadProducts();
        return;
      }
    }

    // 2) บันทึกประวัติการขายทุกรายการ
    const now = new Date().toISOString();
    const rows = cart.map((item) => ({
      product_id: item.product_id,
      product_name: item.name,
      quantity: item.quantity,
      total_price: Number(item.price) * item.quantity,
      sold_at: now,
    }));

    const { error: insertError } = await supabase.from('sales').insert(rows);
    if (insertError) {
      setMessage({ type: 'error', text: 'บันทึกการขายไม่สำเร็จ: ' + insertError.message });
      setSaving(false);
      return;
    }

    // 3) ตัดสต็อกทีละรายการ
    const failed = [];
    const notifyItems = []; // [เพิ่มใหม่] เก็บรายการที่ตัดสต็อกสำเร็จ ไว้ส่งเข้า Telegram
    for (const item of cart) {
      const newStock = Number(latestMap.get(item.product_id).stock) - item.quantity;
      const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.product_id);
      if (updateError) {
        failed.push(item.name);
      } else {
        notifyItems.push({
          name: item.name,
          quantity: item.quantity,
          total: Number(item.price) * item.quantity,
          stockAfter: newStock,
        });
      }
    }

    if (failed.length > 0) {
      setMessage({
        type: 'error',
        text: 'บันทึกการขายแล้ว แต่ตัดสต็อกไม่สำเร็จ: ' + failed.join(', '),
      });
    } else {
      setMessage({ type: 'success', text: `ขายสำเร็จ ยอดรวม ${formatBaht(grandTotal)} บาท` });
    }

    // [เพิ่มใหม่] แจ้งเตือน Telegram (ไม่ await เพื่อไม่ให้หน้าเว็บต้องรอ)
    if (notifyItems.length > 0) {
      notifyTelegram(notifyItems);
    }

    setCart([]);
    await loadProducts();
    setSaving(false);
  }

  return (
    <div>
      {/* ยอดรวมตัวใหญ่ไว้บนสุด */}
      <div className="total-banner">
        <div>
          <div className="total-label">ยอดชำระรวม</div>
          <div className="total-amount">฿ {formatBaht(grandTotal)}</div>
        </div>
        <div className="total-meta">
          {cart.length} รายการ · {totalItems} ชิ้น
        </div>
      </div>

      {message && (
        <div className={`card ${message.type === 'error' ? 'error' : 'success'}`}>
          {message.text}
        </div>
      )}

      <div className="sell-layout">
        {/* ฝั่งซ้าย: เลือกสินค้า */}
        <section>
          <h2>เลือกสินค้า</h2>
          <input
            className="search"
            type="text"
            placeholder="ค้นหาชื่อสินค้าหรือรหัส (SKU)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loading ? (
            <p>กำลังโหลด...</p>
          ) : filteredProducts.length === 0 ? (
            <p>ไม่พบสินค้า</p>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((p) => {
                const outOfStock = Number(p.stock) <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="product-card"
                    disabled={outOfStock}
                    onClick={() => addToCart(p)}
                  >
                    <span className="product-name">{p.name}</span>
                    <span className="product-price">฿ {formatBaht(p.price)}</span>
                    <span className="product-stock">
                      {outOfStock ? 'สินค้าหมด' : `เหลือ ${p.stock} ${p.unit || ''}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ฝั่งขวา: ตะกร้า */}
        <section className="cart-panel">
          <h2>ตะกร้าสินค้า</h2>

          {cart.length === 0 ? (
            <p className="cart-empty">ยังไม่มีสินค้า กดเลือกสินค้าด้านซ้ายได้เลย</p>
          ) : (
            <div>
              {cart.map((item) => (
                <div className="cart-row" key={item.product_id}>
                  <div className="cart-info">
                    <div className="cart-name">{item.name}</div>
                    <div className="cart-sub">
                      ฿ {formatBaht(item.price)} / {item.unit || 'หน่วย'}
                    </div>
                  </div>
                  <div className="qty-controls">
                    <button type="button" className="btn-secondary" onClick={() => changeQty(item.product_id, -1)}>
                      −
                    </button>
                    <span className="qty-value">{item.quantity}</span>
                    <button type="button" className="btn-secondary" onClick={() => changeQty(item.product_id, 1)}>
                      +
                    </button>
                  </div>
                  <div className="cart-line-total">฿ {formatBaht(item.price * item.quantity)}</div>
                  <button type="button" className="btn-danger" onClick={() => removeItem(item.product_id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="cart-actions">
            <button type="button" className="btn-secondary" onClick={clearCart} disabled={cart.length === 0 || saving}>
              ล้างตะกร้า
            </button>
            <button type="button" className="btn-confirm" onClick={confirmSale} disabled={cart.length === 0 || saving}>
              {saving ? 'กำลังบันทึก...' : `ยืนยันการขาย ฿ ${formatBaht(grandTotal)}`}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

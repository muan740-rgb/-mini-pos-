"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const currencyFormatter = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
});

// โหลดรายการสินค้าทั้งหมดจาก Supabase
async function fetchProducts() {
  const products = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, price, stock, unit')
      .order('name', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    products.push(...data);
    offset += data.length;
  }

  return products;
}

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [addQty, setAddQty] = useState('1');

  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // โหลดสินค้าเมื่อเปิดหน้าเว็บ
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await fetchProducts();
        if (active) setProducts(data);
      } catch (err) {
        if (active) setError(`โหลดสินค้าไม่สำเร็จ: ${err.message}`);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  // คำนวณราคารวมทั้งหมดในตะกร้า
  const grandTotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  // เพิ่มสินค้าลงตะกร้า
  function handleAddToCart(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const product = products.find((p) => p.id === selectedId);
    if (!product) {
      setError('กรุณาเลือกสินค้า');
      return;
    }

    const qty = parseInt(addQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setError('กรุณากรอกจำนวนมากกว่า 0');
      return;
    }

    // ตรวจสอบสต็อกรวมในตะกร้าว่าเกินสต็อกที่มีจริงหรือไม่
    const existingInCart = cart.find((item) => item.id === product.id);
    const currentQtyInCart = existingInCart ? existingInCart.quantity : 0;
    const totalRequested = currentQtyInCart + qty;

    if (totalRequested > product.stock) {
      setError(`สินค้าไม่เพียงพอ (คงเหลือในสต็อก ${product.stock} ${product.unit})`);
      return;
    }

    if (existingInCart) {
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + qty }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          price: Number(product.price),
          unit: product.unit,
          quantity: qty,
          stock: product.stock,
        },
      ]);
    }

    setSelectedId('');
    setAddQty('1');
  }

  // เปลี่ยนจำนวนสินค้าในตะกร้าทีละรายการ
  function updateCartQty(id, newQty) {
    const qty = parseInt(newQty, 10);
    const product = products.find((p) => p.id === id);

    if (isNaN(qty) || qty <= 0) {
      removeFromCart(id);
      return;
    }

    if (product && qty > product.stock) {
      alert(`สินค้าเกินจำนวนสต็อกที่มี (เหลือ ${product.stock} ${product.unit})`);
      return;
    }

    setCart(
      cart.map((item) => (item.id === id ? { ...item, quantity: qty } : item))
    );
  }

  // ลบสินค้าออกจากตะกร้า
  function removeFromCart(id) {
    setCart(cart.filter((item) => item.id !== id));
  }

  // ยืนยันการขาย (บันทึก sales และตัด stock ใน products)
  async function handleCheckout() {
    if (cart.length === 0 || selling) return;

    setSelling(true);
    setError('');
    setSuccess('');

    try {
      const now = new Date().toISOString();

      // วนลูปบันทึกทีละรายการลงตาราง sales และตัดสต็อก
      for (const item of cart) {
        // 1. บันทึกประวัติการขาย
        const { error: saleError } = await supabase.from('sales').insert({
          product_id: item.id,
          product_name: item.name,
          quantity: item.quantity,
          total_price: item.price * item.quantity,
          sold_at: now,
        });
        if (saleError) throw saleError;

        // 2. ดึงสต็อกล่าสุดเพื่อความปลอดภัย
        const { data: prodData, error: fetchErr } = await supabase
          .from('products')
          .select('stock')
          .eq('id', item.id)
          .single();

        if (fetchErr) throw fetchErr;

        const newStock = prodData.stock - item.quantity;
        if (newStock < 0) {
          throw new Error(`สินค้า ${item.name} สต็อกไม่พอขายในช่วงเวลานี้`);
        }

        // 3. อัปเดตสต็อกใหม่
        const { error: updateError } = await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.id);

        if (updateError) throw updateError;
      }

      setSuccess('ชำระเงินและบันทึกการขายเรียบร้อยแล้ว!');
      setCart([]);

      // โหลดข้อมูลสินค้าใหม่เพื่อให้สต็อกเป็นปัจจุบัน
      const updatedProducts = await fetchProducts();
      setProducts(updatedProducts);
    } catch (err) {
      setError(`เกิดข้อผิดพลาดในการขาย: ${err.message}`);
    } finally {
      setSelling(false);
    }
  }

  return (
    <div className="stack">
      {/* สรุปราคารวมทั้งหมดไว้บนสุด ตัวใหญ่ๆ */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ fontSize: '15px', opacity: 0.9 }}>ยอดชำระรวมทั้งหมด</div>
          <div style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: '700' }}>
            {currencyFormatter.format(grandTotal)}
          </div>
        </div>
        <div>
          <button
            type="button"
            className="button-secondary"
            style={{ background: '#ffffff', color: '#1f2937', border: '0', minHeight: '52px', paddingInline: '24px', fontSize: '18px' }}
            disabled={cart.length === 0 || selling}
            onClick={handleCheckout}
          >
            {selling ? 'กำลังบันทึก...' : `ยืนยันการขาย (${cart.length} รายการ)`}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* แบ่งหน้าจอเป็น 2 ฝั่งสำหรับเลือกสินค้า และ ตะกร้าสินค้า */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '20px' }}>
        
        {/* ฝั่งซ้าย: เลือกสินค้าเพิ่มลงตะกร้า */}
        <section className="card">
          <h2>เลือกสินค้า</h2>
          {loading ? (
            <p className="text-muted">กำลังโหลดสินค้า...</p>
          ) : (
            <form onSubmit={handleAddToCart} className="stack">
              <div className="form-group">
                <label htmlFor="select-product">สินค้า</label>
                <select
                  id="select-product"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  required
                >
                  <option value="">-- เลือกสินค้า --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                      {p.name} ({currencyFormatter.format(p.price)}) — เหลือ {p.stock} {p.unit}
                      {p.stock <= 0 ? ' [หมด]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="add-qty">จำนวน</label>
                <input
                  id="add-qty"
                  type="number"
                  min="1"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  required
                />
              </div>

              <button type="submit">เพิ่มลงรายการขาย</button>
            </form>
          )}
        </section>

        {/* ฝั่งขวา: รายการสินค้าในตะกร้าปัจจุบัน */}
        <section className="card">
          <h2>ตะกร้าสินค้าปัจจุบัน</h2>
          {cart.length === 0 ? (
            <p className="text-muted" style={{ paddingBlock: '20px', textAlign: 'center' }}>
              ยังไม่มีสินค้าในตะกร้า
            </p>
          ) : (
            <div className="stack">
              <div className="table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th className="text-right">ราคา</th>
                      <th className="text-right">จำนวน</th>
                      <th className="text-right">รวม</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td className="text-right">{currencyFormatter.format(item.price)}</td>
                        <td className="text-right">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateCartQty(item.id, e.target.value)}
                            style={{ width: '60px', textAlign: 'right', padding: '4px' }}
                          />
                        </td>
                        <td className="text-right">
                          {currencyFormatter.format(item.price * item.quantity)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button-danger"
                            style={{ minHeight: '32px', padding: '4px 8px', fontSize: '14px' }}
                            onClick={() => removeFromCart(item.id)}
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="button-secondary"
                onClick={() => setCart([])}
              >
                ล้างตะกร้าทั้งหมด
              </button>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

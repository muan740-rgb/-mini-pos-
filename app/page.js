'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function SellPage() {
  // รายการสินค้าทั้งหมดสำหรับ dropdown
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ตะกร้าสินค้าที่กำลังจะขาย: [{ productId, name, price, unit, quantity, stock }]
  const [cart, setCart] = useState([]);

  // ฟอร์มเลือกสินค้าเพื่อเพิ่มลงตะกร้า
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
      setError('โหลดข้อมูลสินค้าไม่สำเร็จ: ' + error.message);
    } else {
      setProducts(data);
    }
    setLoading(false);
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // ยอดรวมทั้งหมดในตะกร้า (ตัวใหญ่ด้านบนจอ)
  const grandTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // เพิ่มสินค้าลงตะกร้า
  function handleAddToCart(e) {
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

    // รวมจำนวนที่มีอยู่แล้วในตะกร้า (กรณีเลือกสินค้าเดิมซ้ำ) เพื่อเช็ค stock รวม
    const existingQtyInCart = cart
      .filter((item) => item.productId === selectedProduct.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    if (existingQtyInCart + qty > selectedProduct.stock) {
      setError(
        `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit}, ในตะกร้ามีแล้ว ${existingQtyInCart})`
      );
      return;
    }

    // ถ้าสินค้านี้อยู่ในตะกร้าแล้ว ให้รวมจำนวนกัน ไม่ใช่เพิ่มแถวใหม่
    const existingIndex = cart.findIndex(
      (item) => item.productId === selectedProduct.id
    );

    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += qty;
      setCart(newCart);
    } else {
      setCart([
        ...cart,
        {
          productId: selectedProduct.id,
          name: selectedProduct.name,
          price: parseFloat(selectedProduct.price),
          unit: selectedProduct.unit,
          quantity: qty,
          stock: selectedProduct.stock,
        },
      ]);
    }

    setSelectedProductId('');
    setQuantity('');
  }

  // แก้จำนวนสินค้าในตะกร้าโดยตรง
  function handleCartQtyChange(index, newQty) {
    const qty = parseInt(newQty, 10);
    const newCart = [...cart];
    if (!qty || qty <= 0) {
      newCart[index].quantity = '';
    } else if (qty > newCart[index].stock) {
      setError(
        `สินค้า "${newCart[index].name}" คงเหลือไม่พอ (คงเหลือ ${newCart[index].stock})`
      );
      return;
    } else {
      newCart[index].quantity = qty;
      setError('');
    }
    setCart(newCart);
  }

  // ลบสินค้าออกจากตะกร้า
  function removeFromCart(index) {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  }

  function resetAll() {
    setCart([]);
    setSelectedProductId('');
    setQuantity('');
  }

  // ยืนยันการขายทั้งหมดในตะกร้า
  async function handleCheckout() {
    setError('');
    setSuccess('');

    if (cart.length === 0) {
      setError('ยังไม่มีสินค้าในตะกร้า');
      return;
    }

    const invalidItem = cart.find((item) => !item.quantity || item.quantity <= 0);
    if (invalidItem) {
      setError(`กรุณากรอกจำนวนของ "${invalidItem.name}" ให้ถูกต้อง`);
      return;
    }

    setSubmitting(true);

    // ประมวลผลทีละรายการ: บันทึกลง sales แล้วอัปเดต stock ของ products
    for (const item of cart) {
      const subtotal = item.price * item.quantity;

      const { error: saleError } = await supabase.from('sales').insert([
        {
          product_id: item.productId,
          product_name: item.name,
          quantity: item.quantity,
          total_price: subtotal,
          sold_at: new Date().toISOString(),
        },
      ]);

      if (saleError) {
        setError('บันทึกการขายไม่สำเร็จ: ' + saleError.message);
        setSubmitting(false);
        return;
      }

      const newStock = item.stock - item.quantity;
      const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.productId);

      if (updateError) {
        setError('อัปเดตสต็อกไม่สำเร็จ: ' + updateError.message);
        setSubmitting(false);
        return;
      }
    }

    setSuccess(`ขายสำเร็จ ยอดรวม ${grandTotal.toFixed(2)} บาท`);
    resetAll();
    fetchProducts();
    setSubmitting(false);
  }

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {/* ยอดรวมตัวใหญ่ด้านบนสุด ให้ผู้ขายและลูกค้าเห็นชัดเจน */}
      <div className="total-display">
        <span>ยอดรวมทั้งหมด</span>
        <div className="total-amount">{grandTotal.toFixed(2)} บาท</div>
      </div>

      {error && <p style={{ color: '#d63031', fontWeight: 'bold' }}>{error}</p>}
      {success && (
        <p style={{ color: '#00b894', fontWeight: 'bold' }}>{success}</p>
      )}

      <div className="pos-layout">
        {/* ฝั่งซ้าย: เลือกสินค้าเพื่อเพิ่มลงตะกร้า */}
        <div className="card pos-column">
          <h2>เลือกสินค้า</h2>
          {loading ? (
            <p>กำลังโหลดข้อมูลสินค้า...</p>
          ) : products.length === 0 ? (
            <p>ยังไม่มีสินค้าในระบบ กรุณาเพิ่มสินค้าก่อน</p>
          ) : (
            <form onSubmit={handleAddToCart}>
              <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
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

                <button type="submit">+ เพิ่มลงตะกร้า</button>
              </div>
            </form>
          )}
        </div>

        {/* ฝั่งขวา: ตะกร้าสินค้า */}
        <div className="card pos-column">
          <h2>รายการที่จะขาย</h2>
          {cart.length === 0 ? (
            <p>ยังไม่มีสินค้าในตะกร้า</p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th>ราคา/หน่วย</th>
                    <th>จำนวน</th>
                    <th>รวม</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, index) => (
                    <tr key={index}>
                      <td>{item.name}</td>
                      <td>{item.price.toFixed(2)} / {item.unit}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleCartQtyChange(index, e.target.value)}
                          style={{ width: '70px' }}
                        />
                      </td>
                      <td>{(item.price * item.quantity).toFixed(2)}</td>
                      <td>
                        <button onClick={() => removeFromCart(index)}>ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                onClick={handleCheckout}
                disabled={submitting}
                className="checkout-btn"
              >
                {submitting ? 'กำลังบันทึก...' : `ยืนยันการขาย (${grandTotal.toFixed(2)} บาท)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

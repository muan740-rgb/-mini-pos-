'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

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

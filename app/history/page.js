'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  // เก็บรายการสินค้าทั้งหมด
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ฟอร์มเพิ่มสินค้าใหม่
  const [form, setForm] = useState({
    sku: '',
    name: '',
    price: '',
    stock: '',
    unit: '',
  });

  // สถานะแถวที่กำลังแก้ไข (inline edit)
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // โหลดรายการสินค้าเมื่อเปิดหน้า
  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setError('โหลดข้อมูลสินค้าไม่สำเร็จ: ' + error.message);
    } else {
      setProducts(data);
      setError('');
    }
    setLoading(false);
  }

  // จัดการค่าฟอร์มเพิ่มสินค้า
  function handleFormChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // เพิ่มสินค้าใหม่
  async function handleAddProduct(e) {
    e.preventDefault();
    if (!form.sku || !form.name || !form.price || !form.stock || !form.unit) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง');
      return;
    }

    const { error } = await supabase.from('products').insert([
      {
        sku: form.sku,
        name: form.name,
        price: parseFloat(form.price),
        stock: parseInt(form.stock, 10),
        unit: form.unit,
      },
    ]);

    if (error) {
      setError('เพิ่มสินค้าไม่สำเร็จ: ' + error.message);
    } else {
      setForm({ sku: '', name: '', price: '', stock: '', unit: '' });
      setError('');
      fetchProducts();
    }
  }

  // เริ่มแก้ไขแถวสินค้า
  function startEdit(product) {
    setEditingId(product.id);
    setEditForm({
      sku: product.sku,
      name: product.name,
      price: product.price,
      stock: product.stock,
      unit: product.unit,
    });
  }

  function handleEditChange(e) {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  // บันทึกการแก้ไขสินค้า
  async function saveEdit(id) {
    const { error } = await supabase
      .from('products')
      .update({
        sku: editForm.sku,
        name: editForm.name,
        price: parseFloat(editForm.price),
        stock: parseInt(editForm.stock, 10),
        unit: editForm.unit,
      })
      .eq('id', id);

    if (error) {
      setError('แก้ไขสินค้าไม่สำเร็จ: ' + error.message);
    } else {
      cancelEdit();
      fetchProducts();
    }
  }

  // ลบสินค้า
  async function handleDelete(id) {
    const confirmDelete = confirm('ยืนยันลบสินค้านี้หรือไม่?');
    if (!confirmDelete) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      setError('ลบสินค้าไม่สำเร็จ: ' + error.message);
    } else {
      fetchProducts();
    }
  }

  return (
    <div>
      <h1>รายการสินค้า</h1>

      {error && (
        <p style={{ color: '#d63031', fontWeight: 'bold' }}>{error}</p>
      )}

      {/* ฟอร์มเพิ่มสินค้าใหม่ */}
      <div className="card">
        <h2>เพิ่มสินค้าใหม่</h2>
        <form onSubmit={handleAddProduct}>
          <div className="form-row">
            <input
              type="text"
              name="sku"
              placeholder="SKU"
              value={form.sku}
              onChange={handleFormChange}
            />
            <input
              type="text"
              name="name"
              placeholder="ชื่อสินค้า"
              value={form.name}
              onChange={handleFormChange}
            />
            <input
              type="number"
              name="price"
              placeholder="ราคา"
              value={form.price}
              onChange={handleFormChange}
              step="0.01"
            />
            <input
              type="number"
              name="stock"
              placeholder="คงเหลือ"
              value={form.stock}
              onChange={handleFormChange}
            />
            <input
              type="text"
              name="unit"
              placeholder="หน่วย"
              value={form.unit}
              onChange={handleFormChange}
            />
            <button type="submit">เพิ่มสินค้า</button>
          </div>
        </form>
      </div>

      {/* ตารางแสดงรายการสินค้า */}
      <div className="card">
        <h2>สินค้าทั้งหมด</h2>
        {loading ? (
          <p>กำลังโหลดข้อมูล...</p>
        ) : products.length === 0 ? (
          <p>ยังไม่มีสินค้าในระบบ</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>ชื่อสินค้า</th>
                <th>ราคา</th>
                <th>คงเหลือ</th>
                <th>หน่วย</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  {editingId === p.id ? (
                    // แถวโหมดแก้ไข
                    <>
                      <td>
                        <input
                          name="sku"
                          value={editForm.sku}
                          onChange={handleEditChange}
                        />
                      </td>
                      <td>
                        <input
                          name="name"
                          value={editForm.name}
                          onChange={handleEditChange}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          name="price"
                          value={editForm.price}
                          onChange={handleEditChange}
                          step="0.01"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          name="stock"
                          value={editForm.stock}
                          onChange={handleEditChange}
                        />
                      </td>
                      <td>
                        <input
                          name="unit"
                          value={editForm.unit}
                          onChange={handleEditChange}
                        />
                      </td>
                      <td>
                        <div className="form-row">
                          <button onClick={() => saveEdit(p.id)}>บันทึก</button>
                          <button onClick={cancelEdit}>ยกเลิก</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    // แถวโหมดแสดงผลปกติ
                    <>
                      <td>{p.sku}</td>
                      <td>{p.name}</td>
                      <td>{p.price}</td>
                      <td>{p.stock}</td>
                      <td>{p.unit}</td>
                      <td>
                        <div className="form-row">
                          <button onClick={() => startEdit(p)}>แก้ไข</button>
                          <button onClick={() => handleDelete(p.id)}>ลบ</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

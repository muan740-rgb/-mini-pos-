'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function HistoryPage() {
  // เก็บรายการประวัติการขายทั้งหมด
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // โหลดข้อมูลประวัติการขายเมื่อเปิดหน้า
  useEffect(() => {
    fetchSales();
  }, []);

  async function fetchSales() {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('sold_at', { ascending: false }); // ล่าสุดไปเก่าสุด

    if (error) {
      setError('โหลดข้อมูลประวัติการขายไม่สำเร็จ: ' + error.message);
    } else {
      setSales(data);
      setError('');
    }
    setLoading(false);
  }

  // คำนวณยอดขายรวมทั้งหมดจาก total_price ของทุกรายการ
  const totalRevenue = sales.reduce(
    (sum, s) => sum + parseFloat(s.total_price || 0),
    0
  );

  // จัดรูปแบบวันเวลาให้อ่านง่าย
  function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div>
      <h1>ประวัติการขาย</h1>

      {error && (
        <p style={{ color: '#d63031', fontWeight: 'bold' }}>{error}</p>
      )}

      {/* สรุปยอดขายรวมทั้งหมด */}
      <div className="card">
        <h2>ยอดขายรวมทั้งหมด</h2>
        <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#00b894' }}>
          {totalRevenue.toFixed(2)} บาท
        </p>
      </div>

      {/* ตารางแสดงรายการขาย */}
      <div className="card">
        <h2>รายการขายทั้งหมด</h2>
        {loading ? (
          <p>กำลังโหลดข้อมูล...</p>
        ) : sales.length === 0 ? (
          <p>ยังไม่มีประวัติการขาย</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>วันเวลาที่ขาย</th>
                <th>ชื่อสินค้า</th>
                <th>จำนวน</th>
                <th>ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>{formatDateTime(s.sold_at)}</td>
                  <td>{s.product_name}</td>
                  <td>{s.quantity}</td>
                  <td>{parseFloat(s.total_price).toFixed(2)} บาท</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

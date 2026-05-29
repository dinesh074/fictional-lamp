'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import dynamic from 'next/dynamic';
import type { Invoice, Payment, Settings, Tenant } from '@/lib/types';
import { formatDate, formatINR, formatMonth } from '@/lib/format';

export const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((m) => m.PDFDownloadLink),
  { ssr: false }
);

const BRAND = '#4f46e5';      // indigo-600
const BRAND_LIGHT = '#eef2ff'; // indigo-50
const ACCENT = '#ec4899';      // pink-500

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  paid:    { bg: '#d1fae5', text: '#065f46' }, // emerald
  pending: { bg: '#fef3c7', text: '#92400e' }, // amber
  overdue: { bg: '#ffe4e6', text: '#9f1239' }, // rose
};

const styles = StyleSheet.create({
  page: { padding: 0, fontSize: 11, fontFamily: 'Helvetica' },
  body: { padding: 32 },
  headerBand: {
    backgroundColor: BRAND,
    color: '#ffffff',
    paddingHorizontal: 32,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  accentStripe: { height: 4, backgroundColor: ACCENT },
  brandName: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  brandSub: { fontSize: 9, color: '#e0e7ff', marginTop: 2 },
  invoiceLabel: { fontSize: 10, color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: 1 },
  invoiceNumber: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginTop: 2 },
  h2: { fontSize: 11, fontWeight: 'bold', marginTop: 16, marginBottom: 6, color: BRAND, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  small: { fontSize: 9, color: '#525252' },
  box: { borderLeftWidth: 3, borderLeftColor: BRAND, borderLeftStyle: 'solid', backgroundColor: BRAND_LIGHT, padding: 10, borderRadius: 4 },
  boxAlt: { borderLeftWidth: 3, borderLeftColor: ACCENT, borderLeftStyle: 'solid', backgroundColor: '#fdf2f8', padding: 10, borderRadius: 4 },
  twoCol: { flexDirection: 'row', gap: 10 },
  colHalf: { flex: 1 },
  tableHead: { flexDirection: 'row', backgroundColor: '#f3f4f6', padding: 8, fontWeight: 'bold', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tableRow: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee', borderStyle: 'solid' },
  tableTotal: { flexDirection: 'row', padding: 10, backgroundColor: BRAND_LIGHT, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  col1: { flex: 3 },
  col2: { flex: 1, textAlign: 'right' },
  totalLabel: { fontSize: 12, fontWeight: 'bold' },
  totalAmount: { fontSize: 14, fontWeight: 'bold', color: BRAND, textAlign: 'right' },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 10,
    fontWeight: 'bold',
    alignSelf: 'flex-start',
  },
});

export interface InvoiceData {
  invoice: Invoice;
  payment: Payment;
  tenant: Tenant;
  settings: Settings;
}

export function InvoiceDoc({ invoice, payment, tenant, settings }: InvoiceData) {
  const status = STATUS_COLOR[payment.status] ?? STATUS_COLOR.pending;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Colored header band */}
        <View style={styles.headerBand}>
          <View>
            <Text style={styles.brandName}>{settings.hostel_name}</Text>
            {settings.hostel_address ? <Text style={styles.brandSub}>{settings.hostel_address}</Text> : null}
            {settings.hostel_phone ? <Text style={styles.brandSub}>Phone: {settings.hostel_phone}</Text> : null}
            {settings.hostel_email ? <Text style={styles.brandSub}>Email: {settings.hostel_email}</Text> : null}
            {settings.hostel_gst ? <Text style={styles.brandSub}>GSTIN: {settings.hostel_gst}</Text> : null}
            {settings.hostel_pan ? <Text style={styles.brandSub}>PAN: {settings.hostel_pan}</Text> : null}
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={styles.invoiceLabel}>Invoice</Text>
            <Text style={styles.invoiceNumber}>#{invoice.invoice_number}</Text>
            <Text style={styles.brandSub}>Date: {formatDate(invoice.created_at)}</Text>
            <Text style={styles.brandSub}>Period: {formatMonth(payment.period_month)}</Text>
          </View>
        </View>
        <View style={styles.accentStripe} />

        <View style={styles.body}>
          <View style={styles.twoCol}>
            <View style={styles.colHalf}>
              <Text style={styles.h2}>Billed to</Text>
              <View style={styles.boxAlt}>
                <Text style={{ fontWeight: 'bold' }}>{tenant.name}</Text>
                {tenant.phone ? <Text style={styles.small}>Phone: {tenant.phone}</Text> : null}
                {tenant.email ? <Text style={styles.small}>Email: {tenant.email}</Text> : null}
                {tenant.pan ? <Text style={styles.small}>PAN: {tenant.pan}</Text> : null}
                {tenant.gst_number ? <Text style={styles.small}>GSTIN: {tenant.gst_number}</Text> : null}
                {tenant.room ? <Text style={styles.small}>Room: {tenant.room.building?.name} / {tenant.room.room_number}</Text> : null}
              </View>
            </View>
            <View style={styles.colHalf}>
              <Text style={styles.h2}>Status</Text>
              <View style={[styles.box, { paddingVertical: 14 }]}>
                <Text style={[styles.statusPill, { backgroundColor: status.bg, color: status.text }]}>
                  {payment.status.toUpperCase()}
                </Text>
                <Text style={[styles.small, { marginTop: 6 }]}>Due: {formatDate(payment.due_date)}</Text>
                {payment.paid_date ? (
                  <Text style={styles.small}>Paid on: {formatDate(payment.paid_date)}{payment.payment_mode ? ` (${payment.payment_mode})` : ''}</Text>
                ) : null}
                {settings.upi_vpa && payment.status !== 'paid' ? (
                  <Text style={[styles.small, { marginTop: 4 }]}>Pay via UPI: {settings.upi_vpa}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <Text style={styles.h2}>Charges</Text>
          <View>
            <View style={styles.tableHead}>
              <Text style={styles.col1}>Description</Text>
              <Text style={styles.col2}>Amount</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.col1}>Rent for {formatMonth(payment.period_month)}</Text>
              <Text style={styles.col2}>{formatINR(payment.amount)}</Text>
            </View>
            <View style={styles.tableTotal}>
              <Text style={[styles.col1, styles.totalLabel]}>Total</Text>
              <Text style={[styles.col2, styles.totalAmount]}>{formatINR(payment.amount)}</Text>
            </View>
          </View>

          {payment.notes ? (
            <>
              <Text style={styles.h2}>Notes</Text>
              <Text style={styles.small}>{payment.notes}</Text>
            </>
          ) : null}

          <Text style={[styles.small, { marginTop: 24, textAlign: 'center', color: '#9ca3af' }]}>
            This is a system-generated invoice from {settings.hostel_name}.
          </Text>
        </View>
      </Page>
    </Document>
  );
}


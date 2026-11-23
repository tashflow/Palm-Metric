import { BUSINESS } from '../data/menu';
import {
  formatSelectedCustomizationsBilingual,
  formatSelectedCustomizationsDetailedBilingual,
} from './customization';
import { formatPrice, roundCurrency } from './format';
import type { CartItem, OrderLineItem, OrderType } from '../types';

export type WhatsAppSummaryLine = CartItem | OrderLineItem;

export function buildBilingualWhatsAppSummary(params: {
  orderNumber: string;
  orderId: string;
  orderType?: OrderType;
  items: WhatsAppSummaryLine[];
  total: number;
  customerName: string;
  customerPhone: string;
  orderNote?: string;
  whatsappNumber?: string;
}): string {
  const safeTotal = roundCurrency(params.total);
  const lines: string[] = [];
  lines.push('🌴 *Palm Metric | بالم مترك*');
  lines.push(`*Order ID / رقم الطلب:* ${params.orderNumber} (${params.orderId})`);
  lines.push('*Order Type / نوع الطلب:* Pickup | استلام من الفرع');
  lines.push('---------------------------');
  lines.push('*Items / الطلبات:*');

  params.items.forEach((item) => {
    const isOrderLine = 'selectedCustomizations' in item || 'temperature' in item || 'specialInstructions' in item;
    const rawTemp = isOrderLine
      ? (item as OrderLineItem).temperature
      : (item as CartItem).temp === 'hot'
        ? 'Hot'
        : (item as CartItem).temp === 'cold'
          ? 'Cold'
          : undefined;
    const tempSuffix = rawTemp
      ? rawTemp === 'Hot'
        ? ' (Hot / حار)'
        : ' (Cold / بارد)'
      : '';

    const nameEn = ('nameEn' in item ? item.nameEn : undefined) || item.name;
    const nameAr = item.nameAr;
    const displayTitle =
      nameAr && nameEn && nameAr !== nameEn
        ? `${nameEn} / ${nameAr}`
        : item.name;
    const lineSubtotal = roundCurrency(item.price * item.quantity);

    lines.push(
      `• ${item.quantity}x ${displayTitle}${tempSuffix} — ${formatPrice(lineSubtotal)} ﷼`,
    );

    const selections = isOrderLine
      ? (item as OrderLineItem).selectedCustomizations
      : (item as CartItem).customizations;
    const detailLines = formatSelectedCustomizationsDetailedBilingual(selections);
    detailLines.forEach((detail) => {
      lines.push(`  - ${detail}`);
    });

    const cleanNote = isOrderLine
      ? (item as OrderLineItem).specialInstructions?.trim()
      : (item as CartItem).note?.trim();
    if (cleanNote) {
      lines.push(`  - Special Instructions / ملاحظات: ${cleanNote}`);
    }
  });

  lines.push('---------------------------');
  lines.push(`*Subtotal / المجموع الفرعي:* ${formatPrice(safeTotal)} ﷼`);
  lines.push(`*Total / الإجمالي:* ${formatPrice(safeTotal)} ﷼`);
  lines.push(`*Customer / العميل:* ${params.customerName}`);
  lines.push(`*Mobile / الجوال:* ${params.customerPhone}`);

  if (params.orderNote?.trim()) {
    lines.push(`*Notes / ملاحظات:* ${params.orderNote.trim()}`);
  }
  lines.push('🏪 Pay upon pickup at branch / الدفع عند الاستلام من الفرع');

  const targetWhatsapp =
    params.whatsappNumber?.replace(/[^\d]/g, '') || BUSINESS.whatsappNumber;
  return `https://wa.me/${targetWhatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function buildOrderLineItems(cart: CartItem[]): OrderLineItem[] {
  return cart.map((item) => {
    const temperature = item.temp
      ? item.temp === 'hot'
        ? ('Hot' as const)
        : ('Cold' as const)
      : undefined;
    const customizationTotal = roundCurrency(
      typeof item.customizationTotal === 'number'
        ? item.customizationTotal
        : (item.customizations ?? []).reduce((sum, c) => sum + c.additionalPrice, 0),
    );
    const basePrice = roundCurrency(
      typeof item.basePrice === 'number'
        ? item.basePrice
        : Math.max(0, item.price - customizationTotal),
    );
    const unitPrice = roundCurrency(item.price);
    const selectedCustomizations =
      item.customizations && item.customizations.length > 0
        ? item.customizations
        : undefined;
    const specialInstructions = item.note.trim() ? item.note.trim().slice(0, 160) : undefined;
    const customSummary = formatSelectedCustomizationsBilingual(selectedCustomizations);
    const mergedNote = [temperature, customSummary, specialInstructions]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 240);

    const milkSelection = selectedCustomizations?.find(
      (c) =>
        c.groupId === 'legacy-milk' ||
        /milk|حليب/i.test(`${c.groupId} ${c.groupName} ${c.optionName}`),
    );
    let milkOption: 'regular' | 'coconut' | undefined;
    let milkExtraPrice: number | undefined;
    if (milkSelection) {
      if (
        milkSelection.optionId === 'coconut' ||
        /coconut|جوز\s*الهند/i.test(`${milkSelection.optionName} ${milkSelection.optionNameAr || ''}`)
      ) {
        milkOption = 'coconut';
        milkExtraPrice = roundCurrency(milkSelection.additionalPrice);
      } else if (
        milkSelection.optionId === 'regular' ||
        /regular|عادي/i.test(`${milkSelection.optionName} ${milkSelection.optionNameAr || ''}`)
      ) {
        milkOption = 'regular';
        milkExtraPrice = roundCurrency(milkSelection.additionalPrice);
      }
    }

    return {
      itemId: item.itemId,
      name: item.name,
      ...(item.nameAr ? { nameAr: item.nameAr } : {}),
      price: unitPrice,
      basePrice,
      customizationTotal,
      quantity: item.quantity,
      ...(selectedCustomizations ? { selectedCustomizations } : {}),
      ...(specialInstructions ? { specialInstructions } : {}),
      note: mergedNote,
      imageUrl: item.imageUrl,
      ...(temperature ? { temperature } : {}),
      ...(milkOption ? { milkOption } : {}),
      ...(milkExtraPrice !== undefined ? { milkExtraPrice } : {}),
    };
  });
}

export interface OrderRequestWhatsAppLine {
  itemId: string;
  name?: string;
  nameAr?: string;
  nameEn?: string;
  quantity: number;
  temperature?: 'Hot' | 'Cold';
  milkOption?: 'none' | 'regular' | 'coconut';
  selectedSizeId?: string;
  specialInstructions?: string;
  selectedCustomizations?: Array<{
    groupId: string;
    optionId: string;
    groupName?: string;
    groupNameAr?: string;
    optionName?: string;
    optionNameAr?: string;
  }>;
}

export function buildBilingualOrderRequestWhatsAppSummary(params: {
  requestNumber: string;
  requestId: string;
  items: OrderRequestWhatsAppLine[];
  customerName: string;
  customerPhone: string;
  orderNote?: string;
  whatsappNumber?: string;
}): string {
  const lines: string[] = [];
  lines.push('🌴 *Palm Metric | بالم مترك*');
  lines.push('*ORDER REQUEST — AWAITING ADMIN CONFIRMATION*');
  lines.push('*طلب مبدئي — بانتظار تأكيد الإدارة والسعر النهائي*');
  lines.push(`*Request Ref / مرجع الطلب المبدئي:* ${params.requestNumber} (${params.requestId})`);
  lines.push('*Service Mode / طريقة الاستلام:* Pickup | استلام من الفرع');
  lines.push('---------------------------');
  lines.push('*Requested Items / الأصناف المطلوبة:*');

  params.items.forEach((item) => {
    const tempSuffix = item.temperature
      ? item.temperature === 'Hot'
        ? ' (Hot / حار)'
        : ' (Cold / بارد)'
      : '';

    const nameEn = item.nameEn || item.name || item.itemId;
    const nameAr = item.nameAr;
    const displayTitle =
      nameAr && nameEn && nameAr !== nameEn ? `${nameEn} / ${nameAr}` : nameEn;

    lines.push(`• ${item.quantity}x ${displayTitle}${tempSuffix}`);

    if (item.selectedSizeId) {
      lines.push(`  - Size / الحجم: ${item.selectedSizeId}`);
    }
    if (item.milkOption && item.milkOption !== 'none') {
      const milkLabel =
        item.milkOption === 'coconut'
          ? 'Coconut Milk / حليب جوز الهند'
          : 'Regular Milk / حليب عادي';
      lines.push(`  - Milk / الحليب: ${milkLabel}`);
    }
    if (item.selectedCustomizations && item.selectedCustomizations.length > 0) {
      item.selectedCustomizations.forEach((sel) => {
        const gLabel =
          sel.groupNameAr && sel.groupName && sel.groupNameAr !== sel.groupName
            ? `${sel.groupName} / ${sel.groupNameAr}`
            : sel.groupName || sel.groupId;
        const oLabel =
          sel.optionNameAr && sel.optionName && sel.optionNameAr !== sel.optionName
            ? `${sel.optionName} / ${sel.optionNameAr}`
            : sel.optionName || sel.optionId;
        lines.push(`  - ${gLabel}: ${oLabel}`);
      });
    }
    if (item.specialInstructions?.trim()) {
      lines.push(`  - Special Instructions / ملاحظات: ${item.specialInstructions.trim()}`);
    }
  });

  lines.push('---------------------------');
  lines.push(
    '*Price & Confirmation / السعر والتأكيد:* Pending Admin Verification (SAR) | بانتظار مراجعة وتأكيد الإدارة بالريال السعودي',
  );
  lines.push(`*Customer / العميل:* ${params.customerName}`);
  lines.push(`*Mobile / الجوال:* ${params.customerPhone}`);

  if (params.orderNote?.trim()) {
    lines.push(`*Notes / ملاحظات:* ${params.orderNote.trim()}`);
  }
  lines.push(
    '⏳ Status: Awaiting Admin review — not confirmed for preparation yet / بانتظار مراجعة الإدارة',
  );

  const targetWhatsapp =
    params.whatsappNumber?.replace(/[^\d]/g, '') || BUSINESS.whatsappNumber;
  return `https://wa.me/${targetWhatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
}


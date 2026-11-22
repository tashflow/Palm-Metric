import {
  MAX_AMOUNT_SAR,
  MAX_CUSTOMIZATION_OPTION_PRICE_SAR,
  OrderBackendError,
} from './types';

export const HALALAS_PER_SAR = 100;
export const MAX_AMOUNT_HALALAS = MAX_AMOUNT_SAR * HALALAS_PER_SAR;
export const MAX_OPTION_PRICE_HALALAS =
  MAX_CUSTOMIZATION_OPTION_PRICE_SAR * HALALAS_PER_SAR;

export function sarToHalalas(
  rawAmount: unknown,
  fieldName = 'price',
  maxHalalas = MAX_AMOUNT_HALALAS,
): number {
  if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount)) {
    throw new OrderBackendError(
      'failed-precondition',
      `Invalid numeric catalog value for ${fieldName}.`,
      'INVALID_CATALOG_PRICE',
    );
  }
  if (rawAmount < 0) {
    throw new OrderBackendError(
      'failed-precondition',
      `Negative ${fieldName} is not allowed in catalog pricing.`,
      'NEGATIVE_CATALOG_PRICE',
    );
  }
  const halalas = Math.round(rawAmount * HALALAS_PER_SAR);
  if (halalas > maxHalalas) {
    throw new OrderBackendError(
      'failed-precondition',
      `Catalog ${fieldName} exceeds maximum allowed bound.`,
      'PRICE_OVERFLOW',
    );
  }
  return halalas;
}

export function halalasToSar(halalas: number): number {
  if (!Number.isFinite(halalas)) {
    throw new OrderBackendError('internal', 'Monetary calculation overflow.');
  }
  return Math.round(halalas) / HALALAS_PER_SAR;
}

export interface ItemPricingComputation {
  basePriceHalalas: number;
  customizationHalalas: number;
  unitPriceHalalas: number;
  lineTotalHalalas: number;
  basePriceSar: number;
  customizationTotalSar: number;
  unitPriceSar: number;
  lineTotalSar: number;
}

export function computeAuthoritativeItemPricing(
  basePriceSar: number,
  optionAdditionalPricesSar: number[],
  quantity: number,
): ItemPricingComputation {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new OrderBackendError(
      'invalid-argument',
      'Quantity must be a positive integer.',
      'INVALID_QUANTITY',
    );
  }

  const basePriceHalalas = sarToHalalas(basePriceSar, 'item basePrice');
  let customizationHalalas = 0;
  for (const addPrice of optionAdditionalPricesSar) {
    customizationHalalas += sarToHalalas(
      addPrice,
      'customization option additionalPrice',
      MAX_OPTION_PRICE_HALALAS,
    );
  }

  const unitPriceHalalas = basePriceHalalas + customizationHalalas;
  const lineTotalHalalas = unitPriceHalalas * quantity;
  if (lineTotalHalalas > MAX_AMOUNT_HALALAS) {
    throw new OrderBackendError(
      'invalid-argument',
      'Order line item total exceeds maximum permitted SAR limit.',
      'LINE_TOTAL_EXCEEDED',
    );
  }

  return {
    basePriceHalalas,
    customizationHalalas,
    unitPriceHalalas,
    lineTotalHalalas,
    basePriceSar: halalasToSar(basePriceHalalas),
    customizationTotalSar: halalasToSar(customizationHalalas),
    unitPriceSar: halalasToSar(unitPriceHalalas),
    lineTotalSar: halalasToSar(lineTotalHalalas),
  };
}

export interface OrderTotalComputation {
  subtotalHalalas: number;
  totalBillHalalas: number;
  subtotalSar: number;
  totalBillSar: number;
}

export function computeAuthoritativeOrderTotals(
  lineTotalsHalalas: number[],
): OrderTotalComputation {
  let subtotalHalalas = 0;
  for (const lineHalalas of lineTotalsHalalas) {
    subtotalHalalas += lineHalalas;
  }

  if (subtotalHalalas < 0 || subtotalHalalas > MAX_AMOUNT_HALALAS) {
    throw new OrderBackendError(
      'invalid-argument',
      'Order total exceeds permitted SAR bounds.',
      'ORDER_TOTAL_EXCEEDED',
    );
  }

  // Pickup-only model: zero delivery charges, zero hidden fees
  const totalBillHalalas = subtotalHalalas;
  return {
    subtotalHalalas,
    totalBillHalalas,
    subtotalSar: halalasToSar(subtotalHalalas),
    totalBillSar: halalasToSar(totalBillHalalas),
  };
}

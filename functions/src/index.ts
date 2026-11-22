import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  createFirestoreOrderStoreAdapter,
  executeAuthoritativeOrderCreation,
} from './orderCreation';
import { OrderBackendError } from './types';

const app = getApps().length ? getApp() : initializeApp();
const db = getFirestore(app);
const orderStore = createFirestoreOrderStoreAdapter(db);

function enforceAppCheckFlag(): boolean {
  return process.env.PALM_METRIC_ENFORCE_APP_CHECK === 'true';
}

export const createPalmMetricOrder = onCall(
  {
    region: 'us-central1',
    cors: true,
    enforceAppCheck: enforceAppCheckFlag(),
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'A valid customer session is required before placing an order.',
      );
    }

    try {
      const result = await executeAuthoritativeOrderCreation(orderStore, request.data, uid);
      logger.info('Order processed by createPalmMetricOrder', {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        uidPrefix: uid.slice(0, 8),
        itemCount: result.items.length,
        totalBill: result.totalBill,
        currency: result.currency,
        idempotentReplay: result.idempotentReplay,
        appCheckVerified: Boolean(request.app),
      });
      return result;
    } catch (error) {
      if (error instanceof OrderBackendError) {
        logger.warn('Order validation rejected', {
          code: error.code,
          reasonCode: error.reasonCode,
          uidPrefix: uid.slice(0, 8),
        });
        throw new HttpsError(error.code, error.message, {
          reasonCode: error.reasonCode,
        });
      }

      logger.error('Unexpected error during order creation', {
        uidPrefix: uid.slice(0, 8),
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new HttpsError(
        'internal',
        'Unable to process your order right now. Please try again.',
      );
    }
  },
);

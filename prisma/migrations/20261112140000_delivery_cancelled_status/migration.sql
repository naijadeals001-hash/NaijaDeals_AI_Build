-- A paid order that is fully refunded or cancelled must leave the courier
-- queue instead of staying pending_assignment. The delivery keeps its recorded
-- history through TrackingEvent, and the terminal status is explicit.
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'cancelled';

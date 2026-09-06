/**
 * Unified data access layer for messages
 * Provides a consistent API for accessing messages from different sources
 * (Dexie/IndexedDB for regular chats)
 */

// Export main service
export { DbService, dbService } from './DbService'

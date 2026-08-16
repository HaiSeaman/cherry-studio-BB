/**
 * @deprecated Scheduled for removal in v2.0.0
 * --------------------------------------------------------------------------
 * ⚠️ NOTICE: V2 DATA&UI REFACTORING (by 0xfullex)
 * --------------------------------------------------------------------------
 * STOP: Feature PRs affecting this file are currently BLOCKED.
 * Only critical bug fixes are accepted during this migration phase.
 *
 * This file is being refactored to v2 standards.
 * Any non-critical changes will conflict with the ongoing work.
 *
 * 🔗 Context & Status:
 * - Contribution Hold: https://github.com/CherryHQ/cherry-studio/issues/10954
 * - v2 Refactor PR   : https://github.com/CherryHQ/cherry-studio/pull/10162
 * --------------------------------------------------------------------------
 */
import type { FileMetadata, QuickPhrase } from '@renderer/types'
import type { TopicType } from '@renderer/types'
// Import necessary types for blocks and new message structure
import type { Message as NewMessage, MessageBlock } from '@renderer/types/newMessage'
import { Dexie, type EntityTable } from 'dexie'

import type { MusicTrack, RadioStation } from '../pages/music/types'
import { upgradeToV5, upgradeToV7, upgradeToV8 } from './upgrades'

// Database declaration (move this to its own module also)
export const db = new Dexie('CherryStudio', {
  chromeTransactionDurability: 'strict'
}) as Dexie & {
  files: EntityTable<FileMetadata, 'id'>
  // type/name/updatedAt 为绘画会话（图片生成 TAB）附加的可选元数据字段，聊天话题不填写
  topics: EntityTable<{ id: string; messages: NewMessage[]; type?: TopicType; name?: string; updatedAt?: string }, 'id'>
  settings: EntityTable<{ id: string; value: any }, 'id'>
  quick_phrases: EntityTable<QuickPhrase, 'id'>
  message_blocks: EntityTable<MessageBlock, 'id'> // Correct type for message_blocks
  // 音乐 TAB（本地播放列表/已添加文件夹/FM 收藏）
  music_tracks: EntityTable<MusicTrack, 'id'>
  music_folders: EntityTable<{ path: string; addedAt: number }, 'path'>
  radio_favorites: EntityTable<RadioStation & { addedAt: number }, 'url'>
}

db.version(1).stores({
  files: 'id, name, origin_name, path, size, ext, type, created_at, count'
})

db.version(2).stores({
  files: 'id, name, origin_name, path, size, ext, type, created_at, count',
  topics: '&id, messages',
  settings: '&id, value'
})

db.version(3).stores({
  files: 'id, name, origin_name, path, size, ext, type, created_at, count',
  topics: '&id, messages',
  settings: '&id, value',
  knowledge_notes: '&id, baseId, type, content, created_at, updated_at'
})

db.version(4).stores({
  files: 'id, name, origin_name, path, size, ext, type, created_at, count',
  topics: '&id, messages',
  settings: '&id, value',
  knowledge_notes: '&id, baseId, type, content, created_at, updated_at',
  translate_history: '&id, sourceText, targetText, sourceLanguage, targetLanguage, createdAt'
})

db.version(5)
  .stores({
    files: 'id, name, origin_name, path, size, ext, type, created_at, count',
    topics: '&id, messages',
    settings: '&id, value',
    knowledge_notes: '&id, baseId, type, content, created_at, updated_at',
    translate_history: '&id, sourceText, targetText, sourceLanguage, targetLanguage, createdAt'
  })
  .upgrade((tx) => upgradeToV5(tx))

db.version(6).stores({
  files: 'id, name, origin_name, path, size, ext, type, created_at, count',
  topics: '&id, messages',
  settings: '&id, value',
  knowledge_notes: '&id, baseId, type, content, created_at, updated_at',
  translate_history: '&id, sourceText, targetText, sourceLanguage, targetLanguage, createdAt',
  quick_phrases: 'id'
})

// --- NEW VERSION 7 ---
db.version(7)
  .stores({
    // Redeclare all tables for the new version
    files: 'id, name, origin_name, path, size, ext, type, created_at, count',
    topics: '&id', // Correct index for topics
    settings: '&id, value',
    knowledge_notes: '&id, baseId, type, content, created_at, updated_at',
    translate_history: '&id, sourceText, targetText, sourceLanguage, targetLanguage, createdAt',
    quick_phrases: 'id',
    message_blocks: 'id, messageId, file.id' // Correct syntax with comma separator
  })
  .upgrade((tx) => upgradeToV7(tx))

db.version(8)
  .stores({
    // Redeclare all tables for the new version
    files: 'id, name, origin_name, path, size, ext, type, created_at, count',
    topics: '&id', // Correct index for topics
    settings: '&id, value',
    knowledge_notes: '&id, baseId, type, content, created_at, updated_at',
    translate_history: '&id, sourceText, targetText, sourceLanguage, targetLanguage, createdAt',
    quick_phrases: 'id',
    message_blocks: 'id, messageId, file.id' // Correct syntax with comma separator
  })
  .upgrade((tx) => upgradeToV8(tx))

db.version(9).stores({
  // Redeclare all tables for the new version
  files: 'id, name, origin_name, path, size, ext, type, created_at, count',
  topics: '&id', // Correct index for topics
  settings: '&id, value',
  knowledge_notes: '&id, baseId, type, content, created_at, updated_at',
  translate_history: '&id, sourceText, targetText, sourceLanguage, targetLanguage, createdAt',
  translate_languages: '&id, langCode',
  quick_phrases: 'id',
  message_blocks: 'id, messageId, file.id' // Correct syntax with comma separator
})

db.version(10).stores({
  files: 'id, name, origin_name, path, size, ext, type, created_at, count',
  topics: '&id',
  settings: '&id, value',
  quick_phrases: 'id',
  message_blocks: 'id, messageId, file.id'
})

// --- NEW VERSION 11：音乐 TAB 三张表（本地曲目/已添加文件夹/FM 收藏） ---
db.version(11).stores({
  files: 'id, name, origin_name, path, size, ext, type, created_at, count',
  topics: '&id',
  settings: '&id, value',
  quick_phrases: 'id',
  message_blocks: 'id, messageId, file.id',
  music_tracks: '++id, &filePath, order, favorite',
  music_folders: '&path',
  radio_favorites: '&url'
})

export default db

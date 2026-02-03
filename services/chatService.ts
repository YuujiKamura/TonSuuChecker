// チャット履歴サービス - IndexedDB版
import * as idb from './indexedDBService';
import { ChatMessage } from '../types';

// チャット履歴を保存
export const saveChatHistory = async (analysisId: string, messages: ChatMessage[]): Promise<void> => {
  await idb.saveChatHistory(analysisId, messages);
};

// チャット履歴を読み込み
export const loadChatHistory = async (analysisId: string): Promise<ChatMessage[]> => {
  return idb.getChatHistory(analysisId) as Promise<ChatMessage[]>;
};

// 全チャット履歴を取得
export const getAllChatHistories = async (): Promise<Record<string, ChatMessage[]>> => {
  return idb.getAllChatHistories() as Promise<Record<string, ChatMessage[]>>;
};

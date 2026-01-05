import { supabase } from '../../config/database.js';

// ============================================================
// Types
// ============================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  references?: ReferenceChunk[];
  metadata?: Record<string, any>;
}

export interface ReferenceChunk {
  id: number;
  sourceId: string;
  sourceTitle: string;
  content: string;
  chunkIndex: number;
  similarity?: number;
  rrfScore?: number; // Reciprocal Rank Fusion score from hybrid search
  vectorRank?: number | bigint; // Rank from vector search
  keywordRank?: number | bigint; // Rank from keyword search
}

export interface Conversation {
  id: string;
  notebook_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

// ============================================================
// Chat History Service
// ============================================================

export class ChatHistoryService {
  /**
   * Get or create a conversation for a notebook
   */
  async getOrCreateConversation(userId: string, notebookId: string): Promise<Conversation> {
    // Try to get existing conversation
    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('notebook_id', notebookId)
      .maybeSingle();

    if (existing && !fetchError) {
      console.log(`[ChatHistoryService] Found existing conversation: ${existing.id}`);
      return existing;
    }

    // Create new conversation
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        notebook_id: notebookId,
        title: 'New Chat',
      })
      .select()
      .single();

    if (error) {
      console.error('[ChatHistoryService] Error creating conversation:', error);
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    console.log(`[ChatHistoryService] Created new conversation: ${data.id}`);
    return data as Conversation;
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, limit = 50): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[ChatHistoryService] Error fetching messages:', error);
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return (data || []).map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      created_at: msg.created_at,
      references: msg.references as ReferenceChunk[] | undefined,
      metadata: msg.metadata as Record<string, any> | undefined,
    }));
  }

  /**
   * Get conversation with messages
   */
  async getConversationWithMessages(
    userId: string,
    notebookId: string,
    messageLimit = 50
  ): Promise<ConversationWithMessages | null> {
    const conversation = await this.getOrCreateConversation(userId, notebookId);
    const messages = await this.getMessages(conversation.id, messageLimit);

    return {
      ...conversation,
      messages,
    };
  }

  /**
   * Add a user message
   */
  async addUserMessage(
    conversationId: string,
    userId: string,
    content: string
  ): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'user',
        content,
      })
      .select()
      .single();

    if (error) {
      console.error('[ChatHistoryService] Error adding user message:', error);
      throw new Error(`Failed to add user message: ${error.message}`);
    }

    return data as Message;
  }

  /**
   * Add an assistant message with references
   */
  async addAssistantMessage(
    conversationId: string,
    userId: string,
    content: string,
    references: ReferenceChunk[],
    metadata?: Record<string, any>
  ): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'assistant',
        content,
        references: references as any,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('[ChatHistoryService] Error adding assistant message:', error);
      throw new Error(`Failed to add assistant message: ${error.message}`);
    }

    console.log(`[ChatHistoryService] Added assistant message with ${references.length} references`);
    return data as Message;
  }

  /**
   * Clear all messages in a conversation
   */
  async clearConversation(conversationId: string, userId: string): Promise<void> {
    // First verify ownership
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!conv) {
      throw new Error('Conversation not found or access denied');
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (error) {
      console.error('[ChatHistoryService] Error clearing conversation:', error);
      throw new Error(`Failed to clear conversation: ${error.message}`);
    }

    console.log(`[ChatHistoryService] Cleared conversation: ${conversationId}`);
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    // Verify ownership
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!conv) {
      throw new Error('Conversation not found or access denied');
    }

    // Messages will be cascade deleted
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) {
      console.error('[ChatHistoryService] Error deleting conversation:', error);
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }

    console.log(`[ChatHistoryService] Deleted conversation: ${conversationId}`);
  }

  /**
   * Rename a conversation
   */
  async renameConversation(
    conversationId: string,
    userId: string,
    title: string
  ): Promise<void> {
    // Verify ownership
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!conv) {
      throw new Error('Conversation not found or access denied');
    }

    const { error } = await supabase
      .from('conversations')
      .update({ title })
      .eq('id', conversationId);

    if (error) {
      console.error('[ChatHistoryService] Error renaming conversation:', error);
      throw new Error(`Failed to rename conversation: ${error.message}`);
    }

    console.log(`[ChatHistoryService] Renamed conversation to: ${title}`);
  }

  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId: string): Promise<Conversation[]> {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[ChatHistoryService] Error fetching user conversations:', error);
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }

    return (data || []) as Conversation[];
  }
}

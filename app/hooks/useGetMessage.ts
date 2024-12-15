import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface Message {
  id: string;
  sender: 'buyer' | 'seller';
  content: string;
  time: string;
  type: 'text' | 'image';
  imageUrl?: string;
  imageThumb?: {
    url: string;
    height: number;
    width: number;
  };
}

export function useConversationMessages(conversationId: string | null, shopId: number) {
  const [messages, setMessagesState] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<string | null>(null);

  const setMessages = useCallback((updater: (prevMessages: Message[]) => Message[]) => {
    setMessagesState(updater);
  }, []);

  const fetchMessages = useCallback(async (offset?: string) => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/msg/get_message?_=${Date.now()}`, {
        params: {
          conversationId,
          shopId,
          pageSize: 25,
          offset
        }
      });
      const formattedMessages = response.data.response.messages.map((msg: any) => ({
        id: msg.message_id,
        sender: msg.from_shop_id === shopId ? 'seller' : 'buyer',
        type: msg.message_type,
        content: msg.message_type === 'text' ? msg.content.text : '',
        imageUrl: msg.message_type === 'image' ? msg.content.url : undefined,
        imageThumb: msg.message_type === 'image' ? {
          url: msg.content.thumb_url || msg.content.url,
          height: msg.content.thumb_height,
          width: msg.content.thumb_width
        } : undefined,
        time: new Date(msg.created_timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));
      
      if (offset) {
        setMessagesState(prevMessages => [...formattedMessages.reverse(), ...prevMessages]);
      } else {
        setMessagesState(formattedMessages.reverse());
      }
      
      setNextOffset(response.data.response.page_result.next_offset);
    } catch (err) {
      setError(offset ? 'Gagal memuat pesan tambahan' : 'Gagal mengambil pesan');
      console.error('Error fetching messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, shopId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!conversationId) return;

    const handleSSEMessage = (event: CustomEvent) => {
      const data = event.detail;
      
      if (data.type === 'new_message' && data.conversationId === conversationId) {
        const newMessage: Message = {
          id: data.messageId,
          sender: data.fromShopId === shopId ? 'seller' : 'buyer',
          type: data.messageType,
          content: data.messageType === 'text' ? data.content.text : '',
          imageUrl: data.messageType === 'image' ? data.content.url : undefined,
          imageThumb: data.messageType === 'image' ? {
            url: data.content.thumbUrl || data.content.url,
            height: data.content.thumbHeight,
            width: data.content.thumbWidth
          } : undefined,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prevMessages => [...prevMessages, newMessage]);
      }
    };

    window.addEventListener('sse-message', handleSSEMessage as EventListener);

    return () => {
      window.removeEventListener('sse-message', handleSSEMessage as EventListener);
    };
  }, [conversationId, shopId]);

  const loadMoreMessages = useCallback(() => {
    if (nextOffset) {
      fetchMessages(nextOffset);
    }
  }, [fetchMessages, nextOffset]);

  const addNewMessage = (newMessage: Message) => {
    setMessages(prevMessages => [...prevMessages, newMessage]);
  };

  return {
    messages,
    setMessages,
    isLoading,
    error,
    loadMoreMessages,
    hasMoreMessages: !!nextOffset,
    addNewMessage
  };
}

import { shareService } from '../../service/shareService';
import type { Share, ShareSettings, Snippet } from '../../types/snippets';
import { createCustomEvent, EVENTS } from '../../constants/events';

export const createShare = async (
  snippetId: string, 
  settings: ShareSettings
): Promise<Share> => {
  try {
    const share = await shareService.createShare(snippetId, settings);
    window.dispatchEvent(createCustomEvent(EVENTS.SHARE_CREATED));
    return share;
  } catch (error) {
    console.error('Error creating share:', error);
    throw error;
  }
};

export const getSharesBySnippetId = async (snippetId: string): Promise<Share[]> => {
  try {
    return await shareService.getSharesBySnippetId(snippetId);
  } catch (error) {
    console.error('Error fetching shares:', error);
    throw error;
  }
};

export const deleteShare = async (shareId: string): Promise<void> => {
  try {
    await shareService.deleteShare(shareId);
    window.dispatchEvent(createCustomEvent(EVENTS.SHARE_DELETED));
  } catch (error) {
    console.error('Error deleting share:', error);
    throw error;
  }
};

export const getSharedSnippet = async (shareId: string): Promise<Snippet> => {
  try {
    return await shareService.getSharedSnippet(shareId);
  } catch (error) {
    console.error('Error fetching shared snippet:', error);
    throw error;
  }
};
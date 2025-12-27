import { supabase } from '../../config/database.js';

export class SupabaseStorageService {
  async uploadFile(
    userId: string,
    noteId: string,
    file: Buffer,
    fileName: string,
    contentType: string
  ): Promise<string> {
    console.log('[Storage] Starting file upload:', {
      userId,
      noteId,
      fileName,
      contentType,
      fileSize: file.length,
    });

    if (file.length === 0) {
      throw new Error('File buffer is empty');
    }

    const filePath = `${userId}/${noteId}/${Date.now()}-${fileName}`;
    console.log('[Storage] Uploading to path:', filePath);

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('[Storage] Upload failed:', {
        message: error.message,
        statusCode: error.statusCode,
      });
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    console.log('[Storage] Upload successful:', data.path);

    const {
      data: { publicUrl },
    } = supabase.storage.from('documents').getPublicUrl(filePath);

    console.log('[Storage] Public URL generated:', publicUrl);
    return publicUrl;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const path = fileUrl.split('/documents/')[1];
      const { error } = await supabase.storage.from('documents').remove([path]);

      if (error) {
        console.error('Supabase storage delete error:', error);
        throw new Error(`Failed to delete file: ${error.message}`);
      }
    } catch (error) {
      console.error('Delete file error:', error);
      throw new Error('Failed to delete file');
    }
  }
}

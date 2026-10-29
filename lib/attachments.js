import crypto from 'node:crypto';

export const BUCKET='message-attachments';
export const MAX_FILE=10*1024*1024;
export const MAX_TOTAL=20*1024*1024;
export const MAX_FILES=10;
const TYPES={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',doc:'application/msword',xls:'application/vnd.ms-excel',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
export function fileMetadata(filename,size){
  const clean=String(filename||'attachment').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g,'').slice(0,180);
  const extension=clean.split('.').at(-1).toLowerCase();
  if(!TYPES[extension])throw new Error('Supported files: PNG, JPEG, GIF, WebP, PDF, TXT, CSV, DOC/DOCX, XLS/XLSX.');
  if(!Number.isSafeInteger(size)||size<1||size>MAX_FILE)throw new Error('Each file must be between 1 byte and 10 MB.');
  return {filename:clean,mime_type:TYPES[extension],file_size:size};
}
export function validateBytes(bytes,mime){
  const start=bytes.subarray(0,16),hex=start.toString('hex'),ascii=start.toString('ascii');
  const valid=mime==='image/png'?hex.startsWith('89504e470d0a1a0a'):
    mime==='image/jpeg'?hex.startsWith('ffd8ff'):
    mime==='image/gif'?ascii.startsWith('GIF87a')||ascii.startsWith('GIF89a'):
    mime==='image/webp'?ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP':
    mime==='application/pdf'?ascii.startsWith('%PDF-'):
    /officedocument/.test(mime)?hex.startsWith('504b0304'):
    ['application/msword','application/vnd.ms-excel'].includes(mime)?hex.startsWith('d0cf11e0a1b11ae1'):true;
  if(!valid)throw new Error('File content does not match its format.');
}
export function stableAttachmentId(org,message,id){
  const hex=crypto.createHash('sha256').update(`${org}:${message}:${id}`).digest('hex').slice(0,32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

import {BUCKET, validateBytes} from './attachments.js';

const LIMITS={
  'image/png':5*1024*1024,
  'image/jpeg':5*1024*1024,
  'image/webp':5*1024*1024,
  'application/pdf':2*1024*1024,
  'text/plain':100*1024,
  'text/csv':100*1024,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':2*1024*1024
};
const MAX_FILES=2;
const MAX_TOTAL=6*1024*1024;
const safeName=value=>String(value||'attachment').replace(/[\x00-\x1f\x7f\\/]/g,'').slice(0,180);
const display=row=>({filename:safeName(row.filename),mimeType:row.mime_type});

export async function loadCopilotAttachments(sb,ticket,messages){
  const inboundIds=messages.filter(message=>message.direction==='inbound').map(message=>message.id);
  if(!inboundIds.length)return {parts:[],analyzed:[],skipped:[]};
  const {data,error}=await sb.from('message_attachments')
    .select('id,organization_id,ticket_id,message_id,filename,mime_type,file_size,storage_path,status,created_at')
    .eq('organization_id',ticket.organization_id).eq('ticket_id',ticket.id).eq('status','ready')
    .in('message_id',inboundIds).order('created_at',{ascending:false}).limit(20);
  if(error)throw new Error('Could not read attachments. Try again.');
  const parts=[],analyzed=[],skipped=[];let total=0;
  for(const row of data||[]){
    const item=display(row),limit=LIMITS[row.mime_type],size=Number(row.file_size);
    if(row.organization_id!==ticket.organization_id||row.ticket_id!==ticket.id||!inboundIds.includes(row.message_id)||row.status!=='ready')continue;
    if(!limit){skipped.push({...item,reason:'Format is not supported for AI analysis.'});continue;}
    if(analyzed.length>=MAX_FILES){skipped.push({...item,reason:'Two newest supported files are the limit.'});continue;}
    if(!Number.isSafeInteger(size)||size<1||size>limit||total+size>MAX_TOTAL){skipped.push({...item,reason:'File exceeds the AI analysis size limit.'});continue;}
    const prefix=`${ticket.organization_id}/${ticket.id}/${row.id}/`;
    if(typeof row.storage_path!=='string'||!row.storage_path.startsWith(prefix)){
      skipped.push({...item,reason:'Storage path did not match this conversation.'});continue;
    }
    try{
      const {data:file,error:downloadError}=await sb.storage.from(BUCKET).download(row.storage_path);
      if(downloadError||!file)throw new Error('Download failed.');
      const bytes=Buffer.from(await file.arrayBuffer());
      if(bytes.length!==size)throw new Error('File size did not match.');
      validateBytes(bytes,row.mime_type);
      if(row.mime_type.startsWith('text/')){
        const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/\u0000/g,'');
        parts.push({type:'input_text',text:`Attachment ${JSON.stringify(item.filename)} (${row.mime_type}):\n${content}`});
      }else if(row.mime_type.startsWith('image/')){
        parts.push({type:'input_text',text:`Attachment ${analyzed.length+1}: ${JSON.stringify(item.filename)} (${row.mime_type}). The next image is this file.`});
        parts.push({type:'input_image',image_url:`data:${row.mime_type};base64,${bytes.toString('base64')}`,detail:'high'});
      }else{
        parts.push({type:'input_text',text:`Attachment ${analyzed.length+1}: ${JSON.stringify(item.filename)} (${row.mime_type}). The next file is this attachment.`});
        parts.push({type:'input_file',filename:item.filename,file_data:`data:${row.mime_type};base64,${bytes.toString('base64')}`,...(row.mime_type==='application/pdf'?{detail:'low'}:{})});
      }
      total+=size;analyzed.push(item);
    }catch{
      skipped.push({...item,reason:'Could not read or validate this file.'});
    }
  }
  return {parts,analyzed,skipped};
}

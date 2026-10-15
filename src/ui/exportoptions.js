import { reportsBlob } from '../engine/export-log.js';
const KEY='wv.export.optimized.v1';
export function mountExportOptions({save,share,onMessage},root=document) {
  const toggle=root.querySelector('#exOptimized'), button=root.querySelector('#exLogs');
  if(!toggle || !button)return;
  try{toggle.checked=localStorage.getItem(KEY)==='true';}catch{toggle.checked=false;}
  toggle.addEventListener('change',()=>{try{localStorage.setItem(KEY,String(toggle.checked));}catch{/* session only */}});
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const blob=await reportsBlob();
      const result=await save(blob,`webvid-export-logs-${new Date().toISOString().slice(0,10)}.json`);
      onMessage('گزارش‌ها ذخیره شدند؛ برای مقایسه می‌توانید همین فایل JSON را بفرستید.');
      if(result.canShare && result.uri)await share(result.uri,'گزارش خروجی webVid');
    }catch(e){onMessage('ذخیرهٔ گزارش ناموفق بود: '+e.message);}
    finally{button.disabled=false;}
  });
}

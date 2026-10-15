/** Local-only diagnostic reports. No code, lyrics, media bytes, titles or file paths. */
const MAX_REPORTS = 20, DB = 'wv-export-diagnostics-v1';
const now = () => performance.now();
const native = () => !!globalThis.window?.Capacitor?.isNativePlatform?.();
let nativePlugin;
async function systemSnapshot() {
  if (!native()) return null;
  try {
    nativePlugin ||= import('@capacitor/core').then(({registerPlugin}) => registerPlugin('MediaSaver'));
    return await (await nativePlugin).systemSnapshot();
  } catch { return null; }
}
function openDB() {
  return new Promise((resolve,reject) => {
    const r = indexedDB.open(DB,1);
    r.onupgradeneeded = () => r.result.createObjectStore('runs',{keyPath:'id'});
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function transact(fn, mode = 'readonly') {
  const db = await openDB();
  try { return await new Promise((resolve,reject) => {
    const tx = db.transaction('runs',mode); let result;
    fn(tx.objectStore('runs'),v => {result=v;});
    tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function listExportLogs() {
  return transact((store,set) => {const r=store.getAll();r.onsuccess=()=>set(r.result.sort((a,b)=>a.startedAt.localeCompare(b.startedAt)));});
}
async function persist(report) {
  // Browser DB is also the index for the "save reports" button on Android.
  const errors = [];
  try {
    await transact(store => { store.put(report); const r=store.getAll(); r.onsuccess=()=>r.result.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(MAX_REPORTS).forEach(x=>store.delete(x.id)); },'readwrite');
  } catch { errors.push('indexeddb-unavailable'); }
  if (native()) {
    try {
      const {Filesystem,Directory} = await import('@capacitor/filesystem');
      await Filesystem.writeFile({path:`export-logs/${report.id}.json`,directory:Directory.Data,recursive:true,data:JSON.stringify(report),encoding:'utf8'});
      // Retain at most 20 native reports too, without touching video/media files.
      const dir=await Filesystem.readdir({path:'export-logs',directory:Directory.Data});
      const files=dir.files.map(x=>x.name).filter(x=>/^run-[a-zA-Z0-9-]+\.json$/.test(x)).sort().reverse();
      await Promise.all(files.slice(MAX_REPORTS).map(path=>Filesystem.deleteFile({path:'export-logs/'+path,directory:Directory.Data}).catch(()=>{})));
    } catch { errors.push('private-log-file-unavailable'); }
  }
  return errors;
}
export async function reportsBlob() {
  let runs;
  try { runs=await listExportLogs(); } catch { runs=[]; }
  // Recover native files if IndexedDB was blocked or cleared.
  if (native()) {
    try {
      const {Filesystem,Directory}=await import('@capacitor/filesystem');
      const dir=await Filesystem.readdir({path:'export-logs',directory:Directory.Data});
      for(const file of dir.files.filter(x=>/^run-[a-zA-Z0-9-]+\.json$/.test(x.name)).slice(-MAX_REPORTS)) {
        try { const r=await Filesystem.readFile({path:'export-logs/'+file.name,directory:Directory.Data,encoding:'utf8'}); const run=JSON.parse(r.data); if(!runs.some(x=>x.id===run.id))runs.push(run); } catch { /* corrupt individual report */ }
      }
    } catch { /* no native files */ }
  }
  if(!runs.length)throw new Error('هنوز گزارش ذخیره‌شده‌ای وجود ندارد');
  return new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),runs},null,2)],{type:'application/json'});
}
export async function fingerprint(value) {
  try {
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  } catch { return null; } // Explicitly incomparable if unavailable; never substitute a weak hash.
}
export async function startExportLog(settings, {snapshot=systemSnapshot,save=persist,clock=now} = {}) {
  const started=clock(), report={schemaVersion:1,implementation:'hw-sliced-save-v1',id:`run-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,startedAt:new Date().toISOString(),status:'running',settings,
    environment:{userAgent:globalThis.navigator?.userAgent || null,native:native(),cores:globalThis.navigator?.hardwareConcurrency || null,build:import.meta.env?.VITE_BUILD_SHA || 'unknown'},
    timingsMs:{},counts:{},details:{},warnings:[],samples:[],limitations:['Hardware preference is not verification of hardware encoding.','CPU/PSS measures the Android host process only; WebView/Pyodide renderer and system codec/GPU may be separate processes.','Battery temperature is not CPU temperature; current is whole-device instantaneous, not export energy.','Sampling can miss peaks; stage timers overlap with asynchronous encoder work.','Both modes use in-memory MP4 muxing; optimized storage only avoids the additional whole-file save buffer.','Render-profile inclusive spans overlap: compare selfMs or same-level totals, not summed inclusiveMs. Canvas timers do not isolate deferred GPU work. Python frame timing includes packing and the bridge.']};
  let busy=false,stopped=false,observer,timer,sampleJob=null, polls=0, saves=Promise.resolve();
  const checkpoint=()=>{saves=saves.then(()=>save(report)).catch(()=>['log-persistence-failed']).then(errors=>{for(const code of errors)if(!report.warnings.includes(code))report.warnings.push(code);return errors;});return saves;};
  const log={report, add(key,ms){if(Number.isFinite(ms)&&ms>=0)report.timingsMs[key]=(report.timingsMs[key]||0)+ms;}, count(key,n=1){report.counts[key]=(report.counts[key]||0)+n;}, detail(key,value){report.details[key]=value;},warn(code){if(!report.warnings.includes(code))report.warnings.push(code);},
    async measure(key,fn){const t=clock();try{return await fn();}finally{log.add(key,clock()-t);}},
    async finish(status,error){
      stopped=true;clearInterval(timer);observer?.disconnect();if(sampleJob)await sampleJob;
      await sample();report.status=status;report.finishedAt=new Date().toISOString();report.timingsMs.total=clock()-started;
      // Do not persist error messages that may embed source code, titles or private paths.
      if(error)report.error={name:error.name||'Error',stage:report.details.activeStage||'unknown'};
      await saves;const errors=await checkpoint();report.persistenceErrors=errors;
      return report;
    }};
  async function sample() {
    if(busy)return;busy=true;
    try {
      const system=await Promise.race([Promise.resolve().then(snapshot).catch(()=>null),new Promise(r=>setTimeout(()=>r(null),1500))]);
      const item={atMs:clock()-started,stage:report.details.activeStage||'setup',system,jsHeapBytes:performance.memory?.usedJSHeapSize ?? null,hidden:globalThis.document?.hidden ?? null};
      if(report.samples.length<250)report.samples.push(item);else report.samples[249]=item;
      if(!system)log.warn('native-system-metrics-unavailable');
    } finally {busy=false;}
  }
  await sample();
  const errors=await checkpoint();errors.forEach(code=>log.warn(code));
  try {observer=new PerformanceObserver(list=>{for(const e of list.getEntries()){log.count('longTasks');log.add('longTasks',e.duration);}});observer.observe({entryTypes:['longtask']});}catch{log.warn('longtask-observer-unavailable');}
  timer=setInterval(()=>{if(!stopped)sampleJob=sample().then(()=>{if(++polls%6===0)return checkpoint();});},5000);
  return log;
}

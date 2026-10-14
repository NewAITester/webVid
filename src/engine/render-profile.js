/** Export-only synchronous spans; fixed labels and anonymous layer ordinals, no source/title/IDs. */
const contexts = new WeakMap();
const TYPES = new Set(['text','shape','image','video','spectrum','code','adjust','null']);
const STAGES = new Set(['frame.render','scene.background','scene.behind','scene.lyrics','scene.idle','scene.text','scene.front','scene.screenFx','scene.finish','grade.bloom','grade.tone','grade.vignette','grade.grain','layer.total','layer.evaluate','layer.content','layer.buffer','layer.filters','layer.composite','code.compile','code.execute','python.frameAndPack','python.pixelUpload','python.composite']);
export const profileContext = ctx => contexts.get(ctx) || null;
export function withProfileContext(ctx, profile, layer, fn) {
  if (!profile) return fn();
  const previous = contexts.get(ctx); contexts.set(ctx,{profile,layer});
  try { return fn(); } finally { if(previous)contexts.set(ctx,previous);else contexts.delete(ctx); }
}
export function createRenderProfile(log, layers = [], {clock=()=>performance.now(),maxBuckets=512} = {}) {
  if (!log) return null;
  const rows=[], buckets=new Map(), ordinals=new WeakMap(), stack=[];
  layers.forEach((L,index)=>{if(L && typeof L==='object')ordinals.set(L,index);});
  const data={version:1,enabled:true,clock:'performance.now',renderCalls:0,redrawCalls:0,slowestFrames:[],instrumentationOps:0,droppedSpans:0,incompleteSpans:0,buckets:rows,
    semantics:'Synchronous wall time. inclusiveMs includes children; selfMs excludes nested profiled spans. Do not sum inclusive rows. Canvas GPU execution may be deferred. python.frameAndPack includes Python execution and frame packing/bridge, not Python function-only time.'};
  log.detail('renderProfile',data);
  function begin(stage,L=null) {
    if(!STAGES.has(stage)) {data.droppedSpans++;return null;}
    const ordinal=L ? ordinals.get(L) : null;
    const layerIndex=Number.isInteger(ordinal) && ordinal<128 ? ordinal : (L ? -1 : null);
    const type=L ? (TYPES.has(L.type)?L.type:'other') : null;
    const key=`${stage}:${layerIndex}:${type}`;
    let row=buckets.get(key);
    if(!row) {
      if(rows.length>=maxBuckets){data.droppedSpans++;return null;}
      row={stage,layerIndex,type,calls:0,inclusiveMs:0,selfMs:0,maxMs:0,minMs:null,failedCalls:0};
      buckets.set(key,row);rows.push(row);
    }
    data.instrumentationOps++;
    const token={row,at:clock(),childMs:0};stack.push(token);return token;
  }
  function end(token,failed=false) {
    if(!token)return;
    if(stack[stack.length-1]!==token){data.incompleteSpans++;return;}
    const ms=Math.max(0,clock()-token.at);stack.pop();
    if(stack.length)stack[stack.length-1].childMs+=ms;
    const r=token.row;r.calls++;r.inclusiveMs+=ms;r.selfMs+=Math.max(0,ms-token.childMs);
    r.maxMs=Math.max(r.maxMs,ms);r.minMs=r.minMs===null?ms:Math.min(r.minMs,ms);if(failed)r.failedCalls++;
    data.instrumentationOps++;
  }
  const profile={data,begin,end,run(stage,L,fn){const token=begin(stage,L);let failed=true;try{const value=fn();failed=false;return value;}finally{end(token,failed);}},
    frame(fn,redraw=false,location=null){
      data.renderCalls++;if(redraw)data.redrawCalls++;
      const token=begin('frame.render');let failed=true;
      try {const value=fn();failed=false;return value;}
      finally {
        const durationMs=token ? Math.max(0,clock()-token.at) : null;
        end(token,failed);
        if(durationMs!==null && Number.isInteger(location?.index) && Number.isFinite(location?.timeSeconds)) {
          const list=data.slowestFrames;
          if(list.length<8 || durationMs>list[list.length-1].durationMs) {
            list.push({frameIndex:location.index,timeSeconds:location.timeSeconds,durationMs,redraw,failed});
            list.sort((a,b)=>b.durationMs-a.durationMs);if(list.length>8)list.pop();
          }
        }
      }
    },
    finish(){data.incompleteSpans+=stack.length;stack.length=0;}};
  return profile;
}

import {useEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import {A_LIMIT,B_LIMIT,fmtAngulation,fmtRotation} from './core/geometry';
import {bestOfPad,createPad,DEFAULT_PAD_STEP} from './core/pad';
import type {BestView,Pad} from './core/pad';
import {findSegment} from './core/tree';
import {STANDARD_VIEWS} from './core/views';
import type {GraftId,System,Visibility,CoronaryTree} from './core/types';
import type {PadReply,PadRequest} from './pad.worker';

export type PadMode='none'|'foreshortening'|'overlap'|'combined';
const MODES:{id:PadMode;text:string;title:string}[]=[
 {id:'combined',text:'Vista clara',title:'Acortamiento y superposición combinados: claro donde el segmento se ve largo y sin vasos encima'},
 {id:'foreshortening',text:'Acortamiento',title:'Solo el acortamiento del segmento'},
 {id:'overlap',text:'Superposición',title:'Solo la superposición de otros vasos'}];
const MARGIN={l:40,r:6,t:8,b:30};
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const pct=(x:number)=>Math.round(x*100);

export interface AngioPadProps{tree:CoronaryTree;vis:Visibility;a:number;b:number;sel:string|null;mode:PadMode;onMode:(m:PadMode)=>void;onSet:(a:number,b:number)=>void;onGo:(a:number,b:number)=>void}

/** Pad map of the selected segment, computed progressively in a worker; `state` is 'wait' (no segment), 'busy', 'done', 'hidden' or 'error'. */
function usePadMap(tree:CoronaryTree,system:System,ramus:boolean,grafts:GraftId[],sel:string|null){
 const [state,setState]=useState<'wait'|'busy'|'done'|'hidden'|'error'>('wait'),[version,setVersion]=useState(0);
 const pad=useRef<Pad>(createPad(DEFAULT_PAD_STEP)),rows=useRef(0),worker=useRef<Worker|null>(null),request=useRef(0);
 const graftKey=grafts.join(',');
 useEffect(()=>{
  if(!sel){request.current++;setState('wait');return;}
  let w=worker.current;
  if(!w){
   try{w=new Worker(new URL('./pad.worker.ts',import.meta.url),{type:'module'});}catch{setState('error');return;}
   w.onmessage=(e:MessageEvent<PadReply>)=>{
    const m=e.data;if(m.id!==request.current)return;
    if(m.hidden){setState('hidden');return;}
    const p=pad.current;
    p.foreshortening.set(m.f,m.j0*m.na);p.overlap.set(m.o,m.j0*m.na);p.combined.set(m.c,m.j0*m.na);
    rows.current=m.j1;setVersion(v=>v+1);if(m.j1>=m.nb)setState('done');
   };
   w.onerror=()=>setState('error');
   worker.current=w;
  }
  const id=++request.current;
  pad.current=createPad(DEFAULT_PAD_STEP);rows.current=0;setState('busy');setVersion(v=>v+1);
  w.postMessage({id,tree,system,ramus,grafts:graftKey?graftKey.split(',') as GraftId[]:[],segmentId:sel,step:DEFAULT_PAD_STEP} satisfies PadRequest);
 },[tree,system,ramus,graftKey,sel]);
 useEffect(()=>()=>{worker.current?.terminate();worker.current=null;},[]);
 return {pad:pad.current,rows:rows.current,state,version};
}

const ramp=(t:number)=>{const k=Math.pow(clamp(t,0,1),1.4);return [12+k*150,18+k*172,28+k*190];};

export default function AngioPad({tree,vis,a,b,sel,mode,onMode,onSet,onGo}:AngioPadProps){
 const grafts=useMemo(()=>[...vis.grafts],[vis.grafts]);
 const {pad,rows,state,version}=usePadMap(tree,vis.system,vis.ramus,grafts,sel);
 const wrap=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),drag=useRef(false);
 const [width,setWidth]=useState(300),[dpr,setDpr]=useState(1);
 const segment=sel?findSegment(tree,sel)?.segment:undefined;
 const best:BestView|null=useMemo(()=>state==='done'?bestOfPad(pad):null,[state,pad]);
 const plotW=Math.max(120,width-MARGIN.l-MARGIN.r),plotH=Math.round(plotW/2),height=plotH+MARGIN.t+MARGIN.b;
 useEffect(()=>{
  const el=wrap.current;if(!el)return;
  const measure=()=>{setWidth(Math.floor(el.clientWidth));setDpr(Math.min(2,window.devicePixelRatio||1));};
  measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect();
 },[]);
 const views=useMemo(()=>STANDARD_VIEWS.filter(v=>vis.system==='both'||v.group===(vis.system==='left'?'izquierda':'derecha')),[vis.system]);

 useEffect(()=>{
  const cv=canvas.current;if(!cv)return;
  cv.width=Math.round(width*dpr);cv.height=Math.round(height*dpr);
  const g=cv.getContext('2d');if(!g)return;
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,width,height);
  const px=MARGIN.l,py=MARGIN.t,X=(av:number)=>px+(av+A_LIMIT)/(2*A_LIMIT)*plotW,Y=(bv:number)=>py+(B_LIMIT-bv)/(2*B_LIMIT)*plotH;
  // Map (light = good), rows flipped so CRA is on top.
  const data=mode==='none'?null:mode==='foreshortening'?pad.foreshortening:mode==='overlap'?pad.overlap:pad.combined;
  g.fillStyle='#0d1117';g.fillRect(px,py,plotW,plotH);
  if(data&&sel&&state!=='hidden'&&state!=='error'){
   const img=new ImageData(pad.na,pad.nb);
   for(let j=0;j<pad.nb;j++)for(let i=0;i<pad.na;i++){
    const v=data[j*pad.na+i],t=j>=rows?0:mode==='combined'?v:1-v,o=((pad.nb-1-j)*pad.na+i)*4,[r,gg,bb]=ramp(t);
    img.data[o]=r;img.data[o+1]=gg;img.data[o+2]=bb;img.data[o+3]=255;
   }
   const off=document.createElement('canvas');off.width=pad.na;off.height=pad.nb;off.getContext('2d')!.putImageData(img,0,0);
   g.imageSmoothingEnabled=true;g.drawImage(off,px,py,plotW,plotH);
  }
  g.strokeStyle='#2b323b';g.lineWidth=1;g.strokeRect(px+.5,py+.5,plotW-1,plotH-1);
  g.font='10px ui-monospace,Menlo,Consolas,monospace';g.fillStyle='#7d8791';g.textBaseline='middle';
  g.textAlign='center';
  for(const v of [-90,-60,-30,0,30,60,90]){g.fillText(String(Math.abs(v)),X(v),py+plotH+9);g.fillStyle='#1d232a';g.fillRect(X(v),py+plotH-3,1,3);g.fillStyle='#7d8791';}
  g.fillText('OAD',X(-90)+8,py+plotH+21);g.fillText('AP',X(0),py+plotH+21);g.fillText('OAI',X(90)-8,py+plotH+21);
  g.textAlign='right';
  for(const v of [-45,-30,-15,0,15,30,45]){g.fillText(String(Math.abs(v)),px-5,Y(v));}
  g.fillText('CRA',px-24,py+3);g.fillText('CAU',px-24,py+plotH-3);
  // Standard-view windows of the injected system.
  g.setLineDash([3,3]);g.strokeStyle='#8f9aa5';g.fillStyle='#cdd4da';g.textAlign='center';g.font='9px ui-monospace,Menlo,Consolas,monospace';g.lineWidth=1;
  for(const v of views){
   for(const [k,w] of [v.window,v.altWindow].entries()){
    if(!w)continue;
    const x0=X(w.aMin),x1=X(w.aMax),y0=Y(w.bMax),y1=Y(w.bMin),ww=Math.max(6,x1-x0),hh=Math.max(6,y1-y0);
    g.beginPath();g.roundRect(x0,y0,ww,hh,4);g.stroke();
    if(k===0)g.fillText(v.padLabel,x0+ww/2,y0+hh/2);
   }
  }
  g.setLineDash([]);
  if(best){g.strokeStyle='#ffffff';g.lineWidth=1.5;g.beginPath();g.arc(X(best.a),Y(best.b),6,0,Math.PI*2);g.stroke();}
  const cx=X(clamp(a,-A_LIMIT,A_LIMIT)),cy=Y(clamp(b,-B_LIMIT,B_LIMIT));
  g.strokeStyle='#ff9d2e';g.lineWidth=1;g.beginPath();g.moveTo(cx-9,cy);g.lineTo(cx+9,cy);g.moveTo(cx,cy-9);g.lineTo(cx,cy+9);g.stroke();
  g.fillStyle='#ff9d2e';g.beginPath();g.arc(cx,cy,3.5,0,Math.PI*2);g.fill();
 },[width,height,dpr,plotW,plotH,mode,pad,rows,version,state,sel,views,best,a,b]);

 const fromEvent=(e:PointerEvent)=>{
  const r=canvas.current!.getBoundingClientRect(),x=(e.clientX-r.left-MARGIN.l)/plotW,y=(e.clientY-r.top-MARGIN.t)/plotH;
  onSet(Math.round(clamp(x,0,1)*2*A_LIMIT-A_LIMIT),Math.round(B_LIMIT-clamp(y,0,1)*2*B_LIMIT));
 };
 const key=(e:KeyboardEvent)=>{
  const s=e.shiftKey?5:1;
  if(e.key==='ArrowLeft')onSet(clamp(a-s,-A_LIMIT,A_LIMIT),b);
  else if(e.key==='ArrowRight')onSet(clamp(a+s,-A_LIMIT,A_LIMIT),b);
  else if(e.key==='ArrowUp')onSet(a,clamp(b+s,-B_LIMIT,B_LIMIT));
  else if(e.key==='ArrowDown')onSet(a,clamp(b-s,-B_LIMIT,B_LIMIT));
  else if(e.key==='Home')onGo(0,0);
  else return;
  e.preventDefault();
 };
 const name=segment?.name??'';
 return <section className="angio-panel angio-pad" aria-label="Mapa de ángulos">
  <div className="angio-pad-read"><output>{fmtRotation(a)}<br/>{fmtAngulation(b)}</output></div>
  <div className="angio-pad-main">
   <div ref={wrap} className="angio-pad-wrap" style={{height}}>
    <canvas ref={canvas} style={{width,height}} tabIndex={0} role="application" aria-label="Mapa de ángulos: rotación en horizontal, angulación en vertical" aria-description="Con las flechas se mueve 1 grado; con Mayús, 5 grados; Inicio vuelve a AP."
     onKeyDown={key} onPointerDown={e=>{drag.current=true;e.currentTarget.setPointerCapture(e.pointerId);fromEvent(e);}} onPointerMove={e=>{if(drag.current)fromEvent(e);}} onPointerUp={()=>{drag.current=false;}} onPointerCancel={()=>{drag.current=false;}}/>
    {!sel&&mode!=='none'&&<p className="angio-pad-hint">Elegí un segmento en el angiograma o en el corazón para ver su mapa</p>}
   </div>
   <div className="angio-pad-bar">
    <span className="angio-label">EL MAPA MUESTRA</span>
    <div className="angio-seg" role="group" aria-label="El mapa muestra">{MODES.map(m=><button key={m.id} className={mode===m.id?'on':''} aria-pressed={mode===m.id} title={m.title} onClick={()=>onMode(m.id)}>{m.text}</button>)}</div>
   </div>
   <p className="angio-pad-best" aria-live="polite">{!sel?<span className="angio-hint">Elegí un segmento en el angiograma o en el corazón para ver su mapa</span>
    :state==='hidden'?<span className="angio-hint">{name||'El segmento'} no está visible con el sistema inyectado actual.</span>
    :state==='error'?<span className="angio-hint">No se pudo calcular el mapa en este navegador.</span>
    :best?<button className="angio-best" onClick={()=>onGo(best.a,best.b)} title="Ir a esa vista"><i className="ring"/>vista más clara de {name}: {pct(best.foreshortening)} % acortada · {pct(best.overlap)} % superpuesta</button>
    :<span className="angio-hint">Calculando la vista más clara de {name}…</span>}</p>
  </div>
 </section>;
}

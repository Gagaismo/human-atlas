import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {FIELD_SIZE,clampAngles,fieldOffset,fmtAngles,projectWith,imageAxes} from './core/geometry';
import {FAMILY_PALETTE,sampleSegment} from './core/tree';
import type {CoronaryTree,Family,Vec3,Visibility} from './core/types';
import {CINE_END,createAngioRenderer,injectedVessels,type AngioRenderer,type Highlight} from './angiogram-render';

export interface AngiogramViewProps{tree:CoronaryTree;vis:Visibility;a:number;b:number;selected:string|null;labels:boolean;color:boolean;onSelect:(segmentId:string|null)=>void;
 /** Dragging the image turns the C-arm (S21): called continuously with the new angles; the shell applies its own limits. Without it, dragging pans the table. */
 onAngles?:(a:number,b:number)=>void}

const NO_WEBGL='Esta vista necesita WebGL 2, que este navegador tiene desactivado o no admite. Probá con una versión actual de Chrome, Firefox o Safari.';
const HIT_PX=8,DRAG_PX=4,PAN_NOTE_PX=3,PAN_MAX=1.2,FADE_MS=250,HOVER_MS=150,DEG_PER_PX=.25;

/** Cine fill and highlight fades are skipped for people who ask for less motion. */
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
/** "CINE 1,8 s": Spanish decimal comma. */
const cineText=(seconds:number)=>`CINE ${Math.min(seconds,CINE_END).toFixed(1).replace('.',',')} s`;

interface Seg{id:string;short:string;full:string;numbered:boolean;family:Family;pts:Vec3[];mid:Vec3}
interface Lbl{id:string;text:string;x:number;y:number;selected:boolean;family:Family}

/** "DA prox" → "DAp", "CD distal" → "CDd": compact name for the labels on the image. */
const SUFFIX:Record<string,string>={prox:'p',media:'m',dist:'d',distal:'d',apical:'a'};
function abbreviate(short:string):string{
 const m=/^(\S+) (prox|media|dist|distal|apical)$/.exec(short);
 return m?m[1]+SUFFIX[m[2]]:short;
}

const SYSTEM_TEXT={left:'TCI',right:'CD',both:'TCI + CD'} as const;

const T_MONO:CSSProperties={fontFamily:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',position:'absolute',pointerEvents:'none',color:'#d9dde0',textShadow:'0 1px 2px #000'};

export default function AngiogramView(props:AngiogramViewProps){
 const {tree,vis,a,b,selected,labels:showLabels,color}=props;
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const latest=useRef(props);latest.current=props;
 const gl=useRef<AngioRenderer|null>(null),pan=useRef<[number,number]>([0,0]);
 const raf=useRef(0),anim=useRef(0),sizeRef=useRef(0),drawRef=useRef(()=>{});
 // Cine fill (S14): when the injection started (performance.now), and the cross-fade between the previous and the current selection.
 const fillStart=useRef(0),cine=useRef<HTMLSpanElement>(null),lblKey=useRef('');
 const fade=useRef({cur:{id:null,weight:0} as Highlight,prev:{id:null,weight:0} as Highlight,at:0});
 // Hover (S20): the segment under the pointer; its overlay fades out before the next one fades in.
 const hoverWant=useRef<string|null>(null),hover=useRef({id:null,weight:0} as Highlight),[hoverOn,setHoverOn]=useState(false);
 const [side,setSide]=useState(0),[failed,setFailed]=useState(false),[panned,setPanned]=useState(false),[lbls,setLbls]=useState<Lbl[]>([]);

 const graftKey=[...vis.grafts].sort().join(',');
 const {vessels,segs}=useMemo(()=>{
  const vessels=injectedVessels(tree,vis),segs:Seg[]=[];
  for(const vessel of vessels)for(const s of vessel.segments){
   const sm=sampleSegment(vessel,s,2);
   if(sm.points.length<1)continue;
   segs.push({id:s.id,short:abbreviate(s.short),full:s.short,numbered:s.syntax!=='',family:vessel.family,pts:sm.points,mid:sm.points[sm.points.length>>1]});
  }
  return {vessels,segs};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[tree,vis.system,vis.ramus,graftKey]);

 /** Table pan as the renderer sees it: the user's pan plus the centring on the heart at these angles (the same field for every injected system). */
 const effPan=useCallback((ax:ReturnType<typeof imageAxes>):[number,number]=>{
  const o=fieldOffset(ax);return [pan.current[0]+o[0],pan.current[1]+o[1]];
 },[]);
 const project=useCallback((p:Vec3,ax:ReturnType<typeof imageAxes>):[number,number]=>{
  const q=projectWith(ax,p),S=sizeRef.current,h=FIELD_SIZE/2,e=effPan(ax);
  return [(q.x/h+e[0]+1)/2*S,(1-(q.y/h+e[1]))/2*S];
 },[effPan]);

 drawRef.current=()=>{
  const {a,b,selected,color,labels:showLabels}=latest.current,S=sizeRef.current;
  if(!gl.current||S<=0)return;
  const now=performance.now(),calm=reducedMotion(),fd=fade.current,dt=fd.at?Math.min(now-fd.at,64):0;
  fd.at=now;
  if(selected!==fd.cur.id){   // selection changed: the old overlay fades out while the new one fades in
   if(fd.cur.id&&fd.cur.id!==selected)fd.prev={...fd.cur};
   fd.cur=selected&&selected===fd.prev.id?{id:selected,weight:fd.prev.weight}:{id:selected,weight:0};
   if(fd.cur.id===fd.prev.id)fd.prev={id:null,weight:0};
  }
  const step=calm?1:dt/FADE_MS;
  fd.cur.weight=Math.min(1,fd.cur.weight+step);
  fd.prev.weight=Math.max(0,fd.prev.weight-step);
  if(fd.prev.weight<=0)fd.prev={id:null,weight:0};
  const elapsed=calm?CINE_END:(now-fillStart.current)/1000;
  const hv=hover.current,hs=calm?1:dt/HOVER_MS;
  if(hv.id!==hoverWant.current){hv.weight=Math.max(0,hv.weight-hs);if(hv.weight<=0)hv.id=hoverWant.current;}
  else if(hv.id)hv.weight=Math.min(1,hv.weight+hs);
  gl.current.render({a,b,pan:effPan(imageAxes(a,b)),color,sel:fd.cur,prev:fd.prev,hover:hv,fill:elapsed});
  if(cine.current)cine.current.textContent=cineText(elapsed);
  if(elapsed<CINE_END||fd.cur.weight<1||fd.prev.weight>0||hv.id!==hoverWant.current||(hv.id&&hv.weight<1))request();
  const ax=imageAxes(a,b),out:Lbl[]=[];
  const want=segs.filter(s=>s.id===selected||(showLabels&&s.numbered));
  if(want.length){
   const boxes:{x0:number;y0:number;x1:number;y1:number}[]=[];
   const order=[...want].sort((p,q)=>(q.id===selected?1:0)-(p.id===selected?1:0));
   const cand=[[0,-13],[0,13],[16,0],[-16,0],[13,-13],[-13,13],[13,13],[-13,-13],[0,-26],[0,26],[28,0],[-28,0]];
   for(const s of order){
    const sel=s.id===selected,text=sel?s.full:s.short,[mx,my]=project(s.mid,ax);
    const w=text.length*7+8,h=15;
    for(const [dx,dy] of cand){
     const cx=mx+dx*(w/32+.5),cy=my+dy,x0=cx-w/2,y0=cy-h/2,x1=cx+w/2,y1=cy+h/2;
     if(x0<2||y0<2||x1>S-2||y1>S-2)continue;
     if(!sel&&boxes.some(r=>x0<r.x1&&x1>r.x0&&y0<r.y1&&y1>r.y0))continue;
     boxes.push({x0,y0,x1,y1});out.push({id:s.id,text,x:cx,y:cy,selected:sel,family:s.family});break;
    }
   }
  }
  const key=out.map(l=>`${l.id}:${l.x.toFixed(0)}:${l.y.toFixed(0)}:${l.selected}`).join('|');
  if(key!==lblKey.current){lblKey.current=key;setLbls(out);}
 };
 const request=useCallback(()=>{
  if(raf.current)return;
  raf.current=requestAnimationFrame(()=>{raf.current=0;drawRef.current();});
 },[]);

 // Renderer lifetime and panel size.
 useEffect(()=>{
  const el=host.current!,cv=canvas.current!;
  const r=createAngioRenderer(cv);
  if(!r){setFailed(true);return;}
  gl.current=r;
  const lost=(e:Event)=>e.preventDefault();
  cv.addEventListener('webglcontextlost',lost);
  const ro=new ResizeObserver(()=>{
   const s=Math.floor(Math.min(el.clientWidth,el.clientHeight));
   sizeRef.current=s;r.resize(s,devicePixelRatio);setSide(s);request();
  });
  ro.observe(el);
  return ()=>{
   ro.disconnect();cv.removeEventListener('webglcontextlost',lost);cancelAnimationFrame(raf.current);raf.current=0;cancelAnimationFrame(anim.current);
   r.dispose();gl.current=null;
  };
 },[request]);

 // A new injection (system, dominance, ramus, grafts, first load) restarts the fill from the ostium; angle changes do not.
 useEffect(()=>{gl.current?.setScene(tree,vessels);fillStart.current=performance.now();request();},[tree,vessels,request,failed]);
 useEffect(()=>{request();},[a,b,selected,color,showLabels,segs,side,request]);

 const setPan=useCallback((x:number,y:number)=>{
  pan.current=[Math.max(-PAN_MAX,Math.min(PAN_MAX,x)),Math.max(-PAN_MAX,Math.min(PAN_MAX,y))];
  setPanned(Math.hypot(...pan.current)*sizeRef.current/2>PAN_NOTE_PX);
  request();
 },[request]);
 const recentre=useCallback(()=>{
  cancelAnimationFrame(anim.current);
  const [x0,y0]=pan.current,t0=performance.now();
  const step=(now:number)=>{
   const k=Math.min(1,(now-t0)/280),e=1-Math.pow(1-k,3);
   setPan(x0*(1-e),y0*(1-e));
   if(k<1)anim.current=requestAnimationFrame(step);else{pan.current=[0,0];setPanned(false);request();}
  };
  anim.current=requestAnimationFrame(step);
 },[setPan,request]);
 // Changing the injected system recentres the field.
 const firstSystem=useRef(true);
 useEffect(()=>{if(firstSystem.current){firstSystem.current=false;return;}recentre();},[vis.system,recentre]);

 // Pointer: one finger / mouse drags the table; a tap without drag selects the nearest segment.
 // Pointer (S21): left/middle button or one finger turns the C-arm (like grabbing the heart: right → OAD, down → CRA); Shift, right button or two fingers pan the table;
 // a press without movement selects. Touches are tracked so the second finger turns the gesture into a pan.
 type Drag={id:number;x:number;y:number;px:number;py:number;a0:number;b0:number;mode:'rotate'|'pan';moved:boolean};
 const drag=useRef<Drag|null>(null),touches=useRef(new Map<number,[number,number]>()),idle=useRef(false);
 const hit=(x:number,y:number):string|null=>{
  const ax=imageAxes(latest.current.a,latest.current.b);
  let best:string|null=null,bd=HIT_PX;
  for(const s of segs){
   const q=s.pts.map(p=>project(p,ax));
   for(let i=0;i<q.length;i++){
    const [x0,y0]=q[i],[x1,y1]=q[Math.min(i+1,q.length-1)],dx=x1-x0,dy=y1-y0,l2=dx*dx+dy*dy;
    const t=l2>0?Math.max(0,Math.min(1,((x-x0)*dx+(y-y0)*dy)/l2)):0;
    const d=Math.hypot(x0+dx*t-x,y0+dy*t-y);
    if(d<bd){bd=d;best=s.id;}
   }
  }
  return best;
 };
 const setHover=(id:string|null)=>{
  if(hoverWant.current===id)return;
  hoverWant.current=id;setHoverOn(id!==null);request();
 };
 const centroid=()=>{const v=[...touches.current.values()];return [v.reduce((t,p)=>t+p[0],0)/v.length,v.reduce((t,p)=>t+p[1],0)/v.length] as const;};
 const onDown=(e:React.PointerEvent<HTMLDivElement>)=>{
  if(e.pointerType==='touch'){
   touches.current.set(e.pointerId,[e.clientX,e.clientY]);
   if(touches.current.size>=2){   // two fingers: pan from the centroid; the first finger's pending tap is cancelled
    cancelAnimationFrame(anim.current);setHover(null);idle.current=true;
    const [cx,cy]=centroid();drag.current={id:-1,x:cx,y:cy,px:pan.current[0],py:pan.current[1],a0:0,b0:0,mode:'pan',moved:true};
    return;
   }
   idle.current=false;
  }else if(e.button>2)return;
  if(drag.current)return;
  cancelAnimationFrame(anim.current);
  e.currentTarget.setPointerCapture(e.pointerId);
  const {a:a0,b:b0}=latest.current,pans=e.pointerType!=='touch'&&(e.button===2||e.shiftKey)||!latest.current.onAngles;
  drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,px:pan.current[0],py:pan.current[1],a0,b0,mode:pans?'pan':'rotate',moved:e.button===2};
 };
 const onMove=(e:React.PointerEvent<HTMLDivElement>)=>{
  const d=drag.current;
  if(e.pointerType==='touch'){
   if(touches.current.has(e.pointerId))touches.current.set(e.pointerId,[e.clientX,e.clientY]);
   if(d&&d.id===-1&&touches.current.size>=2){const [cx,cy]=centroid();setPan(d.px+(cx-d.x)*2/sizeRef.current,d.py-(cy-d.y)*2/sizeRef.current);return;}
  }
  if(e.pointerType==='mouse'&&(!d||!d.moved)){const r=e.currentTarget.getBoundingClientRect();setHover(hit(e.clientX-r.left,e.clientY-r.top));}
  if(!d||d.id!==e.pointerId)return;
  const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(!d.moved&&Math.hypot(dx,dy)<DRAG_PX)return;
  d.moved=true;setHover(null);
  if(d.mode==='rotate'){const c=clampAngles(d.a0-dx*DEG_PER_PX,d.b0+dy*DEG_PER_PX);latest.current.onAngles?.(c.a,c.b);}
  else setPan(d.px+dx*2/sizeRef.current,d.py-dy*2/sizeRef.current);
 };
 const onUp=(e:React.PointerEvent<HTMLDivElement>)=>{
  if(e.pointerType==='touch'){touches.current.delete(e.pointerId);if(touches.current.size===0){const was=idle.current;idle.current=false;if(was){drag.current=null;return;}}else{drag.current=null;return;}}
  const d=drag.current;
  if(!d||d.id!==e.pointerId)return;
  drag.current=null;
  if(!d.moved&&e.button===0&&!e.shiftKey){const r=e.currentTarget.getBoundingClientRect();latest.current.onSelect(hit(e.clientX-r.left,e.clientY-r.top));}
 };
 const onCancel=(e:React.PointerEvent<HTMLDivElement>)=>{
  touches.current.delete(e.pointerId);
  if(drag.current?.id===e.pointerId||touches.current.size===0)drag.current=null;
  setHover(null);
 };
 const onLeave=()=>{if(!drag.current)setHover(null);};

 const sys=SYSTEM_TEXT[vis.system];
 const square:CSSProperties={position:'relative',width:side,height:side,overflow:'hidden',background:'#9a9a9a',borderRadius:4,touchAction:'none',userSelect:'none'};
 return (
  <div ref={host} style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',minWidth:0,minHeight:0}}>
   <div style={failed?{...square,width:'100%',height:'100%',background:'#15191d',display:'flex',alignItems:'center',justifyContent:'center',padding:24,cursor:'default'}:{...square,cursor:hoverOn?'pointer':'grab'}}
    onPointerDown={failed?undefined:onDown} onPointerMove={failed?undefined:onMove} onPointerUp={failed?undefined:onUp} onPointerCancel={onCancel} onPointerLeave={failed?undefined:onLeave} onContextMenu={e=>e.preventDefault()} onMouseDown={e=>{if(e.button===1)e.preventDefault();}}>
    <canvas ref={canvas} role="img" aria-label={`Angiograma simulado, ${fmtAngles(a,b)}, sistema inyectado ${sys}`} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:failed?'none':'block'}}/>
    {failed?<p style={{color:'#cfd5da',fontSize:14,lineHeight:1.5,textAlign:'center',maxWidth:360,margin:0}}>{NO_WEBGL}</p>:<>
     {lbls.map(l=>(
      <span key={l.id} style={{...T_MONO,left:l.x,top:l.y,transform:'translate(-50%,-50%)',fontSize:11,lineHeight:'15px',padding:'0 3px',borderRadius:3,whiteSpace:'nowrap',
       color:l.selected?'#1a1006':color?FAMILY_PALETTE[l.family]:'#f2f4f5',background:l.selected?'#ff9a2e':'#0009',fontWeight:l.selected?700:500}}>{l.text}</span>
     ))}
     <span style={{...T_MONO,left:10,top:8,fontSize:15,fontWeight:600,letterSpacing:'.04em'}}>{fmtAngles(a,b)}</span>
     <span style={{...T_MONO,right:10,top:8,fontSize:15,fontWeight:600,letterSpacing:'.04em',textAlign:'right'}}>{sys}
      <span ref={cine} aria-hidden style={{display:'block',fontSize:10,fontWeight:500,letterSpacing:'.08em',opacity:.8}}>{cineText(CINE_END)}</span>
      {vis.system==='both'&&<span style={{display:'block',fontSize:9,fontWeight:500,letterSpacing:'.08em',opacity:.8}}>AMBAS: SOLO DOCENTE</span>}</span>
     <span style={{...T_MONO,left:10,bottom:8,fontSize:9,letterSpacing:'.1em',opacity:.75,lineHeight:'13px'}}>ANATOMÍA DE REFERENCIA<br/>FONDO: SIMULADO</span>
     {panned&&<div style={{position:'absolute',left:0,right:0,bottom:8,display:'flex',flexDirection:'column',alignItems:'center',gap:6,pointerEvents:'none'}}>
      <span style={{...T_MONO,position:'static',fontSize:11,background:'#000b',padding:'3px 8px',borderRadius:4,textAlign:'center',maxWidth:'80%'}}>Se movió la mesa. Centrá el campo en el sistema inyectado.</span>
      <button type="button" onClick={recentre} onPointerDown={e=>e.stopPropagation()}
       style={{pointerEvents:'auto',cursor:'pointer',font:'600 12px ui-monospace,Consolas,monospace',color:'#f3f4f4',background:'#263b48',border:'1px solid #4a6578',borderRadius:5,padding:'5px 12px'}}>Recentrar</button>
     </div>}
    </>}
   </div>
  </div>
 );
}

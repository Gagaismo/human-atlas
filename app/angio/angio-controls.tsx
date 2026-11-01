import {useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import {A_LIMIT,B_LIMIT,fmtAngulation,fmtAngles,fmtRotation} from './core/geometry';
import {STANDARD_VIEWS} from './core/views';
import type {StandardView} from './core/views';
import type {System} from './core/types';

const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const rotationText=(a:number)=>a<0?`OAD ${-a} grados`:a>0?`OAI ${a} grados`:'AP, 0 grados';
const angulationText=(b:number)=>b<0?`CAU ${-b} grados`:b>0?`CRA ${b} grados`:'0 grados, sin angulación';
const anglesOf=(v:StandardView)=>v.a===0&&v.b===0?'0 / 0':fmtAngles(v.a,v.b);

interface SliderProps{label:string;value:number;limit:number;vertical?:boolean;text:(v:number)=>string;ticks:number;onChange:(v:number)=>void}
/** Accessible slider with whole-degree steps: arrows ±1, Shift ±5, Home → 0 (AP). Vertical sliders grow upwards (CRA on top). */
function AngleSlider({label,value,limit,vertical,text,ticks,onChange}:SliderProps){
 const track=useRef<HTMLDivElement>(null),drag=useRef(false);
 const at=(e:PointerEvent)=>{
  const r=track.current!.getBoundingClientRect();
  const t=vertical?1-(e.clientY-r.top)/r.height:(e.clientX-r.left)/r.width;
  onChange(Math.round(clamp(t,0,1)*2*limit-limit));
 };
 const key=(e:KeyboardEvent)=>{
  const step=e.shiftKey?5:1;
  const dir=e.key==='ArrowRight'||e.key==='ArrowUp'?1:e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:0;
  if(dir){e.preventDefault();onChange(clamp(value+dir*step,-limit,limit));}
  else if(e.key==='Home'){e.preventDefault();onChange(0);}
 };
 const pos=(value+limit)/(2*limit)*100;
 return <div ref={track} className={`angio-slider ${vertical?'vertical':''}`} role="slider" tabIndex={0} aria-label={label} aria-orientation={vertical?'vertical':'horizontal'}
  aria-valuemin={-limit} aria-valuemax={limit} aria-valuenow={Math.round(value)} aria-valuetext={text(Math.round(value))}
  onKeyDown={key} onPointerDown={e=>{drag.current=true;e.currentTarget.setPointerCapture(e.pointerId);at(e);}}
  onPointerMove={e=>{if(drag.current)at(e);}} onPointerUp={()=>{drag.current=false;}} onPointerCancel={()=>{drag.current=false;}}>
  {Array.from({length:ticks+1},(_,i)=><i key={i} className={i===ticks/2?'tick mid':i%3===0?'tick major':'tick'} style={vertical?{bottom:`${i/ticks*100}%`}:{left:`${i/ticks*100}%`}}/>)}
  <b className="thumb" style={vertical?{bottom:`${pos}%`}:{left:`${pos}%`}}/>
 </div>;
}

export interface AngioControlsProps{a:number;b:number;sys:System;onSet:(a:number,b:number)=>void;onGo:(a:number,b:number)=>void;onView:(v:StandardView)=>void}

export default function AngioControls({a,b,sys,onSet,onGo,onView}:AngioControlsProps){
 const [hint,setHint]=useState<StandardView|null>(null);
 const active=STANDARD_VIEWS.find(v=>v.a===Math.round(a)&&v.b===Math.round(b)&&(sys==='both'||v.group===(sys==='left'?'izquierda':'derecha')))??null,shown=hint??active;
 const group=(g:StandardView['group'],title:string)=><>
  <div className="angio-label angio-section">{title}</div>
  <div className="angio-views">{STANDARD_VIEWS.filter(v=>v.group===g).map(v=>{
   const on=active?.id===v.id&&active.group===v.group;
   return <button key={v.id} className={`angio-view-btn ${on?'on':''}`} aria-pressed={on} title={v.description}
    onClick={()=>onView(v)} onMouseEnter={()=>setHint(v)} onMouseLeave={()=>setHint(null)} onFocus={()=>setHint(v)} onBlur={()=>setHint(null)}>
    <span className="name">{v.name}</span><span className="angles">{anglesOf(v)}</span></button>;
  })}</div></>;
 return <section className="angio-panel angio-controls" aria-label="Controles del arco en C">
  <div className="angio-controls-top">
   <div className="angio-rotation">
    <div className="angio-label">CONTROLES</div>
    <div className="angio-label sub">ROTACIÓN <span>OAD / OAI</span></div>
    <output className="angio-big" aria-live="off">{fmtRotation(a)}</output>
    <AngleSlider label="Rotación OAD / OAI" value={a} limit={A_LIMIT} ticks={36} text={rotationText} onChange={v=>onSet(v,b)}/>
    <div className="angio-ends"><span>OAD 90</span><span>0</span><span>OAI 90</span></div>
    <button className="angio-home" onClick={()=>onGo(0,0)} title="Volver a la vista frontal (Inicio)">AP, 0 grados</button>
   </div>
   <div className="angio-angulation">
    <span className="angio-end">CRA 45</span>
    <AngleSlider label="Angulación CRA / CAU" value={b} limit={B_LIMIT} vertical ticks={18} text={angulationText} onChange={v=>onSet(a,v)}/>
    <span className="angio-end">CAU 45</span>
   </div>
  </div>
  <div className="angio-label sub angulation-readout">ANGULACIÓN <span>CRA / CAU</span><output className="angio-big small">{fmtAngulation(b)}</output></div>
  {group('izquierda','CORONARIA IZQUIERDA')}
  {group('derecha','CORONARIA DERECHA')}
  <p className="angio-view-desc" aria-live="polite">{shown?<><b>{shown.name}</b> · {shown.description} <em>(a validar)</em></>:'Pasá el cursor o enfocá una vista para leer para qué sirve.'}</p>
  <details className="angio-view-list"><summary>Para qué sirve cada vista</summary>
   {STANDARD_VIEWS.map(v=><p key={v.id}><b>{v.group==='izquierda'?'Izquierda':'Derecha'} · {v.name}</b> <span>{anglesOf(v)}</span><br/>{v.description}</p>)}
   <p className="angio-hint">Descripciones propias, a validar por un docente.</p></details>
 </section>;
}

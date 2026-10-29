import {useMemo,useState} from 'react';
import {ArrowLeft,RotateCcw,TriangleAlert} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import KinesioScene from './kinesio-scene';
import {MODE_NAMES,MUSCLE_NAMES,POSITION_NAMES,STRETCHES} from './catalog';
import {BASE_POSE,composePose,mirrorPose,muscleKey} from './pose';
import type {JointAngles,JointId,Motion,MuscleId,Side} from './types';

// Manual adjustment controls, in the catalog's right-side frame (mirrored for the left side).
const CONTROLS:{joint:JointId;motion:Motion;label:string;min:number;max:number}[]=[
 {joint:'hip_r',motion:'flexion',label:'Cadera: flexión (+) / extensión (−)',min:-20,max:140},
 {joint:'hip_r',motion:'abduction',label:'Cadera: abducción (+) / aducción (−)',min:-30,max:45},
 {joint:'hip_r',motion:'rotation',label:'Cadera: rotación interna (+) / externa (−)',min:-60,max:30},
 {joint:'knee_r',motion:'flexion',label:'Rodilla: flexión',min:0,max:150},
 {joint:'ankle_r',motion:'flexion',label:'Tobillo: dorsiflexión (+) / flexión plantar (−)',min:-50,max:30},
];
const groups=[...new Set(STRETCHES.map(s=>s.group))];
const signed=(e:number)=>`${e>=0?'+':'−'}${Math.abs(e*100).toFixed(1)} %`;

export default function KinesioMode(){
 const [entryId,setEntryId]=useState(STRETCHES[0].id),[side,setSide]=useState<Side>('r'),[immobile,setImmobile]=useState(false),[variantIndex,setVariantIndex]=useState(0);
 const [manual,setManual]=useState<JointAngles>({}),[values,setValues]=useState<Map<string,number>>(new Map()),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const entry=STRETCHES.find(s=>s.id===entryId)!;
 const variants=entry.variants.map((v,i)=>({v,i})).filter(({v})=>!immobile||v.mode==='inmovil');
 const variant=(variants.find(x=>x.i===variantIndex)??variants[0])?.v??entry.variants[0];
 const basePose=useMemo(()=>composePose(variant.position,variant.pose),[variant]);
 const pose=useMemo(()=>{
  const merged:JointAngles=structuredClone(basePose);
  for(const [id,angles] of Object.entries(manual) as [JointId,Partial<Record<Motion,number>>][])merged[id]={...merged[id],...angles};
  return mirrorPose(merged,side);
 },[basePose,manual,side]);
 const targets=useMemo(()=>entry.muscles.map(m=>muscleKey(m,side)),[entry,side]);
 const choose=(id:string)=>{setEntryId(id);setVariantIndex(0);setManual({});};
 const pick=(key:string)=>{const [id,s]=key.split(':') as [MuscleId,Side];const found=STRETCHES.find(x=>x.muscles.includes(id));if(found){choose(found.id);setSide(s);}};
 const setAngle=(joint:JointId,motion:Motion,value:number)=>setManual(m=>({...m,[joint]:{...m[joint],[motion]:value}}));
 const angle=(joint:JointId,motion:Motion)=>manual[joint]?.[motion]??basePose[joint]?.[motion]??BASE_POSE[variant.position][joint]?.[motion]??0;
 return <main className="studio kinesio">
  <KinesioScene position={variant.position} pose={pose} targets={targets} onElongation={setValues} onPick={pick} onProgress={setProgress} onError={setError}/>
  <div className="vignette"/>
  <header className="identity"><div className="eyebrow"><span className="status-dot"/> KINESIOLOGÍA · MIEMBRO INFERIOR</div><h1>Elongación<Badge variant="outline" className="edition">3D</Badge></h1><div className="identity-meta">Kendall · Kapandji <span>·</span> contenido a validar</div></header>
  <nav className="top-actions" aria-label="Navegación"><a href="#" className="mode-link"><ArrowLeft size={18}/><span>Atlas anatómico</span></a></nav>
  <section className="kinesio-list glass" aria-label="Músculos">
   <div className="panel-heading"><span>Músculos</span></div>
   {groups.map(g=><div key={g} className="kinesio-group"><div className="kinesio-group-name">{g}</div>{STRETCHES.filter(s=>s.group===g).map(s=><Button key={s.id} variant="ghost" className={s.id===entryId?'active':''} aria-pressed={s.id===entryId} onClick={()=>choose(s.id)}>{s.title}</Button>)}</div>)}
   <label className="kinesio-immobile"><Switch checked={immobile} onCheckedChange={v=>{setImmobile(v);setVariantIndex(0);setManual({});}} aria-label="Paciente inmóvil, decúbito obligado"/><span>Paciente inmóvil<small>Decúbito obligado: solo técnicas que no cambian su posición</small></span></label>
  </section>
  <section className="kinesio-detail glass" aria-label="Técnica de elongación">
   <div className="kinesio-title"><h2>{entry.title}</h2><Badge variant="secondary" title="Contenido pendiente de revisión por un kinesiólogo"><TriangleAlert size={12}/> A validar</Badge></div>
   {entry.test&&<p className="kinesio-test"><b>Prueba:</b> {entry.test}</p>}
   {entry.normal&&<p className="kinesio-normal"><b>Normal:</b> {entry.normal}</p>}
   <div className="kinesio-side" role="group" aria-label="Lado">{(['r','l'] as Side[]).map(s=><Button key={s} variant="ghost" className={side===s?'active':''} aria-pressed={side===s} onClick={()=>setSide(s)}>{s==='r'?'Derecho':'Izquierdo'}</Button>)}</div>
   <div className="kinesio-variants" role="group" aria-label="Posición del paciente">{variants.map(({v,i})=><Button key={i} variant="ghost" className={v===variant?'active':''} aria-pressed={v===variant} onClick={()=>{setVariantIndex(i);setManual({});}}>{POSITION_NAMES[v.position]}<small>{v.mode==='inmovil'?'inmóvil':v.mode}</small></Button>)}</div>
   <dl className="kinesio-steps"><dt>{MODE_NAMES[variant.mode]}</dt><dd>{variant.setup}</dd><dt>Maniobra</dt><dd>{variant.action}</dd><dt>Fijación</dt><dd>{variant.fixation}</dd>{variant.note&&<><dt>Nota</dt><dd>{variant.note}</dd></>}</dl>
   <div className="kinesio-strain" aria-live="polite"><div className="kinesio-subtitle">Longitud origen–inserción respecto del reposo</div>{entry.muscles.map(m=>{const e=values.get(muscleKey(m,side))??0;return <div key={m} className="strain-row"><span>{MUSCLE_NAMES[m]}</span><i><b className={e<0?'short':''} style={{width:`${Math.min(100,Math.abs(e)*400)}%`}}/></i><strong>{signed(e)}</strong></div>;})}</div>
   <div className="kinesio-manual"><div className="kinesio-subtitle">Ajuste manual<Button variant="ghost" className="icon-button" aria-label="Volver a la posición de la técnica" title="Volver a la posición de la técnica" onClick={()=>setManual({})}><RotateCcw size={14}/></Button></div>
    {CONTROLS.map(c=>{const v=angle(c.joint,c.motion);return <label key={c.joint+c.motion} className="joint-row"><span>{c.label}<b>{Math.round(v)}°</b></span><Slider min={c.min} max={c.max} step={1} value={[v]} onValueChange={x=>setAngle(c.joint,c.motion,Array.isArray(x)?x[0]:x)} aria-label={c.label}/></label>;})}
   </div>
   <div className="kinesio-precautions"><div className="kinesio-subtitle">Precauciones</div><ul>{entry.precautions.map(p=><li key={p}>{p}</li>)}</ul></div>
   <div className="kinesio-sources"><div className="kinesio-subtitle">Fuentes</div>{entry.citations.map(c=><p key={c.section}>{c.source} {c.section}.</p>)}<p>Material educativo, no diagnóstico. Modelo derivado de Z-Anatomy y BodyParts3D (CC BY-SA 4.0).</p></div>
  </section>
  {progress<100&&!error&&<div className="loading glass" role="status"><div><strong>Preparando al paciente</strong><span>Esqueleto y músculos del miembro inferior</span><div className="loading-track"><i style={{width:`${progress}%`}}/></div></div></div>}
  {error&&<div className="loading error glass" role="alert"><strong>{error}</strong><button onClick={()=>location.reload()}>Reintentar</button></div>}
 </main>;
}

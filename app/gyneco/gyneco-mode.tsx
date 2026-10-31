import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Pause,Play,RotateCcw,TriangleAlert} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import GynecoScene,{type BodyPosition,type Side,type ViewPreset} from './gyneco-scene';
import {CONFLICTS,SECTIONS,UNT_NOTE,type Section,type SectionId} from './content';
import {DURATION,STEPS,sampleAt,type Pressure} from './palpation';
import type {FemaleManifest,FemalePart} from './model';
import {describe,loadDescriptions,type DescriptionTables} from '../descriptions';
import type {SystemId} from '../anatomy';

const MANIFEST='/models/female/female-parts.json';
const PRESSURE_COLOR:Record<Pressure,string>={suave:'#5fd0b5',media:'#f2b84b',firme:'#e0463c'};
const clock=(t:number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const capitalize=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);
const ids=(list:string[])=>list.join(', ');
const SIDED=['breast-fat','mammary-lobes','lactiferous-ducts','areola','nipple','uterine-tube','ovary','hip-bone'];
// Anatomy list: ids without the side suffix are shared; the others follow the side chosen for the demo.
const GROUPS:{name:string;ids:string[]}[]=[
 {name:'Mama',ids:['breast-fat','mammary-lobes','lactiferous-ducts','areola','nipple']},
 {name:'Aparato reproductor',ids:['uterine-fundus','uterine-body','uterine-cornua','lower-uterine-segment','cervix','cervicovaginal-junction','uterine-tube','ovary']},
 {name:'Vejiga y pelvis',ids:['urinary-bladder','hip-bone','sacrum','coccyx']},
];
const reducedMotion=()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;

function Toggle<T extends string|number>({label,value,options,onChange}:{label:string;value:T;options:{value:T;text:string}[];onChange:(v:T)=>void}){
 return <div className="gyneco-toggle" role="group" aria-label={label}>{options.map(o=><Button key={String(o.value)} variant="ghost" className={o.value===value?'active':''} aria-pressed={o.value===value} onClick={()=>onChange(o.value)}>{o.text}</Button>)}</div>;
}

function SectionText({section,children}:{section:Section;children?:React.ReactNode}){
 return <>
  {section.lead&&<p className="gyneco-lead">{section.lead}</p>}
  {section.intro&&<p>{section.intro}</p>}
  {children}
  {section.items&&<ul className={section.statuses?'gyneco-centers':'gyneco-items'}>{section.items.map((i,n)=>{const st=section.statuses?.[n];return st?<li key={i} className="gyneco-center"><span className="gyneco-center-name">{i}</span><span className="gyneco-status" data-status={st.status}>{capitalize(st.status)}</span><span className="gyneco-center-detail">{st.detail} <span className="gyneco-hint">({ids(st.sources)})</span></span></li>:<li key={i}>{i}</li>;})}</ul>}
  {section.myths&&<ol className="gyneco-myths">{section.myths.map(m=><li key={m.claim}><q>{m.claim}</q><p><span className="gyneco-verdict">{m.verdict}</span> {m.why}</p><p className="gyneco-hint">Fuentes: {ids(m.sources)}</p></li>)}</ol>}
  {section.note&&<p className="gyneco-note">{section.note}</p>}
  {section.callout&&<p className="gyneco-callout" role="note">{section.callout}</p>}
  {section.extras?.map(x=><div key={x.title}><div className="gyneco-subtitle">{x.title}</div><ul className="gyneco-items">{x.items.map(i=><li key={i}>{i}</li>)}</ul><p className="gyneco-hint">Fuentes: {ids(x.sources)}</p></div>)}
  {section.conflicts?.map(id=>{const c=CONFLICTS.find(x=>x.id===id)!;return <div key={id} className="gyneco-conflict"><div className="gyneco-conflict-title"><TriangleAlert size={13}/> Las fuentes no coinciden: {c.topic}</div><ul className="gyneco-conflict-sides">{c.sides.map(side=><li key={side.who}><b>{side.who}</b><span>{side.says} <span className="gyneco-hint">({ids(side.sources)})</span></span></li>)}</ul>{c.agreement&&<p className="gyneco-note">{c.agreement}</p>}{c.caveat&&<p className="gyneco-hint">{c.caveat}</p>}</div>;})}
 </>;
}

export default function GynecoMode(){
 const [sectionId,setSectionId]=useState<SectionId>('autoexamen'),[side,setSide]=useState<Side>('l'),[position,setPosition]=useState<BodyPosition>('standing'),[interior,setInterior]=useState(false);
 const [view,setView]=useState<{preset:ViewPreset;n:number}>({preset:'breasts',n:0}),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[seek,setSeek]=useState({t:0,n:0}),[time,setTime]=useState(0);
 const [selectedId,setSelectedId]=useState<string|null>(null),[manifest,setManifest]=useState<FemaleManifest>(),[tables,setTables]=useState<DescriptionTables>({}),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const section=SECTIONS.find(s=>s.id===sectionId)!,sample=sampleAt(time),step=STEPS.find(s=>s.id===sample.step)!,ended=time>=DURATION-.05;
 const parts=useMemo(()=>new Map(manifest?.parts.map(p=>[p.id,p])),[manifest]);
 const selected:FemalePart|undefined=selectedId?parts.get(selectedId):undefined;
 useEffect(()=>{const abort=new AbortController();fetch(MANIFEST,{signal:abort.signal}).then(r=>r.ok?r.json():undefined).then(m=>setManifest(m as FemaleManifest|undefined)).catch(()=>{});return()=>abort.abort();},[]);
 useEffect(()=>{const system=selected?.system as SystemId|undefined;if(!system||tables[system])return;let live=true;loadDescriptions(system).then(t=>{if(live&&t)setTables(x=>({...x,[system]:t}));});return()=>{live=false;};},[selected?.system,tables]);
 const description=selected?describe(tables,selected.name,selected.system as SystemId):undefined;
 const partId=(base:string)=>SIDED.includes(base)?`VHF-${base}-${side}`:`VHF-${base}`;
 const detailRef=useRef<HTMLElement>(null);
 const listRef=useRef<HTMLElement>(null);
 useEffect(()=>{detailRef.current?.scrollTo({top:0});const list=listRef.current,active=list?.querySelector<HTMLElement>('button.active');if(list&&active)list.scrollTo({left:active.offsetLeft-8});},[sectionId]);
 const choose=(id:SectionId)=>{setSectionId(id);if(id!=='autoexamen')setPlaying(false);};
 const pick=(id:string)=>{setSelectedId(id);choose('anatomia');};
 const seekTo=(t:number)=>{setSeek(s=>({t,n:s.n+1}));setTime(t);};
 const play=()=>{if(ended){seekTo(0);setPlaying(true);}else setPlaying(p=>!p);};
 const look=(preset:ViewPreset)=>{setView(v=>({preset,n:v.n+1}));setInterior(preset==='pelvis');};
 const label=ended?'Repetir':playing?'Pausar':time>.05?'Seguir':'Ver cómo palparte';
 return <main className="studio gyneco">
  <GynecoScene demo={sectionId==='autoexamen'} side={side} position={position} interior={interior} view={view} playing={playing} speed={speed} seek={seek} selectedId={selectedId} onTime={setTime} onEnd={()=>setPlaying(false)} onPick={pick} onProgress={setProgress} onError={setError}/>
  <div className="vignette"/>
  <header className="identity"><div className="eyebrow"><span className="status-dot"/> GINECOLOGÍA · SALUD MAMARIA</div><h1>Conocé tus mamas<Badge variant="outline" className="edition">3D</Badge></h1><div className="identity-meta">Folleto Octubre Rosa · IFMSA Tucumán <span>·</span> contenido a validar</div></header>
  <nav className="top-actions" aria-label="Navegación"><a href="#" className="mode-link"><ArrowLeft size={18}/><span>Atlas anatómico</span></a></nav>
  <section ref={listRef} className="gyneco-list glass" aria-label="Secciones">
   <div className="panel-heading"><span>Secciones</span></div>
   {SECTIONS.map(s=><Button key={s.id} variant="ghost" className={s.id===sectionId?'active':''} aria-pressed={s.id===sectionId} onClick={()=>choose(s.id)}>{s.label}</Button>)}
  </section>
  <section ref={detailRef} className="gyneco-detail glass" aria-label={section.title}>
   <div className="gyneco-title"><h2>{section.title}</h2><Badge variant="secondary" title="Contenido pendiente de revisión por un docente"><TriangleAlert size={12}/> A validar</Badge></div>
   <SectionText section={section}>
    {section.id==='autoexamen'&&<div className="gyneco-demo">
     <Button className="gyneco-play" onClick={play} aria-label={label}>{ended?<RotateCcw size={16}/>:playing?<Pause size={16}/>:<Play size={16}/>}<span>{label}</span></Button>
     {reducedMotion()&&<p className="gyneco-hint">Tu dispositivo pide menos movimiento: la animación solo se reproduce cuando tocás el botón.</p>}
     <div className="gyneco-caption" aria-live="polite"><div className="gyneco-step-name">{step.title}</div><p>{step.caption}</p>
      <div className="gyneco-pressure">{sample.pressure?<><i style={{background:PRESSURE_COLOR[sample.pressure]}}/>Presión {sample.pressure}</>:<>Presión: ninguna (los dedos se levantan)</>}</div></div>
     <div className="gyneco-progress"><Slider min={0} max={DURATION} step={.1} value={[time]} onValueChange={x=>seekTo(Array.isArray(x)?x[0]:x)} aria-label="Avance de la demostración"/><output>{clock(time)} / {clock(DURATION)}</output></div>
     <ol className="gyneco-steps" aria-label="Pasos">{STEPS.map(s=><li key={s.id}><Button variant="ghost" className={s.id===step.id?'active':''} aria-current={s.id===step.id?'step':undefined} onClick={()=>seekTo(s.start)}>{s.title}</Button></li>)}</ol>
     <div className="gyneco-options">
      <Toggle label="Mama" value={side} options={[{value:'l',text:'Izquierda'},{value:'r',text:'Derecha'}]} onChange={setSide}/>
      <Toggle label="Posición" value={position} options={[{value:'standing',text:'De pie'},{value:'supine',text:'Acostada'}]} onChange={setPosition}/>
      <Toggle label="Velocidad" value={speed} options={[{value:1,text:'Normal'},{value:.5,text:'Lenta'}]} onChange={setSpeed}/>
     </div>
     <p className="gyneco-hint">Cuándo hacerlo: {SECTIONS.find(s=>s.id==='controles')!.items![0]}</p>
    </div>}
    {section.id==='anatomia'&&<div className="gyneco-anatomy">
     {GROUPS.map(g=><div key={g.name} className="gyneco-group"><div className="gyneco-group-name">{g.name}</div><div className="gyneco-chips">{g.ids.map(base=>{const id=partId(base),p=parts.get(id);return p?<Button key={id} variant="ghost" className={id===selectedId?'active':''} aria-pressed={id===selectedId} onClick={()=>{setSelectedId(id);look(g.name==='Mama'?'breasts':'pelvis');}}>{capitalize(p.nameEs)}</Button>:null;})}</div></div>)}
     {selected?<div className="gyneco-structure"><h3>{capitalize(selected.nameEs)}</h3>{description?<><p>{description.resumen}</p><dl className="structure-facts">{description.detalles.map(d=><div key={d.titulo}><dt>{d.titulo}</dt><dd>{d.texto}</dd></div>)}</dl></>:<p>Todavía no hay descripción para esta estructura.</p>}</div>:<p className="gyneco-hint">Tocá una estructura del modelo o elegila de la lista.</p>}
     <span className="context-note review-note">Contenido educativo · a validar por un docente</span>
    </div>}
   </SectionText>
   <div className="gyneco-sources"><div className="gyneco-subtitle">Fuentes</div>{section.sources.map(s=><p key={s.id} className="gyneco-source"><b>{s.id}</b><span>{s.url?<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>:s.label}{s.retrieved&&`, consultado ${s.retrieved}`}{s.backup&&' (respaldo, no oficial)'}</span></p>)}{section.noResearch&&<p>{section.noResearch}</p>}{section.id==='autoexamen'&&<p>{UNT_NOTE}</p>}<p>Material educativo, no diagnóstico: no reemplaza la consulta con un profesional de la salud.</p></div>
  </section>
  <nav className="gyneco-views glass" aria-label="Cámara"><Toggle label="Vista" value={view.preset} options={[{value:'breasts',text:'Mamas'},{value:'pelvis',text:'Pelvis'}]} onChange={look}/>
   <label className="gyneco-interior"><Switch checked={interior} onCheckedChange={setInterior} aria-label="Ver el interior"/><span>Ver el interior</span></label></nav>
  {progress<100&&!error&&<div className="loading glass" role="status"><div><strong>Preparando el modelo</strong><span>Piel, mamas y órganos pélvicos</span><div className="loading-track"><i style={{width:`${progress}%`}}/></div></div></div>}
  {error&&<div className="loading error glass" role="alert"><strong>{error}</strong><button onClick={()=>location.reload()}>Reintentar</button></div>}
 </main>;
}

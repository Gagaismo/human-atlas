import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Info,Maximize2,Minimize2,X} from 'lucide-react';
import HeartScene from './heart-scene';
import type {HeartToggles} from './heart-scene';
import AngiogramView from './angiogram-view';
import RoomScene from './room-scene';
import AngioControls from './angio-controls';
import AngioPad from './angio-pad';
import type {PadMode} from './angio-pad';
import {loadTree} from './angio-data';
import {clampAngles,fmtAngles} from './core/geometry';
import {clampToSafe} from './core/room';
import {findSegment} from './core/tree';
import {isAngioHash,parseHash,serializeHash} from './core/url';
import type {AngioState} from './core/url';
import type {CoronaryTree,Dominance,GraftId,System,Visibility} from './core/types';
import type {StandardView} from './core/views';
import './angio.css';

const EMPTY:ReadonlySet<GraftId>=new Set();
const GRAFTS:{id:GraftId;text:string;title:string}[]=[
 {id:'lima',text:'AMI',title:'Arteria mamaria interna izquierda a la DA'},
 {id:'svg-om',text:'PV–OM',title:'Puente de vena safena a la obtusa marginal'},
 {id:'svg-pda',text:'PV–DP',title:'Puente de vena safena a la descendente posterior'}];
const reducedMotion=()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

interface Note{text:string;kind:'move'|'warn'}
/** Initial state: the hash, with angles pulled back to the last collision-free position on the way from AP. */
function start(){
 const s=parseHash(location.hash),r=clampToSafe({a:0,b:0},clampAngles(s.a,s.b));
 return {s,a:r.a,b:r.b,hit:r.hit?.message??null};
}

function Toggle({on,children,...rest}:{on:boolean;children:React.ReactNode}&React.ButtonHTMLAttributes<HTMLButtonElement>){
 return <button {...rest} className={on?'on':''} aria-pressed={on}>{children}</button>;
}

export default function AngioMode(){
 const [init]=useState(start);
 const [ang,setAng]=useState({a:init.a,b:init.b}),[sys,setSys]=useState<System>(init.s.sys),[sel,setSel]=useState<string|null>(init.s.sel),[dom,setDom]=useState<Dominance>(init.s.dom);
 const [ramus,setRamus]=useState(init.s.ri),[grafts,setGrafts]=useState<ReadonlySet<GraftId>>(()=>new Set(init.s.g));
 const [toggles,setToggles]=useState<HeartToggles>({detectorView:true,foreshortening:false,skeleton:true,seeThrough:true,labels:false,planes:false});
 const [labels,setLabels]=useState(false),[color,setColor]=useState(false),[padMode,setPadMode]=useState<PadMode>('combined');
 const [tree,setTree]=useState<CoronaryTree|null>(null),[loadError,setLoadError]=useState(''),[attempt,setAttempt]=useState(0);
 const [note,setNote]=useState<Note|null>(init.hit?{text:init.hit,kind:'warn'}:null),[full,setFull]=useState(false);
 const root=useRef<HTMLDivElement>(null),credits=useRef<HTMLDialogElement>(null);
 const cur=useRef(ang),raf=useRef(0),noteTimer=useRef(0),latest=useRef('');

 useEffect(()=>{
  let live=true;setLoadError('');
  loadTree(dom).then(t=>{if(live)setTree(t);}).catch((e:Error)=>{if(live)setLoadError(e.message||'No se pudo cargar la anatomía coronaria.');});
  return()=>{live=false;};
 },[dom,attempt]);
 // A segment id that is not in the tree is ignored (S10).
 useEffect(()=>{if(tree&&sel&&!findSegment(tree,sel))setSel(null);},[tree,sel]);

 const vis=useMemo<Visibility>(()=>({system:sys,ramus,grafts:dom==='right'?grafts:EMPTY}),[sys,ramus,grafts,dom]);

 // Angles: every change goes through the room check (S9); buttons and views animate (~400 ms), slider and pad drags are immediate.
 const show=useCallback((text:string,kind:Note['kind'],ms:number)=>{setNote({text,kind});clearTimeout(noteTimer.current);noteTimer.current=window.setTimeout(()=>setNote(null),ms);},[]);
 const put=(a:number,b:number)=>{cur.current={a,b};setAng({a,b});};
 const stop=()=>{cancelAnimationFrame(raf.current);raf.current=0;};
 const reach=useCallback((a:number,b:number)=>{
  const r=clampToSafe(cur.current,clampAngles(a,b));
  if(r.hit)show(r.hit.message,'warn',4000);
  return r;
 },[show]);
 const set=useCallback((a:number,b:number)=>{stop();const r=reach(Math.round(a),Math.round(b));put(r.a,r.b);},[reach]);
 const go=useCallback((a:number,b:number)=>{
  stop();
  const r=reach(Math.round(a),Math.round(b)),from=cur.current;
  if(r.a===from.a&&r.b===from.b)return;
  if(!r.hit)show(`Moviendo a ${fmtAngles(r.a,r.b)}`,'move',1400);
  if(reducedMotion()){put(r.a,r.b);return;}
  const t0=performance.now(),D=400;
  const step=(now:number)=>{
   const t=Math.min(1,(now-t0)/D),e=ease(t);
   put(from.a+(r.a-from.a)*e,from.b+(r.b-from.b)*e);
   raf.current=t<1?requestAnimationFrame(step):0;
  };
  raf.current=requestAnimationFrame(step);
 },[reach,show]);
 useEffect(()=>()=>{stop();clearTimeout(noteTimer.current);},[]);

 const onView=(v:StandardView)=>{if(sys!=='both')setSys(v.group==='izquierda'?'left':'right');go(v.a,v.b);};
 const leaveDetector=useCallback(()=>setToggles(t=>t.detectorView?{...t,detectorView:false}:t),[]);
 const flip=(k:keyof HeartToggles)=>setToggles(t=>({...t,[k]:!t[k]}));
 const toggleGraft=(id:GraftId)=>setGrafts(g=>{const n=new Set(g);if(n.has(id))n.delete(id);else n.add(id);return n;});

 // URL state (S10): written back with replaceState, debounced, so the history does not fill up.
 const state:AngioState={a:ang.a,b:ang.b,sys,sel,dom,ri:ramus,g:dom==='right'?[...grafts]:[]};
 const hash=serializeHash(state);latest.current=hash;
 useEffect(()=>{
  const t=setTimeout(()=>{if(hash!==location.hash)history.replaceState(null,'',hash);},300);
  return()=>clearTimeout(t);
 },[hash]);
 useEffect(()=>{
  const on=()=>{
   if(!isAngioHash(location.hash))return;
   const s=parseHash(location.hash);
   if(serializeHash(s)===latest.current)return;
   stop();setSys(s.sys);setSel(s.sel);setDom(s.dom);setRamus(s.ri);setGrafts(new Set(s.g));
   const r=reach(s.a,s.b);put(r.a,r.b);
  };
  addEventListener('hashchange',on);return()=>removeEventListener('hashchange',on);
 },[reach]);

 // Full screen: button and the F key.
 const toggleFull=useCallback(()=>{
  if(document.fullscreenElement)void document.exitFullscreen();
  else void root.current?.requestFullscreen?.().catch(()=>{});
 },[]);
 useEffect(()=>{
  const change=()=>setFull(!!document.fullscreenElement);
  const key=(e:KeyboardEvent)=>{
   const t=e.target as HTMLElement|null;
   if(e.key.toLowerCase()!=='f'||e.ctrlKey||e.metaKey||e.altKey||credits.current?.open)return;
   if(t&&(t.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(t.tagName)))return;
   e.preventDefault();toggleFull();
  };
  document.addEventListener('fullscreenchange',change);addEventListener('keydown',key);
  return()=>{document.removeEventListener('fullscreenchange',change);removeEventListener('keydown',key);};
 },[toggleFull]);

 const fullTitle=full?'Salir de pantalla completa (F)':'Pantalla completa (F)';
 const ready=tree!==null;
 const placeholder=loadError
  ?<div className="angio-loading" role="alert"><p>{loadError}</p><button onClick={()=>setAttempt(n=>n+1)}>Reintentar</button></div>
  :<div className="angio-loading" role="status">Cargando la anatomía coronaria…</div>;

 return <div className="angio" ref={root} lang="es">
  <header className="angio-top">
   <a href="#" className="angio-back" aria-label="Volver al atlas anatómico" title="Volver al atlas anatómico"><ArrowLeft size={16}/><span>Atlas</span></a>
   <h1>Angiografía coronaria</h1>
   <button className="angio-icon" onClick={toggleFull} aria-label={fullTitle} title={fullTitle}>{full?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>
   <span className="angio-disclaimer">Simulación educativa, no apta para uso clínico</span>
   <button className="angio-edu" onClick={()=>credits.current?.showModal()}><Info size={14}/>Con fines educativos</button>
  </header>
  <main className="angio-grid">
   <section className="angio-panel angio-heart" aria-label="Corazón 3D">
    <div className="angio-bar" role="toolbar" aria-label="Opciones del corazón 3D">
     <Toggle on={toggles.detectorView} onClick={()=>flip('detectorView')} title="Mira el corazón desde el detector, con la misma orientación que el angiograma">Vista del detector</Toggle>
     <Toggle on={toggles.foreshortening} onClick={()=>flip('foreshortening')} title="Colorea cada vaso según cuánto lo acorta la proyección actual">Acortamiento</Toggle>
     <Toggle on={toggles.skeleton} onClick={()=>flip('skeleton')} title="Esqueleto torácico tenue">Esqueleto</Toggle>
     <Toggle on={toggles.seeThrough} onClick={()=>flip('seeThrough')} title="Corazón semitransparente para ver los vasos de atrás">Transparente</Toggle>
     <span className="grow"/>
     <Toggle on={toggles.labels} onClick={()=>flip('labels')}>Etiquetas</Toggle>
     <Toggle on={toggles.planes} onClick={()=>flip('planes')} title="Plano del surco auriculoventricular y plano septal">Planos</Toggle>
    </div>
    <div className="angio-view angio-heart-view"><span className="angio-title">CORAZÓN 3D</span>
     {ready?<HeartScene tree={tree} vis={vis} a={ang.a} b={ang.b} selected={sel} toggles={toggles} onSelect={setSel} onDetectorViewLeft={leaveDetector}/>:placeholder}</div>
   </section>
   <div className="angio-center">
    <section className="angio-panel angio-angiogram" aria-label="Angiograma">
     <div className="angio-row"><span className="angio-label">ANGIOGRAMA</span>
      <div className="angio-seg" role="group" aria-label="Sistema inyectado">
       <Toggle on={sys==='left'} onClick={()=>setSys('left')}>Coronaria izquierda</Toggle>
       <Toggle on={sys==='right'} onClick={()=>setSys('right')}>Coronaria derecha</Toggle>
       <Toggle on={sys==='both'} onClick={()=>setSys('both')} title="Opacifica las dos coronarias a la vez, solo para enseñar">Ambas</Toggle></div>
      <span className="grow"/>
      <div className="angio-seg"><Toggle on={labels} onClick={()=>setLabels(v=>!v)}>Etiquetas</Toggle><Toggle on={color} onClick={()=>setColor(v=>!v)} title="Colorea los vasos por familia, solo para enseñar">Color</Toggle></div>
     </div>
     <div className="angio-row"><span className="angio-label">DOMINANCIA</span>
      <div className="angio-seg" role="group" aria-label="Dominancia">
       <Toggle on={dom==='right'} onClick={()=>setDom('right')}>Derecha</Toggle>
       <Toggle on={dom==='left'} onClick={()=>setDom('left')}>Izquierda</Toggle>
       <Toggle on={dom==='co'} onClick={()=>setDom('co')} title="Codominancia">Co</Toggle></div>
      <span className="grow"/>
      <Toggle on={ramus} onClick={()=>setRamus(v=>!v)} title="Variante: tercera rama del tronco común entre la DA y la Cx">Ramo intermedio</Toggle>
     </div>
     <div className="angio-row"><span className="angio-label">PUENTES</span>
      <div className="angio-seg" role="group" aria-label="Puentes coronarios">
       {GRAFTS.map(g=><Toggle key={g.id} on={dom==='right'&&grafts.has(g.id)} disabled={dom!=='right'} title={g.title} onClick={()=>toggleGraft(g.id)}>{g.text}</Toggle>)}</div>
      {dom!=='right'&&<span className="angio-hint">Por ahora los puentes solo están con dominancia derecha</span>}
     </div>
     <div className="angio-stage"><div className="angio-view angio-square">{ready?<AngiogramView tree={tree} vis={vis} a={ang.a} b={ang.b} selected={sel} labels={labels} color={color} onSelect={setSel}/>:placeholder}</div></div>
    </section>
    {ready&&<AngioPad tree={tree} vis={vis} a={ang.a} b={ang.b} sel={sel} mode={padMode} onMode={setPadMode} onSet={set} onGo={go}/>}
   </div>
   <div className="angio-right">
    <div className="angio-controls-wrap">
     <AngioControls a={ang.a} b={ang.b} sys={sys} onSet={set} onGo={go} onView={onView}/>
     {note&&<div className={`angio-note ${note.kind}`} role="status">{note.text}</div>}
    </div>
    <section className="angio-panel angio-room" aria-label="Sala de hemodinamia">
          <div className="angio-view"><RoomScene a={ang.a} b={ang.b} onAngles={set}/></div>
    </section>
   </div>
  </main>
  <dialog ref={credits} className="angio-credits" aria-labelledby="angio-credits-title" onClick={e=>{if(e.target===e.currentTarget)credits.current?.close();}}>
   <div className="angio-credits-body">
    <div className="angio-credits-head"><h2 id="angio-credits-title">Créditos y fuentes</h2><button className="angio-icon" onClick={()=>credits.current?.close()} aria-label="Cerrar"><X size={16}/></button></div>
    <p className="angio-strong">Simulación educativa, no apta para uso clínico.</p>
    <p>Contenido a validar por un docente: los textos clínicos, los nombres de las vistas y los rangos de ángulos son nuestros y todavía no fueron revisados. La anatomía es la de un único corazón de referencia.</p>
    <h3>Inspiración</h3>
    <p><a href="https://angioview.com" target="_blank" rel="noreferrer">AngioView</a>, de Annas Rahman, MD. Esta es una versión propia, en español, que no reutiliza su código ni sus datos.</p>
    <h3>Anatomía 3D</h3>
    <p>BodyParts3D, © The Database Center for Life Science, licencia <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> (<a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noreferrer">dbarchive.biosciencedbc.jp</a>). De sus mallas del corazón, las arterias coronarias y el tórax derivamos el corazón, los ejes de los vasos y el esqueleto de esta vista; los vasos que faltaban (septales, diagonales y marginales secundarias, nodo sinusal y auriculoventricular, puentes) están sintetizados y los calibres distales son plausibles, a validar. El detalle está en <code>docs/research/angiografia-anatomia.md</code>.</p>
    <h3>Mediciones publicadas</h3>
    <ul>
     <li>Dodge JT Jr et al., Circulation 1988;78:1167–1180 (posición de los segmentos).</li>
     <li>Dodge JT Jr et al., Circulation 1992;86:232–246 (calibre de la luz).</li>
     <li>Kočka V et al., JACC Cardiovasc Interv 2020;13:2560–2570 (vistas óptimas).</li>
     <li>Tu S et al., Int J Cardiovasc Imaging 2012;28:1617 (vistas óptimas).</li>
    </ul>
    <h3>Software</h3>
    <p>three.js y React, licencia MIT.</p>
   </div>
  </dialog>
 </div>;
}

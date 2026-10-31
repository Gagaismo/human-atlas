// Self-exam palpation timeline, in a body-centered cylindrical frame: θ is the angle from the midline toward the
// side (0° = straight ahead, ~90° = the side of the chest) and y the height in meters, so a ray from the chest axis
// outward at (θ, y) lands on the skin. Pure data: the scene maps it onto the skin and mirrors it for the other breast.

export type Pressure='suave'|'media'|'firme';
export const PRESSURES:readonly Pressure[]=['suave','media','firme'];
export type StepId='position'|'pads'|'circles'|'strips'|'axilla'|'repeat';
export const STEP_ORDER:readonly StepId[]=['position','pads','circles','strips','axilla','repeat'];
/** Only vertical strips are implemented; 'circles' (concentric) and 'wedges' are left for when research asks. */
export type Pattern='strips'|'circles'|'wedges';
export const PATTERN:Pattern='strips';

export interface Region {thetaMin:number;thetaMax:number;yBottom:number;yTop:number}
export interface Stop {theta:number;y:number;area:'breast'|'axilla';lane:number;start:number;dwellEnd:number;end:number;circleSeconds:number}
export interface Sample {theta:number;y:number;pressure:Pressure|null;circlePhase:number;step:StepId}
export interface Step {id:StepId;title:string;caption:string;start:number;end:number}
export interface TrailPoint {t:number;theta:number;y:number}
export interface Timeline {duration:number;steps:Step[];stops:Stop[];regions:Region[];trail:TrailPoint[];stripSpacing:number;sampleAt:(t:number)=>Sample}

const rad=(d:number)=>d*Math.PI/180;
/** Nominal chest radius (m) that turns an angle difference into a distance on the skin. */
export const RHO=.15;
/** Reach of the three finger pads together: half their width (~2.75 cm) plus the circle radius. */
export const PAD_RADIUS=.04;
/** Radius of each small circle the pads draw (m). */
export const CIRCLE_RADIUS=.012;
/** Sternum to midaxillary line, clavicle to below the inframammary fold; then the axilla. */
export const REGIONS:Region[]=[
 {thetaMin:rad(5),thetaMax:rad(80),yBottom:1.14,yTop:1.41},
 {thetaMin:rad(78),thetaMax:rad(86),yBottom:1.3,yTop:1.38},
];

const TIMING={position:2.5,pads:2.5,demoCircle:.9,circle:.26,travel:.22,travelToAxilla:.6,repeat:3};
const lattice=(from:number,to:number,reach:number)=>{const n=Math.max(1,Math.ceil((to-from)/reach));return Array.from({length:n+1},(_,i)=>from+(to-from)*i/n);};
const ease=(u:number)=>u*u*(3-2*u);
const caption:Record<StepId,[string,string]>={
 position:['Posición','Hacelo de pie y también acostada, para detectar cualquier cambio o bulto. Esta demo muestra una mama por vez: elegí el lado y la posición.'],
 pads:['Yemas de los dedos','Juntá las yemas de tres dedos (índice, medio y anular): se palpa con la parte blanda, no con las puntas ni las uñas.'],
 circles:['Círculos con tres presiones','En cada punto hacé círculos pequeños, primero con presión suave, después media y por último firme.'],
 strips:['Franjas verticales','Subí y bajá en franjas verticales hasta cubrir toda la mama o área pectoral sin dejar zonas sin tocar: desde el esternón hasta la axila, y desde la clavícula hasta debajo de la mama.'],
 axilla:['Axila','Terminá en la axila: también ahí, círculos pequeños con presión suave, media y firme.'],
 repeat:['La otra mama','Repetí en la otra mama y en la otra posición (de pie y acostada). Si notás algún cambio, consultá al médico.'],
};

export function buildTimeline(options:{pattern?:Pattern}={}):Timeline{
 const pattern=options.pattern??PATTERN;
 if(pattern!=='strips')throw new Error(`Palpation pattern "${pattern}" is not implemented`);
 const [breast,axilla]=REGIONS;
 // Vertical strips, alternating down and up so the pads never lift between lanes.
 const reach=PAD_RADIUS*Math.SQRT2,thetas=lattice(breast.thetaMin,breast.thetaMax,reach/RHO),ys=lattice(breast.yBottom,breast.yTop,reach).reverse();
 const cells:Pick<Stop,'theta'|'y'|'area'|'lane'>[]=[];
 thetas.forEach((theta,lane)=>{(lane%2===0?ys:[...ys].reverse()).forEach(y=>cells.push({theta,y,area:'breast',lane}));});
 const axillaYs=lattice(axilla.yBottom,axilla.yTop,reach);
 for(const y of axillaYs)cells.push({theta:(axilla.thetaMin+axilla.thetaMax)/2,y,area:'axilla',lane:0});
 const spacing=Math.max(RHO*(thetas[1]-thetas[0]),ys[0]-ys[1]);
 // Stop clock: the first stop is slow (it teaches the circles), the rest quicker; the pads lift to travel.
 let clock=TIMING.position+TIMING.pads;
 const stops:Stop[]=cells.map((c,i)=>{
  const circleSeconds=i===0?TIMING.demoCircle:TIMING.circle,next=cells[i+1];
  const travel=!next?0:next.area!==c.area?TIMING.travelToAxilla:TIMING.travel;
  const stop:Stop={...c,start:clock,dwellEnd:clock+3*circleSeconds,end:clock+3*circleSeconds+travel,circleSeconds};
  clock=stop.end;return stop;
 });
 const first=stops[0],last=stops.at(-1)!,firstAxilla=stops.find(s=>s.area==='axilla')!;
 const duration=last.dwellEnd+TIMING.repeat;
 const bounds:[StepId,number][]=[['position',0],['pads',TIMING.position],['circles',first.start],['strips',first.end],['axilla',firstAxilla.start],['repeat',last.dwellEnd]];
 const steps:Step[]=bounds.map(([id,start],i)=>({id,title:caption[id][0],caption:caption[id][1],start,end:bounds[i+1]?.[1]??duration}));
 const stepAt=(t:number)=>(steps.find(s=>t>=s.start&&t<s.end)??steps.at(-1)!).id;

 const sampleAt=(t:number):Sample=>{
  t=Number.isNaN(t)?0:Math.min(Math.max(t,0),duration);
  const step=stepAt(t);
  if(t<first.start)return {theta:first.theta,y:first.y,pressure:null,circlePhase:0,step};
  if(t>=last.dwellEnd)return {theta:last.theta,y:last.y,pressure:null,circlePhase:0,step};
  let i=stops.findIndex(s=>t<s.end);if(i<0)i=stops.length-1;
  const s=stops[i];
  if(t<s.dwellEnd){const k=(t-s.start)/s.circleSeconds,n=Math.min(2,Math.floor(k));return {theta:s.theta,y:s.y,pressure:PRESSURES[n],circlePhase:Math.min(1,k-n),step};}
  const to=stops[i+1],u=ease((t-s.dwellEnd)/(s.end-s.dwellEnd));
  return {theta:s.theta+(to.theta-s.theta)*u,y:s.y+(to.y-s.y)*u,pressure:null,circlePhase:0,step};
 };
 // The covered trail: stop centers plus the travel between them, drawn progressively as time advances.
 const trail:TrailPoint[]=[];
 for(const s of stops){
  trail.push({t:s.start,theta:s.theta,y:s.y},{t:s.dwellEnd,theta:s.theta,y:s.y});
  for(let t=s.dwellEnd+.05;t<s.end-1e-9;t+=.05){const x=sampleAt(t);trail.push({t,theta:x.theta,y:x.y});}
 }
 return {duration,steps,stops,regions:REGIONS,trail,stripSpacing:spacing,sampleAt};
}

const TIMELINE=buildTimeline();
export const {duration:DURATION,steps:STEPS,stops:STOPS,trail:TRAIL,stripSpacing:STRIP_SPACING,sampleAt}=TIMELINE;
export const stepAtTime=(t:number)=>sampleAt(t).step;
/** Circle offset (m) of the pads around a stop for a circle phase in [0, 1]. */
export const circleOffset=(phase:number)=>({u:Math.cos(phase*2*Math.PI)*CIRCLE_RADIUS,v:Math.sin(phase*2*Math.PI)*CIRCLE_RADIUS});

// Coronary tree assembly (all three dominance patterns) in the isocentre frame, millimetres.
// The vessels ImageCAS-X labels (TCI, DA, Dg, Cx, OM, ramus, CD, DP, PL) follow its population-mean courses registered
// onto the BodyParts3D heart (ctx.course); the rest keep their BodyParts3D centrelines or are synthesised as spline curves
// laid on the epicardium (septals inside the septum), re-attached to the new parents.
import {add,sub,mul,dot,len,dist,unit,lerp,cross,pointAt,nearestOn,slice,spline,smooth,resample,profile,arcLength} from './lib-curves.mjs';

const bp=ids=>`BodyParts3D ${ids.join(' ')} centreline, re-attached to the ImageCAS-X course of its parent`;
const ic=(keys,n)=>`ImageCAS-X mean course (${keys}; n=${n}) registered onto the BodyParts3D heart`;
const sy=(how,ids)=>`synthesised: ${how}${ids?.length?` (guided by BodyParts3D ${ids.join(' ')})`:''}`;

/** ctx: {piece(id,{rev,from,to}), epi:Surface, lay(point,offset), landmarks...} */
export function buildTree(dominance,ctx){
 const {piece,lay,epi,aorta}=ctx;
 const vessels=[],byId=new Map();
 const D=r=>Math.max(0.3,r/2); // diameter anchors → radius

 /** Dodge 1992 anchors blended 50/50 with the ImageCAS-X mean relative taper (segmentation-derived lumen radius along the
  *  course), both normalised to the Dodge calibre at the origin. The CCTA lumen is thinner than Dodge's cine measurements
  *  and over-estimates the distal vessel (partial volume), so only the shape of the taper is borrowed. */
 const taper=(diam,c)=>{
  const R=c?.radiusMm;if(!R)return diam;
  const ref=(R[1]+R[2]+R[3])/3,run=[];let m=1.05;
  R.forEach(r=>{m=Math.min(m,Math.min(1.05,r/ref));run.push(m);});
  const d0=diam[0][1],rel=t=>{const x=Math.min(1,Math.max(0,t))*(R.length-1),i=Math.min(R.length-2,Math.floor(x)),f=x-i;return run[i]+(run[i+1]-run[i])*f;};
  return [0,0.1,0.2,0.35,0.5,0.65,0.8,0.9,1].map(t=>[t,d0*(0.5*profile(diam,t)/d0+0.5*rel(t))]);
 };

 const dedupe=(pts,min=0.4)=>{const out=[pts[0]];for(const p of pts.slice(1))if(dist(p,out.at(-1))>=min)out.push(p);return out;};

 /** make + register a vessel. way: waypoints (frame mm). opts.parent: vessel id (snaps the start onto it). */
 function add_(o){
  let way=dedupe(o.way);
  let parentArc=null;
  if(o.parent){
   const par=byId.get(o.parent);
   if(!par)throw new Error(`parent ${o.parent} of ${o.id} not built yet`);
   // pieces extracted from a mesh have no intrinsic direction: start at the end nearer to the parent
   if(!o.lay&&nearestOn(par.points,way.at(-1)).d<nearestOn(par.points,way[0]).d)way=[...way].reverse();
   const hit=nearestOn(par.points,way[0]);
   if(o.lay||hit.d<=0.05)way[0]=hit.p;
   else{
    // morph: the start moves onto the (new) parent and the shift fades out over the first ~30 mm, so the branch keeps its shape
    const shift=sub(hit.p,way[0]),cl=[0];for(let i=1;i<way.length;i++)cl.push(cl[i-1]+dist(way[i-1],way[i]));
    const Ls=Math.min(o.morph??30,0.7*cl.at(-1));
    way=way.map((p,i)=>{const w=Math.max(0,1-cl[i]/Ls);return add(p,mul(shift,w*w));});
    if(ctx.fitEpi){way=ctx.fitEpi(way);way[0]=hit.p;} // the shifted branch is laid back on the epicardium
   }
  }
  way=dedupe(way,0.4);
  let pts=spline(way,1.5);
  if(o.lay){
   const r0=o.diam[0][1]/2;
   const laid=pts.map((p,i)=>(i===0&&o.parent)||(i===pts.length-1&&o.keepEnd)?p:lay(p,Math.max(0.5,o.layOffset??0.7)));
   pts=smooth(laid,2,2);pts=resample(pts,1.5);
   // smoothing cuts corners over convex walls: lay once more, lightly
   pts=smooth(pts.map((p,i)=>(i===0&&o.parent)||(i===pts.length-1&&o.keepEnd)?p:lay(p,Math.max(0.5,o.layOffset??0.7))),1,1);pts=resample(pts,1.5);
   // re-pin the ends after smoothing
   if(o.parent)pts[0]=way[0];if(o.keepEnd)pts[pts.length-1]=way.at(-1);
  }
  if(o.parent){const hit=nearestOn(byId.get(o.parent).points,pts[0]);parentArc=hit.t;}
  const n=pts.length;
  let radii=pts.map((_,i)=>D(profile(o.diam,n===1?0:i/(n-1))*1));
  if(o.parent){const par=byId.get(o.parent),pr=par.radii[Math.min(par.radii.length-1,Math.round(parentArc*(par.radii.length-1)))];if(radii[0]>0.85*pr){const f=Math.max(0.3,0.85*pr)/radii[0];radii=radii.map(r=>Math.max(0.3,r*f));}}
  const v={id:o.id,name:o.name,short:o.short,system:o.system,family:o.family,parent:o.parent??null,parentArc,points:pts.map(p=>p.map(x=>+x.toFixed(2))),radii:radii.map(r=>+r.toFixed(3)),segments:[],source:o.source};
  if(o.variant)v.variant=o.variant;
  const segs=o.segments??[{id:o.id,syntax:'',name:o.name,short:o.short,from:0,to:1}];
  v.segments=segs.map(s=>({...s,from:+s.from.toFixed(3),to:+s.to.toFixed(3)}));
  vessels.push(v);byId.set(v.id,v);return v;
 }
 const at=(id,t)=>pointAt(byId.get(id).points,t);
 const right=dominance==='right',left=dominance==='left',co=dominance==='co';

 // ---------------------------------------------------------------- left coronary system
 const C=(key)=>{const c=ctx.course(dominance,key);if(!c)throw new Error(`no ImageCAS-X course for ${key} (${dominance})`);return c;};
 const lmC=C('lm');
 const lm=add_({id:'lm',name:'Tronco común izquierdo',short:'TCI',system:'left',family:'tci',way:lmC.points,diam:taper([[0,4.5],[1,4.3]],lmC),source:ic('LM',lmC.n),
  segments:[{id:'lm',syntax:'5',name:'Tronco común izquierdo',short:'TCI',from:0,to:1}]});
 const bif=lm.points.at(-1);

 const ladC=C('lad'),d1C=C('d1'),d2C=C('d2'),ladWay=[bif,...ladC.points.slice(1)];
 // D1 origin along the LAD splits SYNTAX 6 | 7, D2 origin splits 7 | 8
 const a1=Math.min(0.4,Math.max(0.15,d1C.attachOnParent?.t??0.3));
 const a3=Math.min(0.7,Math.max(a1+0.15,d2C.attachOnParent?.t??0.5));

 const lad=add_({id:'lad',name:'Descendente anterior',short:'DA',system:'left',family:'da',parent:'lm',way:ladWay,diam:taper([[0,3.6],[0.3,3.1],[0.6,2.4],[1,1.2]],ladC),source:ic('LAD',ladC.n),
  segments:[
   {id:'lad-prox',syntax:'6',name:'DA proximal',short:'DA prox',from:0,to:a1},
   {id:'lad-mid',syntax:'7',name:'DA media',short:'DA media',from:a1,to:a3},
   {id:'lad-apical',syntax:'8',name:'DA apical',short:'DA apical',from:a3,to:1},
  ]});
 lad.parentArc=1;lad.parent='lm';
 add_({id:'d1',name:'Diagonal 1',short:'D1',system:'left',family:'da',parent:'lad',way:d1C.points,diam:taper([[0,2.3],[1,1.1]],d1C),source:ic('D1',d1C.n),
  segments:[{id:'d1',syntax:'9',name:'Diagonal 1',short:'D1',from:0,to:1}]});
 add_({id:'d2',name:'Diagonal 2',short:'D2',system:'left',family:'da',parent:'lad',way:d2C.points,diam:taper([[0,1.9],[1,1.0]],d2C),source:ic('D2',d2C.n),
  segments:[{id:'d2',syntax:'10',name:'Diagonal 2',short:'D2',from:0,to:1}]});
 add_({id:'d3',name:'Diagonal 3',short:'D3',system:'left',family:'da',parent:'lad',lay:true,
  way:[at('lad',0.72),[62,1275,62],[70,1268,56],[73,1263,50]].map((p,i)=>i?ctx.toFrame(p):p),
  diam:[[0,1.5],[1,0.8]],source:sy('spline on the epicardium from the LAD (arc 0.72) toward the apicolateral wall',['FJ2639','FJ2640']),
  segments:[{id:'d3',syntax:'',name:'Diagonal 3',short:'D3',from:0,to:1}]});

 // septal perforators: from the LAD toward the posterior interventricular groove, inside the septum
 const pdaGuide=piece('FJ2692',{rev:true}); // crux → apex groove (guide for the septal plane)
 [[1,0.13],[2,0.25],[3,0.38],[4,0.50],[5,0.64]].forEach(([k,t])=>{
  const p0=at('lad',t),tan=unit(sub(at('lad',Math.min(1,t+0.03)),at('lad',Math.max(0,t-0.03))));
  const g=pointAt(pdaGuide,Math.min(0.95,0.12+t*0.85));
  let dir=sub(g,p0);dir=unit(sub(dir,mul(tan,dot(dir,tan))));
  const L=Math.max(16,28-4*(k-1)),bend=unit(add(dir,mul(tan,0.55)));
  const way=[p0,add(p0,mul(dir,L*0.35)),add(add(p0,mul(dir,L*0.7)),mul(bend,L*0.12)),add(p0,mul(bend,L))];
  add_({id:`s${k}`,name:`Septal ${k}`,short:`S${k}`,system:'left',family:'da',parent:'lad',way,diam:[[0,1.2-0.1*k],[1,0.55]],source:sy('spline from the LAD into the interventricular septum, toward the posterior interventricular groove',['FJ2732','FJ2733','FJ2734']),
   segments:[{id:`s${k}`,syntax:'',name:`Septal ${k}`,short:`S${k}`,from:0,to:1}]});
 });
 // conus branch of the LAD and right ventricular anterior branches (BodyParts3D pieces)
 add_({id:'cono-i',name:'Ramo del cono izquierdo',short:'Cono I',system:'left',family:'da',parent:'lad',lay:true,way:[at('lad',0.1),ctx.toFrame([40,1328,52]),...piece('FJ2644',{})],diam:[[0,1.3],[1,0.7]],source:sy('LAD (arc 0.10) to the pulmonary conus, distal course from BodyParts3D FJ2644',['FJ2644','FJ2643']),
  segments:[{id:'cono-i',syntax:'',name:'Ramo del cono izquierdo',short:'Cono I',from:0,to:1}]});
 add_({id:'rvd1',name:'Ramo ventricular derecho anterior 1',short:'RVD1',system:'left',family:'da',parent:'lad',way:piece('FJ2645',{}),diam:[[0,1.3],[1,0.7]],source:bp(['FJ2645']),
  segments:[{id:'rvd1',syntax:'',name:'Ramo ventricular derecho anterior 1',short:'RVD1',from:0,to:1}]});
 add_({id:'rvd2',name:'Ramo ventricular derecho anterior 2',short:'RVD2',system:'left',family:'da',parent:'lad',way:piece('FJ2646',{}),diam:[[0,1.2],[1,0.6]],source:bp(['FJ2646']),
  segments:[{id:'rvd2',syntax:'',name:'Ramo ventricular derecho anterior 2',short:'RVD2',from:0,to:1}]});

 // circumflex: follows the ImageCAS-X mean (right/co: ends on the lateral wall; left: continues in the posterior AV groove to the crux)
 const cxC=C('lcx'),cxWay=[bif,...cxC.points.slice(1)];
 const cxTaper=left?[[0,3.4],[0.3,3.0],[0.7,2.6],[1,2.1]]:[[0,3.4],[0.3,2.9],[0.7,2.2],[1,1.5]];
 // OM1 origin along the Cx splits 11 | 13
 const om1C=C('om1'),om2C=C('om2'),riC=C('ramus');
 const a2=Math.min(0.5,Math.max(0.2,om1C.attachOnParent?.t??0.3));
 add_({id:'lcx',name:'Circunfleja',short:'Cx',system:'left',family:'cx',parent:'lm',way:cxWay,diam:taper(cxTaper,cxC),source:ic('LCx',cxC.n),
  segments:[
   {id:'lcx-prox',syntax:'11',name:'Circunfleja proximal',short:'Cx prox',from:0,to:a2},
   {id:'lcx-dist',syntax:'13',name:'Circunfleja distal',short:'Cx dist',from:a2,to:1},
  ]}).parentArc=1;
 add_({id:'om1',name:'Obtusa marginal 1',short:'OM1',system:'left',family:'cx',parent:'lcx',way:om1C.points,diam:taper([[0,2.4],[1,1.1]],om1C),source:ic('OM1',om1C.n),
  segments:[{id:'om1',syntax:'12a',name:'Obtusa marginal 1',short:'OM1',from:0,to:1}]});
 add_({id:'om2',name:'Obtusa marginal 2',short:'OM2',system:'left',family:'cx',parent:'lcx',way:om2C.points,diam:taper([[0,2.0],[1,1.0]],om2C),source:ic('OM2',om2C.n),
  segments:[{id:'om2',syntax:'12b',name:'Obtusa marginal 2',short:'OM2',from:0,to:1}]});
 add_({id:'ramus',name:'Ramo intermedio',short:'RI',system:'left',family:'ri',parent:'lm',variant:'ramus',way:[bif,...riC.points.slice(1)],diam:taper([[0,2.8],[1,1.4]],riC),source:ic('IM, anatomical variant',riC.n),
  segments:[{id:'ramus',syntax:'12',name:'Ramo intermedio',short:'RI',from:0,to:1}]}).parentArc=1;
 add_({id:'aur-i',name:'Ramo auricular izquierdo',short:'RAI',system:'left',family:'cx',parent:'lcx',lay:true,way:[at('lcx',0.1),ctx.toFrame([45,1322,10]),ctx.toFrame([42,1330,0])],diam:[[0,1.2],[1,0.7]],source:sy('spline from the proximal Cx onto the left atrial wall'),
  segments:[{id:'aur-i',syntax:'',name:'Ramo auricular izquierdo',short:'RAI',from:0,to:1}]});

 // ---------------------------------------------------------------- right coronary artery
 // acute margin = most right-lateral point (minimum x) of the RCA; SYNTAX 1|2|3 split around it
 const rcaC=C('rca'),rcaWay=rcaC.points;
 let am=0;rcaWay.forEach((p,i)=>{if(p[0]<rcaWay[am][0])am=i;});
 const rcaArcAm=arcLength(rcaWay.slice(0,am+1))/arcLength(rcaWay);
 const rcaSegs=[[0,rcaArcAm/2],[rcaArcAm/2,rcaArcAm],[rcaArcAm,1]];
 add_({id:'rca',name:'Coronaria derecha',short:'CD',system:'right',family:'cd',way:rcaWay,diam:taper(left?[[0,2.8],[0.5,2.1],[1,1.3]]:[[0,3.9],[0.35,3.6],[0.7,3.2],[1,2.8]],rcaC),source:ic('RCA',rcaC.n),
  segments:[
   {id:'rca-prox',syntax:'1',name:'CD proximal',short:'CD prox',from:rcaSegs[0][0],to:rcaSegs[0][1]},
   {id:'rca-mid',syntax:'2',name:'CD media',short:'CD media',from:rcaSegs[1][0],to:rcaSegs[1][1]},
   {id:'rca-dist',syntax:'3',name:'CD distal',short:'CD distal',from:rcaSegs[2][0],to:rcaSegs[2][1]},
  ]});
 add_({id:'cono',name:'Ramo del cono',short:'Cono',system:'right',family:'cd',parent:'rca',way:piece('FJ2670',{}),diam:[[0,1.7],[1,0.9]],source:bp(['FJ2670','FJ2676']),
  segments:[{id:'cono',syntax:'',name:'Ramo del cono',short:'Cono',from:0,to:1}]});
 add_({id:'ma',name:'Marginal aguda',short:'MA',system:'right',family:'cd',parent:'rca',way:piece('FJ2672',{rev:true}),diam:[[0,2.1],[1,0.9]],source:bp(['FJ2672']),
  segments:[{id:'ma',syntax:'',name:'Marginal aguda',short:'MA',from:0,to:1}]});
 add_({id:'rv1',name:'Ramo ventricular derecho 1',short:'RV1',system:'right',family:'cd',parent:'rca',way:piece('FJ2671',{rev:true}),diam:[[0,1.7],[1,0.8]],source:bp(['FJ2671']),
  segments:[{id:'rv1',syntax:'',name:'Ramo ventricular derecho 1',short:'RV1',from:0,to:1}]});
 add_({id:'rv2',name:'Ramo ventricular derecho 2',short:'RV2',system:'right',family:'cd',parent:'rv1',way:piece('FJ2673',{rev:true}),diam:[[0,1.3],[1,0.7]],source:bp(['FJ2673']),
  segments:[{id:'rv2',syntax:'',name:'Ramo ventricular derecho 2',short:'RV2',from:0,to:1}]});
 // sinoatrial nodal artery: proximal RCA toward the SVC–right atrial junction
 add_({id:'san',name:'Arteria del nodo sinusal',short:'NS',system:'right',family:'cd',parent:'rca',lay:true,layOffset:0.9,way:[at('rca',0.05),lerp(at('rca',0.05),ctx.sanEnd,0.5),ctx.sanEnd],diam:[[0,1.5],[1,0.9]],source:sy('spline from the proximal RCA over the right atrium to the superior vena cava junction'),
  segments:[{id:'san',syntax:'',name:'Arteria del nodo sinusal',short:'NS',from:0,to:1}]});

 // ---------------------------------------------------------------- posterior descending + posterolaterals
 if(right||co){
  const parentId='rca';
  const rcaV=vessels.find(v=>v.id==='rca');
  rcaV.segments.at(-1).to=1; // the RCA ends at the crux in right/co dominance
  const pdaC=C('rpda'),rplC=C('rpla');
  const pdaV=add_({id:'pda',name:'Descendente posterior',short:'DP',system:'right',family:'cd',parent:parentId,way:pdaC.points,diam:taper(co?[[0,2.2],[1,1.1]]:[[0,2.4],[1,1.2]],pdaC),source:ic('R-PDA',pdaC.n),
   segments:[{id:'pda',syntax:'4',name:'Descendente posterior',short:'DP',from:0,to:1}]});
  pdaV.parentArc=1;
  const rpl=add_({id:'rpl',name:'Posterolateral derecha',short:'PL',system:'right',family:'cd',parent:'rca',way:rplC.points,diam:taper(co?[[0,1.9],[1,1.1]]:[[0,2.3],[1,1.3]],rplC),source:ic('R-PLA',rplC.n),
   segments:[{id:'rpl',syntax:'16',name:'Posterolateral derecha',short:'PL',from:0,to:1}]});
  rpl.parentArc=1;
  // posterolateral branches 16a-c: BodyParts3D pieces / synthesised, re-attached to the new PL trunk
  const A=piece('FJ2720',{rev:true}),Bc=[...piece('FJ2722',{rev:true}),...piece('FJ2721',{rev:true})];
  add_({id:'rpl1',name:'Posterolateral derecha 1',short:'PL1',system:'right',family:'cd',parent:'rpl',way:A,diam:[[0,1.6],[1,0.8]],source:bp(['FJ2720']),
   segments:[{id:'rpl1',syntax:'16a',name:'Posterolateral derecha 1',short:'PL1',from:0,to:1}]});
  add_({id:'rpl2',name:'Posterolateral derecha 2',short:'PL2',system:'right',family:'cd',parent:'rpl',way:Bc,diam:[[0,1.5],[1,0.8]],source:bp(['FJ2722','FJ2721']),
   segments:[{id:'rpl2',syntax:'16b',name:'Posterolateral derecha 2',short:'PL2',from:0,to:1}]});
  add_({id:'rpl3',name:'Posterolateral derecha 3',short:'PL3',system:'right',family:'cd',parent:'rpl',lay:true,way:[at('rpl',co?0.5:0.4),ctx.toFrame([42,1257,14]),ctx.toFrame([40,1256,22]),ctx.toFrame([41,1255,30])],diam:[[0,1.4],[1,0.7]],source:sy('spline on the inferior wall from the PL trunk toward the apex',['FJ2719']),
   segments:[{id:'rpl3',syntax:'16c',name:'Posterolateral derecha 3',short:'PL3',from:0,to:1}]});
  // septal perforators of the PDA, into the septum toward the LAD
  [[1,0.2],[2,0.42],[3,0.66]].forEach(([k,t])=>{
   const p0=at('pda',t),tan=unit(sub(at('pda',Math.min(1,t+0.03)),at('pda',Math.max(0,t-0.03))));
   const g=pointAt(byId.get('lad').points,Math.min(0.95,0.95-t*0.8));
   let dir=sub(g,p0);dir=unit(sub(dir,mul(tan,dot(dir,tan))));
   const L=24-3*k;
   add_({id:`dp-s${k}`,name:`Septal de la DP ${k}`,short:`SDP${k}`,system:'right',family:'cd',parent:'pda',way:[p0,add(p0,mul(dir,L*0.4)),add(p0,mul(unit(add(dir,mul(tan,0.4))),L))],diam:[[0,1.2],[1,0.6]],source:sy('spline from the PDA into the interventricular septum',['FJ2735','FJ2736']),
    segments:[{id:`dp-s${k}`,syntax:'',name:`Septal de la DP ${k}`,short:`SDP${k}`,from:0,to:1}]});
  });
 }
 if(left||co){
  const lplC=C('lpla');
  add_({id:'lpl',name:'Posterolateral izquierda',short:'PLI',system:'left',family:'cx',parent:'lcx',way:lplC.points,diam:taper(co?[[0,1.6],[1,0.9]]:[[0,2.1],[1,1.0]],lplC),source:ic('L-PLA',lplC.n),
   segments:[{id:'lpl',syntax:'14',name:'Posterolateral izquierda',short:'PLI',from:0,to:1}]});
 }
 if(left){
  const lpdaC=C('lpda');
  const lp=add_({id:'lpda',name:'Descendente posterior izquierda',short:'DPI',system:'left',family:'cx',parent:'lcx',way:lpdaC.points,diam:taper([[0,2.3],[1,1.1]],lpdaC),source:ic('L-PDA',lpdaC.n),
   segments:[{id:'lpda',syntax:'15',name:'Descendente posterior izquierda',short:'DPI',from:0,to:1}]});
  lp.parentArc=1;
  [[1,0.2],[2,0.42],[3,0.66]].forEach(([k,t])=>{
   const p0=at('lpda',t),tan=unit(sub(at('lpda',Math.min(1,t+0.03)),at('lpda',Math.max(0,t-0.03))));
   const g=pointAt(byId.get('lad').points,Math.min(0.95,0.95-t*0.8));
   let dir=sub(g,p0);dir=unit(sub(dir,mul(tan,dot(dir,tan))));const L=24-3*k;
   add_({id:`dp-s${k}`,name:`Septal de la DPI ${k}`,short:`SDP${k}`,system:'left',family:'cx',parent:'lpda',way:[p0,add(p0,mul(dir,L*0.4)),add(p0,mul(unit(add(dir,mul(tan,0.4))),L))],diam:[[0,1.2],[1,0.6]],source:sy('spline from the left PDA into the interventricular septum',['FJ2735','FJ2736']),
    segments:[{id:`dp-s${k}`,syntax:'',name:`Septal de la DPI ${k}`,short:`SDP${k}`,from:0,to:1}]});
  });
 }
 // AV nodal artery: from the dominant vessel at the crux, up toward the AV node region
 {
  const host=left?'lcx':'rca',hostV=byId.get(host),cruxPt=hostV.points.at(-1);
  const up=unit(sub(ctx.avnTarget,cruxPt));
  add_({id:'avn',name:'Arteria del nodo auriculoventricular',short:'NAV',system:left?'left':'right',family:left?'cx':'cd',parent:host,way:[cruxPt,add(cruxPt,mul(up,6)),add(cruxPt,mul(up,13))],diam:[[0,1.2],[1,0.8]],source:sy('short spline from the crux toward the AV node region (base of the septum)'),
   segments:[{id:'avn',syntax:'',name:'Arteria del nodo auriculoventricular',short:'NAV',from:0,to:1}]}).parentArc=1;
 }
 const landmarks={lmOstium:lm.points[0],rcaOstium:byId.get('rca').points[0],apex:ctx.apex,crux:left?byId.get('lcx').points.at(-1):byId.get('rca').points.at(-1),aorticRootCentre:ctx.aorticRootCentre,lmBifurcation:bif};
 return {vessels,landmarks};
}

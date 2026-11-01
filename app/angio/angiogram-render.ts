// X-ray style renderer of the angiogram (S5). The camera is the C-arm geometry (source at −SOD·d, image mirrored so screen
// right = u, as seen from the detector); vessels are closed tubes drawn additively into a float target, front faces
// subtracting and back faces adding the ray distance, so every pixel ends up with the total chord length (mm) the beam
// crosses (4× multisampled, so silhouettes get real partial coverage). The compositor turns it into intensity = background · exp(−μ·thickness)
// with vignette; a last pass adds the cath-lab edge enhancement (unsharp mask) and then the film grain, so the grain is never sharpened or softened.
import * as T from 'three';
import {FIELD_SIZE,SID,SOD,imageAxes,projectWith} from './core/geometry';
import {FAMILY_PALETTE,arcLengths,pointAtLength,polylineLength,segmentRange,visibleVessels} from './core/tree';
import type {CoronaryTree,GraftId,Vec3,Vessel,Visibility} from './core/types';
import {heartCloud,paintBackground} from './angiogram-background';

const GRAFTS_OF:Record<'left'|'right',GraftId[]>={left:['lima','svg-om'],right:['svg-pda']};

/** Vessels opacified for the injected system: 'left' adds the left grafts, 'right' the right one, 'both' everything visible. */
export function injectedVessels(tree:CoronaryTree,vis:Visibility):Vessel[]{
 return visibleVessels(tree,vis).filter(v=>{
  if(v.system!=='graft'||vis.system==='both')return true;
  return GRAFTS_OF[vis.system].includes(v.id as GraftId);
 });
}

export const TUBE_STEP=1.5;   // mm between rings
const SIDES=8,MIN_RADIUS=.1,RADIUS_SCALE=.95;
/** Calibre curve (S24): trunks (radius ≳ 2 mm) are drawn this much wider than their anatomical radius, distal twigs (≲ 0.8 mm) keep theirs. */
const TRUNK_BOOST=.2,TRUNK_R0=.8,TRUNK_R1=2;
const calibre=(r:number)=>{const k=Math.min(Math.max((r-TRUNK_R0)/(TRUNK_R1-TRUNK_R0),0),1);return 1+TRUNK_BOOST*k*k*(3-2*k);};
/** Contrast fill (S14): the front travels from the ostium to the farthest tip in FILL_S seconds; the "CINE" timer stops at CINE_END. */
export const FILL_S=1.4,CINE_END=1.8;
const FRONT_SOFT_MM=38;
/** Ostium puff (S22): centre this far behind the ostium (towards the sinus), Gaussian sigma and peak density in the compositor's chord units. */
const PUFF_BACK_MM=4,PUFF_SIGMA_MM=4.8,PUFF_DENSITY=2.5;

export interface TubeBuild{geometry:T.BufferGeometry;segmentIds:string[];/** Longest ostium-to-tip path (mm). */maxDist:number;/** Where each injected system's catheter enters (mm, patient frame). */ostia:Vec3[];/** Unit vector of each vessel leaving its ostium (same order). */ostiaDirs:Vec3[]}

/** Distance (mm) along the vessels from the ostium to the start of each vessel: parent's own offset + the arc up to the branch point. */
function ostiumOffsets(vessels:readonly Vessel[]):Map<string,number>{
 const byId=new Map(vessels.map(v=>[v.id,v])),out=new Map<string,number>();
 const of=(v:Vessel,depth=0):number=>{
  const known=out.get(v.id);if(known!==undefined)return known;
  const parent=v.parent&&depth<12?byId.get(v.parent):undefined;
  const o=parent?of(parent,depth+1)+(v.parentArc??1)*polylineLength(parent.points):0;
  out.set(v.id,o);return o;
 };
 vessels.forEach(v=>of(v));
 return out;
}
/** Three light passes of a [1 2 1] kernel with the ends pinned: taper without kinks even if the data has them. */
function smoothRadii(r:readonly number[]):number[]{
 let a=[...r];
 for(let k=0;k<3;k++)a=a.map((x,i)=>i===0||i===a.length-1?x:(a[i-1]+2*x+a[i+1])/4);
 return a;
}

/** Radius as drawn: anatomical radius × scale × calibre curve. */
const drawnRadius=(r:number)=>Math.max(r*RADIUS_SCALE*calibre(r),MIN_RADIUS);
/** Rounded ends: number of rings in each dome. */
const DOME_RINGS=3;
/** Arc (mm) at which a child vessel leaves its parent's drawn lumen; before that point it lies inside the parent and would be counted twice. */
function parentExit(child:Vessel,parent:Vessel,childArcs:readonly number[]):number{
 const pa=parent.points,total=childArcs[childArcs.length-1],reach=Math.min(total,25);
 for(let s=0;s<=reach;s+=.25){
  const q=pointAtLength(child.points,child.radii,childArcs,s).p;
  let best=Infinity,rp=0;
  for(let i=0;i+1<pa.length;i++){
   const a=pa[i],b=pa[i+1],ex=b[0]-a[0],ey=b[1]-a[1],ez=b[2]-a[2],l2=ex*ex+ey*ey+ez*ez;
   const u=l2>0?Math.min(Math.max(((q[0]-a[0])*ex+(q[1]-a[1])*ey+(q[2]-a[2])*ez)/l2,0),1):0;
   const d=Math.hypot(q[0]-a[0]-ex*u,q[1]-a[1]-ey*u,q[2]-a[2]-ez*u);
   if(d<best){best=d;rp=parent.radii[i]+(parent.radii[i+1]-parent.radii[i])*u;}
  }
  if(best>=drawnRadius(rp)*.9)return s;
 }
 return 0;
}

interface Ring{c:Vec3;n1:T.Vector3;n2:T.Vector3;r:number;dist:number;/** Segment index the ring belongs to, or −1 for "every segment whose range contains `arc`". */seg:number;arc:number}

/**
 * One continuous closed tube per vessel, merged in a single geometry (S5, S22, S24). Rings are shared by the whole vessel (one tangent and
 * one parallel-transported frame along it), so segment boundaries carry no cap and no kink; a segment only gets its own copy of the
 * boundary ring so `aSeg` stays constant over its strip. The free ends are rounded domes (the ostium one sits under the puff). A child
 * starts where it leaves its parent's lumen, so the part inside the parent is not counted twice. `aSeg` is the segment index, `aTint`
 * its family colour and `aDist` the distance from the ostium.
 */
export function buildTubes(vessels:readonly Vessel[]):TubeBuild{
 const pos:number[]=[],tint:number[]=[],seg:number[]=[],dst:number[]=[],idx:number[]=[],segmentIds:string[]=[];
 const col=new T.Color(),offsets=ostiumOffsets(vessels),ostia:Vec3[]=[],ostiaDirs:Vec3[]=[];
 const byId=new Map(vessels.map(v=>[v.id,v]));
 let maxDist=1;
 for(const vessel of vessels){
  col.set(FAMILY_PALETTE[vessel.family]);
  const off=offsets.get(vessel.id)??0;
  if(!vessel.parent&&vessel.system!=='graft'&&vessel.points.length){
   const p0=vessel.points[0],p1=vessel.points[Math.min(4,vessel.points.length-1)],l=Math.hypot(p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2])||1;
   ostia.push(p0);ostiaDirs.push([(p1[0]-p0[0])/l,(p1[1]-p0[1])/l,(p1[2]-p0[2])/l]);
  }
  if(vessel.points.length<2||!vessel.segments.length)continue;
  const vArcs=arcLengths(vessel.points),total=vArcs[vArcs.length-1];
  const ranges=vessel.segments.map(sg=>{const {f0,f1}=segmentRange(vessel,sg);return [Math.min(f0,f1)*total,Math.max(f0,f1)*total] as const;});
  const smin=Math.min(...ranges.map(r=>r[0])),smax=Math.max(...ranges.map(r=>r[1]));
  if(smax-smin<1e-6)continue;
  const parent=vessel.parent?byId.get(vessel.parent):undefined;
  let sTrim=parent?Math.max(smin,parentExit(vessel,parent,vArcs)):smin;
  if(sTrim>smax-1)sTrim=smin;
  // Sample arcs: a regular grid from the (trimmed) start, plus every segment boundary.
  const arcSet:number[]=[sTrim,smax];
  for(let a=sTrim+TUBE_STEP;a<smax-1e-6;a+=TUBE_STEP)arcSet.push(a);
  for(const [r0,r1] of ranges)for(const a of [r0,r1])if(a>sTrim+1e-6&&a<smax-1e-6)arcSet.push(a);
  arcSet.sort((x,y)=>x-y);
  const arcs=arcSet.filter((a,i)=>i===0||a-arcSet[i-1]>1e-6),n=arcs.length;
  if(n<2)continue;
  const pts=arcs.map(a=>pointAtLength(vessel.points,vessel.radii,vArcs,a));
  const radii=smoothRadii(pts.map(q=>q.r)).map(drawnRadius);
  // Frames: smooth central-difference tangents, parallel-transported along the whole vessel.
  const tans:T.Vector3[]=[],n1s:T.Vector3[]=[],n2s:T.Vector3[]=[];
  const t=new T.Vector3(),prev=new T.Vector3(0,1,0),n1=new T.Vector3();
  for(let i=0;i<n;i++){
   const q0=pts[Math.max(i-1,0)].p,q1=pts[Math.min(i+1,n-1)].p;
   t.set(q1[0]-q0[0],q1[1]-q0[1],q1[2]-q0[2]);
   if(t.lengthSq()<1e-12)t.copy(prev);else t.normalize();
   prev.copy(t);
   if(i===0){const w=Math.abs(t.x)<.6?new T.Vector3(1,0,0):new T.Vector3(0,1,0);n1.crossVectors(t,w).normalize();}
   else{n1.addScaledVector(t,-n1.dot(t));if(n1.lengthSq()<1e-12)n1.set(t.y,-t.x,0);n1.normalize();}
   tans.push(t.clone());n1s.push(n1.clone());n2s.push(new T.Vector3().crossVectors(t,n1));   // (n1, n2, t) right-handed
  }
  const rings:Ring[]=[];
  const fwd=ranges.findIndex(([r0,r1])=>r0-1e-6<=sTrim&&sTrim<r1-1e-6),bwd=ranges.findIndex(([r0,r1])=>r0+1e-6<smax&&smax<=r1+1e-6);
  const firstSeg=fwd>=0?fwd:0,lastSeg=bwd>=0?bwd:ranges.length-1;
  const dome=(i:number,sign:1|-1,owner:number)=>{   // rings from the full ring outwards: sign −1 behind the start, +1 beyond the end
   const list:Ring[]=[];
   for(let k=1;k<=DOME_RINGS;k++){
    const phi=k/DOME_RINGS*Math.PI/2,sh=radii[i]*Math.sin(phi),c=pts[i].p,tv=tans[i];
    list.push({c:[c[0]+sign*tv.x*sh,c[1]+sign*tv.y*sh,c[2]+sign*tv.z*sh],n1:n1s[i],n2:n2s[i],r:k===DOME_RINGS?0:radii[i]*Math.cos(phi),dist:off+arcs[i]+sign*sh,seg:owner,arc:arcs[i]});
   }
   return list;
  };
  rings.push(...dome(0,-1,firstSeg).reverse());
  for(let i=0;i<n;i++)rings.push({c:pts[i].p,n1:n1s[i],n2:n2s[i],r:radii[i],dist:off+arcs[i],seg:-1,arc:arcs[i]});
  rings.push(...dome(n-1,1,lastSeg));
  maxDist=Math.max(maxDist,off+arcs[n-1]+radii[n-1]);
  vessel.segments.forEach((sg,si)=>{
   const [r0,r1]=ranges[si],mine=rings.filter(g=>g.seg===si||(g.seg<0&&g.arc>=r0-1e-6&&g.arc<=r1+1e-6));
   if(mine.length<2)return;
   const id=segmentIds.length;segmentIds.push(sg.id);
   const base=pos.length/3;
   for(const g of mine)for(let j=0;j<SIDES;j++){
    const th=j/SIDES*Math.PI*2,cs=Math.cos(th)*g.r,sn=Math.sin(th)*g.r;
    pos.push(g.c[0]+g.n1.x*cs+g.n2.x*sn,g.c[1]+g.n1.y*cs+g.n2.y*sn,g.c[2]+g.n1.z*cs+g.n2.z*sn);
    tint.push(col.r,col.g,col.b);seg.push(id);dst.push(g.dist);
   }
   for(let i=0;i<mine.length-1;i++)for(let j=0;j<SIDES;j++){
    const a=base+i*SIDES+j,b=base+i*SIDES+(j+1)%SIDES,c=base+(i+1)*SIDES+j,d=base+(i+1)*SIDES+(j+1)%SIDES;
    idx.push(a,b,c,b,d,c);   // outward normal e_θ × t
   }
  });
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 geometry.setAttribute('aTint',new T.Float32BufferAttribute(tint,3));
 geometry.setAttribute('aSeg',new T.Float32BufferAttribute(seg,1));
 geometry.setAttribute('aDist',new T.Float32BufferAttribute(dst,1));
 geometry.setIndex(idx);
 return {geometry,segmentIds,maxDist,ostia,ostiaDirs};
}

const TUBE_VERT=`
attribute vec3 aTint;attribute float aSeg;attribute float aDist;
centroid varying vec3 vView;varying vec3 vTint;varying float vSeg;centroid varying float vDist;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vView=mv.xyz;vTint=aTint;vSeg=aSeg;vDist=aDist;gl_Position=projectionMatrix*mv;}`;
// Ray length relative to the isocentre; the overall sign depends on winding and the mirrored projection, so the compositor takes abs().
const TUBE_FRAG=`
uniform float uSod;uniform float uSel;uniform float uSelPrev;uniform float uHover;uniform float uFront;uniform float uSoftMm;
centroid varying vec3 vView;varying vec3 vTint;varying float vSeg;centroid varying float vDist;
void main(){
 // Contrast front: everything nearer the ostium than the front is opaque, with a soft edge instead of a hard cut.
 float fill=1.-smoothstep(uFront-uSoftMm,uFront,vDist);
 float z=length(vView)-uSod,s=(gl_FrontFacing?-z:z)*fill;
 #ifdef TINT
 gl_FragColor=vec4(vTint*s,1.);
 #else
 gl_FragColor=vec4(s,abs(vSeg-uSel)<.5?s:0.,abs(vSeg-uSelPrev)<.5?s:0.,abs(vSeg-uHover)<.5?s:0.);
 #endif
}`;

const QUAD_VERT=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const QUAD_FRAG=`
uniform sampler2D uThick;uniform sampler2D uTint;uniform sampler2D uBg;
uniform float uSharp;uniform vec3 uCurve;uniform float uTexel;uniform float uSoft;uniform float uMu;uniform float uColor;
uniform float uWCur;uniform float uWPrev;uniform float uWHover;uniform float uDens;uniform vec4 uPuff0;uniform vec4 uPuff1;
varying vec2 vUv;
vec4 th(vec2 o){return abs(texture2D(uThick,vUv+o*uTexel));}
// Contrast cloud: a round core plus a wider skirt, elongated a little along the catheter axis (p.xy centre, p.z amplitude, p.w sigma in uv).
float puff(vec4 p){vec2 d=vUv-p.xy;float r2=dot(d,d)/(p.w*p.w);return p.z*(exp(-r2*.5)*.8+exp(-r2*.14)*.35);}
void main(){
 float t=0.,s=0.,sp=0.,sh=0.,w=0.;vec3 tc=vec3(0.);
 // The target is multisampled; this tent kernel (about 0.4 px) only hides what is left of the rasterised steps.
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  float k=(i==0?2.:1.)*(j==0?2.:1.);vec2 o=vec2(float(i),float(j))*uSoft*.3;
  vec4 v=th(o);
  t+=k*v.r;s+=k*v.g;sp+=k*v.b;sh+=k*v.a;tc+=k*abs(texture2D(uTint,vUv+o*uTexel).rgb);w+=k;
 }
 t/=w;s/=w;sp/=w;sh/=w;tc/=w;
 float wide=0.;
 for(int k=0;k<8;k++){float an=float(k)*.7853982;wide+=th(vec2(cos(an),sin(an))*uSoft*2.5).r;}
 wide/=8.;
 float tb=max(t+uSharp*(t-wide),0.)*uDens;               // unsharp mask on the chord length: crisper rims, darker cores, nothing added outside
 tb=uCurve.x*pow(tb,uCurve.y);                          // thin twigs keep their contrast, thick trunks gain depth
 tb=uCurve.z*(1.-exp(-tb/uCurve.z));                    // soft ceiling so overlapping trunks do not turn black
 float pf=puff(uPuff0)+puff(uPuff1);                    // contrast cloud at the injected ostium (equivalent chord, same units as tb)
 float bg=texture2D(uBg,vUv).r;
 vec2 q=vUv-.5;
 bg*=1.-.26*pow(clamp(length(q)*1.35,0.,1.),2.4);       // mild vignette
 float cov=1.-exp(-uMu*(tb+pf));
 float vcov=1.-exp(-uMu*tb);
 vec3 tint=clamp(tc/max(t,.05),0.,1.);
 vec3 vessel=tint*(.5+.5*bg);
 vec3 grey=vec3(bg*(1.-cov));                           // plain Beer-Lambert: grey, not black
 vec3 col=mix(grey,mix(vec3(bg*(1.-.5*(cov-vcov))),vessel,vcov),uColor*smoothstep(0.,.08,tb));
 float sc=(1.-exp(-1.8*s))*uWCur+(1.-exp(-1.8*sp))*uWPrev;   // selected segment: warm overlay, fading in and out
 float hc=(1.-exp(-1.8*sh))*uWHover;                          // hovered segment: lighter, yellower overlay, under the selection
 // Translucent tints: the vessel's own darkness still modulates the colour (dark core stays visible through it).
 float lum=dot(col,vec3(.299,.587,.114));
 col=mix(col,vec3(1.,.78,.4)*(.28+.95*lum),clamp(hc,0.,1.));
 col=mix(col,vec3(1.,.66,.22)*(.46+lum),clamp(sc,0.,1.));
 gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;

// Last pass: cath-lab style edge enhancement (unsharp mask, radius about 1.2 px) on the composited image, then the film grain.
// The dark side of an edge is deepened fully, the light side only a little, so the background gets no halos.
const SHARP_FRAG=`
uniform sampler2D uComp;uniform float uTexel;uniform float uRad;uniform float uAmt;uniform float uHalo;uniform float uSeed;uniform float uGrain;
varying vec2 vUv;
float hash(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p.yx+19.19);return fract((p.x+p.y)*p.x);}
vec3 at(vec2 o){return texture2D(uComp,vUv+o*uTexel*uRad).rgb;}
void main(){
 vec3 c=at(vec2(0.));
 vec3 b=(c*4.+(at(vec2(1.,0.))+at(vec2(-1.,0.))+at(vec2(0.,1.))+at(vec2(0.,-1.)))*2.+at(vec2(1.,1.))+at(vec2(-1.,1.))+at(vec2(1.,-1.))+at(vec2(-1.,-1.)))/16.;
 vec3 d=c-b;
 vec3 col=c+uAmt*mix(d,d*uHalo,step(0.,d));
 vec2 px=gl_FragCoord.xy;
 float grain=(hash(px+uSeed)-.5)*uGrain+(hash(floor(px*.5)+uSeed*1.7)-.5)*uGrain*.2;
 gl_FragColor=vec4(clamp(col+grain,0.,1.),1.);
}`;

/** A selected segment and how visible its orange overlay is (0–1). */
export interface Highlight{id:string|null;weight:number}
/** `pan` is field-normalised and already includes the centring on the injected system. */
export interface RenderOptions{a:number;b:number;pan:readonly [number,number];color:boolean;sel:Highlight;prev:Highlight;
 /** Segment under the pointer (S20) and how visible its yellow-orange overlay is. */
 hover:Highlight;
 /** Seconds since the injection started (S14); anything ≥ CINE_END draws the fully opacified tree. */
 fill:number}

export interface AngioRenderer{
 setScene(tree:CoronaryTree,vessels:readonly Vessel[]):void;
 /** Resize the drawing buffer for a square panel of `cssSize` CSS pixels. */
 resize(cssSize:number,dpr:number):void;
 render(o:RenderOptions):void;
 dispose():void}

/** Null when WebGL 2 (or a usable float render target) is unavailable. */
export function createAngioRenderer(canvas:HTMLCanvasElement):AngioRenderer|null{
 let renderer:T.WebGLRenderer;
 try{renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});}catch{return null;}
 if(!renderer.capabilities.isWebGL2){renderer.dispose();return null;}
 const ext=renderer.extensions;
 const fullFloat=ext.has('EXT_color_buffer_float')&&ext.has('EXT_float_blend')&&ext.has('OES_texture_float_linear');
 const halfOk=ext.has('EXT_color_buffer_float')||ext.has('EXT_color_buffer_half_float');
 if(!fullFloat&&!halfOk){renderer.dispose();return null;}
 renderer.outputColorSpace=T.LinearSRGBColorSpace;
 renderer.setPixelRatio(1);

 const targetOpts={type:fullFloat?T.FloatType:T.HalfFloatType,format:T.RGBAFormat,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,generateMipmaps:false,samples:4};
 const compOpts={type:halfOk?T.HalfFloatType:T.UnsignedByteType,format:T.RGBAFormat,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,generateMipmaps:false};
 let size=512;
 const rtThick=new T.WebGLRenderTarget(size,size,targetOpts),rtTint=new T.WebGLRenderTarget(size,size,targetOpts),rtComp=new T.WebGLRenderTarget(size,size,compOpts);
 const additive={side:T.DoubleSide,depthTest:false,depthWrite:false,transparent:true,blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.OneFactor,blendDst:T.OneFactor,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneFactor};
 const fillUniforms=()=>({uSod:{value:SOD},uSel:{value:-1},uSelPrev:{value:-1},uHover:{value:-1},uFront:{value:1e6},uSoftMm:{value:FRONT_SOFT_MM}});
 const matThick=new T.ShaderMaterial({vertexShader:TUBE_VERT,fragmentShader:TUBE_FRAG,uniforms:fillUniforms(),...additive});
 const matTint=new T.ShaderMaterial({vertexShader:TUBE_VERT,fragmentShader:TUBE_FRAG,defines:{TINT:1},uniforms:fillUniforms(),...additive});
 const tubes=new T.Mesh(new T.BufferGeometry(),matThick);tubes.frustumCulled=false;
 const tubeScene=new T.Scene();tubeScene.add(tubes);
 const camera=new T.PerspectiveCamera();camera.matrixAutoUpdate=false;

 const bgCanvas=document.createElement('canvas'),BG=512;bgCanvas.width=bgCanvas.height=BG;
 const bgCtx=bgCanvas.getContext('2d')!;
 const bgTex=new T.CanvasTexture(bgCanvas);bgTex.minFilter=T.LinearFilter;bgTex.generateMipmaps=false;
 const quadMat=new T.ShaderMaterial({vertexShader:QUAD_VERT,fragmentShader:QUAD_FRAG,depthTest:false,depthWrite:false,uniforms:{
  uThick:{value:rtThick.texture},uTint:{value:rtTint.texture},uBg:{value:bgTex},uTexel:{value:1/size},uSoft:{value:1},uMu:{value:.17},uSharp:{value:.45},uCurve:{value:new T.Vector3(.62,1.3,3.5)},uColor:{value:0},
  uWCur:{value:0},uWPrev:{value:0},uWHover:{value:0},uDens:{value:1},uPuff0:{value:new T.Vector4()},uPuff1:{value:new T.Vector4()}}});
 const sharpMat=new T.ShaderMaterial({vertexShader:QUAD_VERT,fragmentShader:SHARP_FRAG,depthTest:false,depthWrite:false,uniforms:{
  uComp:{value:rtComp.texture},uTexel:{value:1/size},uRad:{value:1},uAmt:{value:2.2},uHalo:{value:.3},uSeed:{value:0},uGrain:{value:.05}}});
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),quadMat);quad.frustumCulled=false;
 const quadScene=new T.Scene();quadScene.add(quad);
 const quadCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);

 let segmentIds:string[]=[],cloudPts:[number,number,number][]|null=null,hasTubes=false,maxDist=1,ostia:Vec3[]=[],ostiaDirs:Vec3[]=[],bgKey='';
 const v3=(p:readonly number[],k=1)=>new T.Vector3(p[0]*k,p[1]*k,p[2]*k);

 function placeCamera(a:number,b:number,pan:readonly [number,number]){
  const {d,u,v}=imageAxes(a,b);
  camera.matrix.makeBasis(v3(u,-1),v3(v),v3(d,-1)).setPosition(-SOD*d[0],-SOD*d[1],-SOD*d[2]);
  camera.matrixWorldNeedsUpdate=true;camera.updateMatrixWorld(true);
  // Off-axis frustum: ±FIELD_SIZE/2 on the detector, x mirrored so screen right = u, shifted by the table pan.
  const n=400,f=1400,w=FIELD_SIZE/2*n/SID;
  camera.projectionMatrix.set(-n/w,0,-pan[0],0, 0,n/w,-pan[1],0, 0,0,-(f+n)/(f-n),-2*f*n/(f-n), 0,0,-1,0);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 }

 return {
  setScene(tree,vessels){
   const old=tubes.geometry;
   const built=buildTubes(vessels);
   tubes.geometry=built.geometry;segmentIds=built.segmentIds;hasTubes=built.segmentIds.length>0;maxDist=built.maxDist;ostia=built.ostia;ostiaDirs=built.ostiaDirs;bgKey='';
   old.dispose();
   cloudPts=heartCloud(tree);
  },
  resize(cssSize,dpr){
   // Full device resolution (S24): the targets are as big as the canvas is on screen, never upscaled from a smaller one (DPR capped at 2).
   const css=canvas.getBoundingClientRect().width||cssSize,ratio=Math.min(dpr,2);
   const n=Math.max(256,Math.min(2048,Math.round(css*ratio)));
   if(n===size&&renderer.domElement.width===n)return;
   size=n;renderer.setSize(n,n,false);rtThick.setSize(n,n);rtTint.setSize(n,n);rtComp.setSize(n,n);
   quadMat.uniforms.uTexel.value=1/n;quadMat.uniforms.uSoft.value=n/css;sharpMat.uniforms.uTexel.value=1/n;sharpMat.uniforms.uRad.value=1.0*n/css;bgKey='';
  },
  render(o){
   // The background only depends on the view, so it is not repainted while the fill or a highlight animates.
   const key=[o.a,o.b,o.pan[0],o.pan[1]].join('|');
   if(key!==bgKey){bgKey=key;paintBackground(bgCtx,BG,o.a,o.b,o.pan,cloudPts);bgTex.needsUpdate=true;}
   const idx=(h:Highlight)=>h.id?segmentIds.indexOf(h.id):-1;
   matThick.uniforms.uSel.value=idx(o.sel);matThick.uniforms.uSelPrev.value=idx(o.prev);matThick.uniforms.uHover.value=idx(o.hover);
   const p=Math.min(Math.max(o.fill/FILL_S,0),1),done=o.fill>=CINE_END,ease=1-Math.pow(1-p,1.5);
   matThick.uniforms.uFront.value=matTint.uniforms.uFront.value=done?1e6:ease*(maxDist+FRONT_SOFT_MM);
   const smooth=(a:number,b:number,x:number)=>{const k=Math.min(Math.max((x-a)/(b-a),0),1);return k*k*(3-2*k);};
   const qu=quadMat.uniforms;
   qu.uWCur.value=o.sel.weight;qu.uWPrev.value=o.prev.weight;qu.uWHover.value=o.hover.weight;
   qu.uDens.value=done?1:.78+.22*smooth(.2,CINE_END,o.fill);
   // Contrast cloud at each ostium, on the aortic-sinus side (behind the ostium, against the vessel's direction): rises with the injection and
   // settles at a fainter level once the vessels are filled.
   const h=FIELD_SIZE/2,ax=imageAxes(o.a,o.b),amp=done?.8:smooth(0,.3,o.fill)*(1-.2*smooth(.9,CINE_END,o.fill));
   for(const [k,u] of [qu.uPuff0,qu.uPuff1].entries()){
    const pt=ostia[k],dir=ostiaDirs[k];
    if(!pt||!dir||!hasTubes){u.value.set(0,0,0,1);continue;}
    const q=projectWith(ax,[pt[0]-dir[0]*PUFF_BACK_MM,pt[1]-dir[1]*PUFF_BACK_MM,pt[2]-dir[2]*PUFF_BACK_MM]);
    u.value.set((q.x/h+o.pan[0]+1)/2,(q.y/h+o.pan[1]+1)/2,amp*PUFF_DENSITY,PUFF_SIGMA_MM/FIELD_SIZE);
   }
   renderer.setClearColor(0x000000,0);
   renderer.setRenderTarget(rtThick);renderer.clear();
   if(hasTubes){
    placeCamera(o.a,o.b,o.pan);
    tubes.material=matThick;renderer.render(tubeScene,camera);
   }
   renderer.setRenderTarget(rtTint);renderer.clear();
   if(hasTubes&&o.color){tubes.material=matTint;renderer.render(tubeScene,camera);}
   qu.uColor.value=o.color?1:0;
   sharpMat.uniforms.uSeed.value=(Math.abs(o.a*.123+o.b*.0731)%1)*97+(Math.abs(o.pan[0]*3.1+o.pan[1]*1.7)%1)*13;
   renderer.setRenderTarget(rtComp);quad.material=quadMat;renderer.render(quadScene,quadCamera);
   renderer.setRenderTarget(null);quad.material=sharpMat;renderer.render(quadScene,quadCamera);
  },
  dispose(){
   tubes.geometry.dispose();matThick.dispose();matTint.dispose();quadMat.dispose();sharpMat.dispose();quad.geometry.dispose();
   bgTex.dispose();rtThick.dispose();rtTint.dispose();rtComp.dispose();renderer.dispose();
  },
 };
}

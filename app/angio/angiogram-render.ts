// X-ray style renderer of the angiogram (S5). The camera is the C-arm geometry (source at −SOD·d, image mirrored so screen
// right = u, as seen from the detector); vessels are closed tubes drawn additively into a float target, front faces
// subtracting and back faces adding the ray distance, so every pixel ends up with the total chord length (mm) the beam
// crosses. The compositor turns it into intensity = background · exp(−μ·thickness), with soft edges, bloom, vignette and grain.
import * as T from 'three';
import {DETECTOR_SIZE,SID,SOD,imageAxes} from './core/geometry';
import {FAMILY_PALETTE,sampleSegment,visibleVessels} from './core/tree';
import type {CoronaryTree,GraftId,Vessel,Visibility} from './core/types';
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
const SIDES=8,MIN_RADIUS=.12;

export interface TubeBuild{geometry:T.BufferGeometry;segmentIds:string[]}

/** One closed, capped tube per segment, merged in a single geometry; `aSeg` is the segment index, `aTint` its family colour. */
export function buildTubes(vessels:readonly Vessel[]):TubeBuild{
 const pos:number[]=[],tint:number[]=[],seg:number[]=[],idx:number[]=[],segmentIds:string[]=[];
 const col=new T.Color();
 for(const vessel of vessels){
  col.set(FAMILY_PALETTE[vessel.family]);
  for(const s of vessel.segments){
   const sm=sampleSegment(vessel,s,TUBE_STEP),n=sm.points.length;
   if(n<2)continue;
   const si=segmentIds.length;segmentIds.push(s.id);
   const base=pos.length/3;
   const t=new T.Vector3(),prev=new T.Vector3(),n1=new T.Vector3(),n2=new T.Vector3();
   for(let i=0;i<n;i++){
    const p0=sm.points[Math.max(i-1,0)],p1=sm.points[Math.min(i+1,n-1)];
    t.set(p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]);
    if(t.lengthSq()<1e-12)t.copy(prev);else t.normalize();
    if(t.lengthSq()<1e-12)t.set(0,1,0);
    prev.copy(t);
    if(i===0){const w=Math.abs(t.x)<.6?new T.Vector3(1,0,0):new T.Vector3(0,1,0);n1.crossVectors(t,w).normalize();}
    else{n1.addScaledVector(t,-n1.dot(t));if(n1.lengthSq()<1e-12)n1.set(t.y,-t.x,0);n1.normalize();}
    n2.crossVectors(t,n1);   // (n1, n2, t) right-handed: angle increases counter-clockwise seen from +t
    const c=sm.points[i],r=Math.max(sm.radii[i],MIN_RADIUS);
    for(let j=0;j<SIDES;j++){
     const th=j/SIDES*Math.PI*2,cs=Math.cos(th)*r,sn=Math.sin(th)*r;
     pos.push(c[0]+n1.x*cs+n2.x*sn,c[1]+n1.y*cs+n2.y*sn,c[2]+n1.z*cs+n2.z*sn);
     tint.push(col.r,col.g,col.b);seg.push(si);
    }
   }
   for(let i=0;i<n-1;i++)for(let j=0;j<SIDES;j++){
    const a=base+i*SIDES+j,b=base+i*SIDES+(j+1)%SIDES,c=base+(i+1)*SIDES+j,d=base+(i+1)*SIDES+(j+1)%SIDES;
    idx.push(a,b,c,b,d,c);   // outward normal e_θ × t
   }
   // Caps close the mesh so every ray enters and leaves it (balanced signs where tubes meet or end inside others).
   for(const [end,ci] of [[0,0],[n-1,1]] as const){
    const c=sm.points[end],cv=pos.length/3;
    pos.push(c[0],c[1],c[2]);tint.push(col.r,col.g,col.b);seg.push(si);
    for(let j=0;j<SIDES;j++){
     const a=base+end*SIDES+j,b=base+end*SIDES+(j+1)%SIDES;
     if(ci)idx.push(a,b,cv);else idx.push(b,a,cv);   // end faces +t, start faces −t
    }
   }
  }
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 geometry.setAttribute('aTint',new T.Float32BufferAttribute(tint,3));
 geometry.setAttribute('aSeg',new T.Float32BufferAttribute(seg,1));
 geometry.setIndex(idx);
 return {geometry,segmentIds};
}

const TUBE_VERT=`
attribute vec3 aTint;attribute float aSeg;
varying vec3 vView;varying vec3 vTint;varying float vSeg;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vView=mv.xyz;vTint=aTint;vSeg=aSeg;gl_Position=projectionMatrix*mv;}`;
// Ray length relative to the isocentre; the overall sign depends on winding and the mirrored projection, so the compositor takes abs().
const TUBE_FRAG=`
uniform float uSod;uniform float uSel;
varying vec3 vView;varying vec3 vTint;varying float vSeg;
void main(){
 float z=length(vView)-uSod,s=gl_FrontFacing?-z:z;
 #ifdef TINT
 gl_FragColor=vec4(vTint*s,1.);
 #else
 gl_FragColor=vec4(s,abs(vSeg-uSel)<.5?s:0.,0.,1.);
 #endif
}`;

const QUAD_VERT=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const QUAD_FRAG=`
uniform sampler2D uThick;uniform sampler2D uTint;uniform sampler2D uBg;
uniform float uTexel;uniform float uSoft;uniform float uMu;uniform float uSeed;uniform float uColor;
varying vec2 vUv;
float hash(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p.yx+19.19);return fract((p.x+p.y)*p.x);}
vec4 th(vec2 o){return abs(texture2D(uThick,vUv+o*uTexel));}
void main(){
 float t=0.,s=0.,w=0.;vec3 tc=vec3(0.);
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  float k=(i==0?2.:1.)*(j==0?2.:1.);vec2 o=vec2(float(i),float(j))*uSoft;
  t+=k*th(o).r;s+=k*th(o).g;tc+=k*abs(texture2D(uTint,vUv+o*uTexel).rgb);w+=k;
 }
 t/=w;s/=w;tc/=w;
 float wide=0.;
 for(int k=0;k<8;k++){float an=float(k)*.7853982;wide+=th(vec2(cos(an),sin(an))*uSoft*3.5).r;}
 wide/=8.;
 float tb=t+.35*wide;                                   // slightly blooming edges
 float bg=texture2D(uBg,vUv).r;
 vec2 q=vUv-.5;
 bg*=1.-.55*pow(clamp(length(q)*1.35,0.,1.),2.4);       // mild vignette
 float cov=1.-exp(-uMu*tb);
 vec3 tint=clamp(tc/max(t,.05),0.,1.);
 vec3 vessel=mix(vec3(.02),tint*(.55+.5*bg),uColor);
 vec3 col=mix(vec3(bg),vessel,cov);
 float sc=1.-exp(-1.8*s);
 col=mix(col,vec3(1.,.55,.12),.92*sc);                   // selected segment: orange overlay
 vec2 px=gl_FragCoord.xy;
 float grain=(hash(px+uSeed)-.5)*.1+(hash(floor(px*.35)+uSeed*1.7)-.5)*.045;
 col+=grain*(.4+.6*(1.-cov));
 gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;

export interface RenderOptions{a:number;b:number;pan:readonly [number,number];color:boolean;selected:string|null}

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

 const targetOpts={type:fullFloat?T.FloatType:T.HalfFloatType,format:T.RGBAFormat,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,generateMipmaps:false};
 let size=512;
 const rtThick=new T.WebGLRenderTarget(size,size,targetOpts),rtTint=new T.WebGLRenderTarget(size,size,targetOpts);
 const additive={side:T.DoubleSide,depthTest:false,depthWrite:false,transparent:true,blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.OneFactor,blendDst:T.OneFactor,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneFactor};
 const matThick=new T.ShaderMaterial({vertexShader:TUBE_VERT,fragmentShader:TUBE_FRAG,uniforms:{uSod:{value:SOD},uSel:{value:-1}},...additive});
 const matTint=new T.ShaderMaterial({vertexShader:TUBE_VERT,fragmentShader:TUBE_FRAG,defines:{TINT:1},uniforms:{uSod:{value:SOD},uSel:{value:-1}},...additive});
 const tubes=new T.Mesh(new T.BufferGeometry(),matThick);tubes.frustumCulled=false;
 const tubeScene=new T.Scene();tubeScene.add(tubes);
 const camera=new T.PerspectiveCamera();camera.matrixAutoUpdate=false;

 const bgCanvas=document.createElement('canvas'),BG=512;bgCanvas.width=bgCanvas.height=BG;
 const bgCtx=bgCanvas.getContext('2d')!;
 const bgTex=new T.CanvasTexture(bgCanvas);bgTex.minFilter=T.LinearFilter;bgTex.generateMipmaps=false;
 const quadMat=new T.ShaderMaterial({vertexShader:QUAD_VERT,fragmentShader:QUAD_FRAG,depthTest:false,depthWrite:false,uniforms:{
  uThick:{value:rtThick.texture},uTint:{value:rtTint.texture},uBg:{value:bgTex},uTexel:{value:1/size},uSoft:{value:1},uMu:{value:.5},uSeed:{value:0},uColor:{value:0}}});
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),quadMat);quad.frustumCulled=false;
 const quadScene=new T.Scene();quadScene.add(quad);
 const quadCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);

 let segmentIds:string[]=[],cloudPts:[number,number,number][]|null=null,hasTubes=false;
 const v3=(p:readonly number[],k=1)=>new T.Vector3(p[0]*k,p[1]*k,p[2]*k);

 function placeCamera(a:number,b:number,pan:readonly [number,number]){
  const {d,u,v}=imageAxes(a,b);
  camera.matrix.makeBasis(v3(u,-1),v3(v),v3(d,-1)).setPosition(-SOD*d[0],-SOD*d[1],-SOD*d[2]);
  camera.matrixWorldNeedsUpdate=true;camera.updateMatrixWorld(true);
  // Off-axis frustum: ±DETECTOR_SIZE/2 on the detector, x mirrored so screen right = u, shifted by the table pan.
  const n=400,f=1400,w=DETECTOR_SIZE/2*n/SID;
  camera.projectionMatrix.set(-n/w,0,-pan[0],0, 0,n/w,-pan[1],0, 0,0,-(f+n)/(f-n),-2*f*n/(f-n), 0,0,-1,0);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 }

 return {
  setScene(tree,vessels){
   const old=tubes.geometry;
   const built=buildTubes(vessels);
   tubes.geometry=built.geometry;segmentIds=built.segmentIds;hasTubes=built.segmentIds.length>0;
   old.dispose();
   cloudPts=heartCloud(tree);
  },
  resize(cssSize,dpr){
   const n=Math.max(256,Math.min(1024,Math.round(cssSize*Math.min(dpr,2))));
   if(n===size&&renderer.domElement.width===n)return;
   size=n;renderer.setSize(n,n,false);rtThick.setSize(n,n);rtTint.setSize(n,n);
   quadMat.uniforms.uTexel.value=1/n;quadMat.uniforms.uSoft.value=Math.max(.8,n/768);
  },
  render(o){
   paintBackground(bgCtx,BG,o.a,o.b,o.pan,cloudPts);bgTex.needsUpdate=true;
   const sel=o.selected?segmentIds.indexOf(o.selected):-1;
   matThick.uniforms.uSel.value=sel;
   renderer.setClearColor(0x000000,0);
   renderer.setRenderTarget(rtThick);renderer.clear();
   if(hasTubes){
    placeCamera(o.a,o.b,o.pan);
    tubes.material=matThick;renderer.render(tubeScene,camera);
   }
   renderer.setRenderTarget(rtTint);renderer.clear();
   if(hasTubes&&o.color){tubes.material=matTint;renderer.render(tubeScene,camera);}
   renderer.setRenderTarget(null);
   quadMat.uniforms.uColor.value=o.color?1:0;
   quadMat.uniforms.uSeed.value=(Math.abs(o.a*.123+o.b*.0731)%1)*97+(Math.abs(o.pan[0]*3.1+o.pan[1]*1.7)%1)*13;
   renderer.render(quadScene,quadCamera);
  },
  dispose(){
   tubes.geometry.dispose();matThick.dispose();matTint.dispose();quadMat.dispose();quad.geometry.dispose();
   bgTex.dispose();rtThick.dispose();rtTint.dispose();renderer.dispose();
  },
 };
}

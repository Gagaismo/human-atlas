// Tests of the angiography core (app/angio/core): C-arm geometry, tree helpers, foreshortening / overlap metrics, angle
// pad, standard views, URL hash and cath-lab collisions. Plain node, exit code 1 on failure.
// Usage: node scripts/angio/test-core.mjs   (Node 22.18+, TypeScript is loaded through type stripping)
import * as mod from 'node:module';
mod.registerHooks(await import('../gyneco/ts-resolve.mjs'));
const G=await import('../../app/angio/core/geometry.ts');
const T=await import('../../app/angio/core/tree.ts');
const M=await import('../../app/angio/core/metrics.ts');
const P=await import('../../app/angio/core/pad.ts');
const V=await import('../../app/angio/core/views.ts');
const U=await import('../../app/angio/core/url.ts');
const R=await import('../../app/angio/core/room.ts');

let checks=0,failed=0;
const check=(ok,msg)=>{checks++;if(!ok){failed++;console.error('FALLA: '+msg);}};
const near=(x,y,tol=1e-6)=>Math.abs(x-y)<=tol;
const nearV=(p,q,tol=1e-6)=>p.length===q.length&&p.every((x,i)=>near(x,q[i],tol));

// --- Fixtures ---
const line=(p,q,n=20)=>Array.from({length:n},(_,i)=>p.map((x,k)=>x+(q[k]-x)*i/(n-1)));
const mkVessel=(id,points,o={})=>({id,name:id,short:id,system:o.system??'left',family:o.family??'da',parent:o.parent??null,parentArc:o.parentArc??null,
 points,radii:points.map(()=>o.r??1),segments:o.segments??[{id:o.segId??id+'-s',syntax:'',name:id,short:id,from:0,to:1}],source:'test',...(o.variant?{variant:o.variant}:{})});
const mkTree=vessels=>({meta:{units:'mm',frame:'test',dominance:'right',isocentre:'',source:'',license:'',generator:''},vessels,
 landmarks:{lmOstium:[0,0,0],rcaOstium:[0,0,0],apex:[0,0,0],crux:[0,0,0],aorticRootCentre:[0,0,0],lmBifurcation:[0,0,0]}});
const VIS_LEFT={system:'left',ramus:false,grafts:new Set()};

// --- S11 geometry ---
{
 const {d,u,v}=G.imageAxes(0,0);
 check(nearV(d,[0,0,1])&&nearV(u,[1,0,0])&&nearV(v,[0,1,0]),'AP: d=+Z, u=+X (paciente izquierda a la derecha), v=+Y (cabeza arriba)');
 const l=G.imageAxes(90,0);
 check(nearV(l.d,[1,0,0])&&nearV(l.u,[0,0,-1]),'OAI 90: detector a la izquierda del paciente, u=-Z');
 const pa=G.projectPoint([0,0,50],90,0);
 check(pa.x<-40,'OAI 90: un punto anterior queda a la izquierda de la pantalla');
 const ap=G.projectPoint([0,100,0],0,0),cr=G.projectPoint([0,100,0],0,30);
 check(cr.y<ap.y&&cr.y>0,'CRA 30: un punto superior sube menos que en AP');
 check(G.detectorDir(0,30)[1]>0,'CRA 30: el detector va hacia la cabeza (d.y>0)');
 check(G.detectorDir(0,-30)[1]<0,'CAU 30: d.y<0');
 check(G.detectorDir(-30,0)[0]<0,'OAD 30 (a=-30): d.x<0');
 check(G.detectorDir(30,0)[0]>0,'OAI 30: d.x>0');
 for(const [a,b] of [[0,0],[-30,-30],[45,-35],[90,45],[-90,20]]){
  const ax=G.imageAxes(a,b);const dot=(p,q)=>p[0]*q[0]+p[1]*q[1]+p[2]*q[2];
  const cx=[ax.u[1]*ax.v[2]-ax.u[2]*ax.v[1],ax.u[2]*ax.v[0]-ax.u[0]*ax.v[2],ax.u[0]*ax.v[1]-ax.u[1]*ax.v[0]];
  check(near(dot(ax.d,ax.u),0)&&near(dot(ax.d,ax.v),0)&&near(dot(ax.u,ax.v),0)&&nearV(cx,ax.d),`base ortonormal derecha en ${a}/${b}`);
 }
 check(G.SOD===750&&G.SID===1100&&G.DETECTOR_SIZE===250,'constantes SOD/SID/detector');
 check(G.projectPoint([10,0,-100],0,0).x>G.projectPoint([10,0,100],0,0).x,'ampliación cónica: más cerca de la fuente, más grande');
 const n=G.projectNorm([G.DETECTOR_SIZE/2/(G.SID/G.SOD),0,0],0,0);
 check(near(n[0],1,1e-9)&&near(n[1],0),'normalizado [-1,1]: el borde del detector vale 1');
 // campo mostrado (FOV): FIELD_SIZE < DETECTOR_SIZE y fieldOffset deja el punto en el centro del campo en cualquier ángulo
 check(G.FIELD_SIZE>0&&G.FIELD_SIZE<G.DETECTOR_SIZE,'FIELD_SIZE: campo mostrado menor que el detector');
 for(const [a,b] of [[0,0],[-15,-27],[45,-35],[-90,45]]){
  const ax=G.imageAxes(a,b),ctr=[30,-5,10],o=G.fieldOffset(ax,ctr),q=G.projectWith(ax,ctr);
  check(near(q.x/(G.FIELD_SIZE/2)+o[0],0,1e-9)&&near(q.y/(G.FIELD_SIZE/2)+o[1],0,1e-9),`fieldOffset centra el punto en ${a}/${b}`);
 }
 check(nearV(G.fieldOffset(G.imageAxes(0,0),[0,0,0]),[0,0]),'fieldOffset del isocentro es 0');
 // campo fijo centrado en el corazón (S19): sin centro explícito, fieldOffset usa HEART_CENTRE, el mismo para cualquier sistema inyectado
 for(const [a,b] of [[0,0],[40,-2],[-15,-27]]){
  const ax=G.imageAxes(a,b),o=G.fieldOffset(ax),q=G.projectWith(ax,G.HEART_CENTRE);
  check(nearV(o,G.fieldOffset(ax,G.HEART_CENTRE))&&near(q.x/(G.FIELD_SIZE/2)+o[0],0,1e-9)&&near(q.y/(G.FIELD_SIZE/2)+o[1],0,1e-9),`campo fijo centrado en el corazón en ${a}/${b}`);
 }
 check(G.HEART_CENTRE.every(x=>Math.abs(x)<40)&&G.FIELD_SIZE>150&&G.FIELD_SIZE<G.DETECTOR_SIZE,'HEART_CENTRE cerca del isocentro, campo de 15–25 cm');
 const c=G.clampAngles(200,-99);check(c.a===90&&c.b===-45,'clampAngles');
 check(G.fmtAngles(0,0)==='AP','fmt AP');check(G.fmtAngles(-30,-30)==='OAD 30 CAU 30','fmt OAD CAU');
 check(G.fmtAngles(45,-35)==='OAI 45 CAU 35','fmt OAI CAU');check(G.fmtAngles(0,30)==='AP CRA 30','fmt AP CRA');
 check(G.fmtAngles(90,0)==='OAI 90','fmt OAI 90');check(G.fmtAngles(-30,0)==='OAD 30','fmt OAD');
 check(G.fmtRotation(-30)==='OAD 30°'&&G.fmtRotation(45)==='OAI 45°'&&G.fmtRotation(0)==='AP 0°','fmtRotation');
 check(G.fmtAngulation(-30)==='CAU 30°'&&G.fmtAngulation(30)==='CRA 30°'&&G.fmtAngulation(0)==='0°','fmtAngulation');
}

// --- tree helpers ---
{
 const pts=line([0,0,0],[100,0,0],11);
 const arcs=T.arcLengths(pts);
 check(near(arcs[10],100)&&near(T.polylineLength(pts),100),'longitud de arco');
 const q=T.pointAtArc(pts,pts.map((_,i)=>1+i*0.1),0.5);
 check(nearV(q.p,[50,0,0])&&near(q.r,1.5),'punto y radio a la fracción 0.5');
 const rs=T.resample(pts,pts.map(()=>1),25);
 check(rs.points.length===5&&near(rs.arcs[4],100)&&near(rs.arcs[1],25),'resample cada 25 mm incluye el extremo');
 const v=mkVessel('v',pts,{segments:[{id:'a',syntax:'',name:'',short:'',from:0,to:0.5},{id:'b',syntax:'',name:'',short:'',from:0.5,to:1}]});
 const sub=T.segmentPolyline(v,v.segments[0]);
 check(nearV(sub.points[0],[0,0,0])&&nearV(sub.points[sub.points.length-1],[50,0,0]),'sub-polilínea del segmento por fracciones');
 const vi=mkVessel('vi',pts,{segments:[{id:'a',syntax:'',name:'',short:'',from:2,to:6}]});
 const subi=T.segmentPolyline(vi,vi.segments[0]);
 check(nearV(subi.points[0],[20,0,0])&&nearV(subi.points[subi.points.length-1],[60,0,0]),'from/to > 1 se leen como índices de punto');
 const tree=mkTree([mkVessel('l1',pts,{system:'left'}),mkVessel('r1',pts,{system:'right',family:'cd'}),
  mkVessel('ri',pts,{system:'left',family:'ri',variant:'ramus'}),mkVessel('lima',pts,{system:'graft',family:'graft',segId:'lima'}),mkVessel('g2',pts,{system:'graft',family:'graft',segId:'svg-om'})]);
 const ids=vis=>T.visibleVessels(tree,vis).map(x=>x.id).join(',');
 check(ids({system:'left',ramus:false,grafts:new Set()})==='l1','visible: izquierda sin ramo');
 check(ids({system:'left',ramus:true,grafts:new Set()})==='l1,ri','visible: izquierda con ramo intermedio');
 check(ids({system:'right',ramus:true,grafts:new Set()})==='r1','visible: derecha');
 check(ids({system:'both',ramus:false,grafts:new Set()})==='l1,r1','visible: ambas');
 check(ids({system:'right',ramus:false,grafts:new Set(['lima','svg-om'])})==='r1,lima,g2','visible: puentes activados');
 check(T.findSegment(tree,'lima')?.vessel.id==='lima'&&T.findSegment(tree,'nada')===null,'findSegment');
 check(T.familyColorKey(tree.vessels[1])==='cd','clave de color por familia');
}

// --- metrics ---
{
 const fs=(p,q,a,b)=>M.foreshorteningOfPolyline(line(p,q,30),a,b);
 check(near(fs([-30,0,0],[30,0,0],0,0),0,1e-6),'acortamiento ≈0 en el plano del detector');
 check(near(fs([0,0,-30],[0,0,30],0,0),1,1e-6),'acortamiento 1 a lo largo de d');
 check(fs([5,0,-30],[5,0,30],0,0)>0.95,'acortamiento ≈1 casi a lo largo de d (con perspectiva)');
 check(near(fs([-30,0,0],[30,0,0],-45,0),1-Math.cos(Math.PI/4),1e-3),'acortamiento 45° ≈ 0.293');
 const A=mkVessel('A',line([0,0,0],[40,0,0],40),{r:1}),far=mkVessel('B',line([0,60,0],[40,60,0],40),{r:1});
 const cross=mkVessel('C',line([20,-20,0],[20,20,0],40),{r:1});
 const ov=(vs,seg,a,b,win)=>M.segmentMetrics(mkTree(vs),VIS_LEFT,seg,a,b,win===undefined?{}:{junctionWindow:win});
 check(ov([A,far],'A-s',0,0).overlap===0,'superposición 0 con vasos lejanos');
 check(ov([A,cross],'A-s',0,0).overlap>0.02,'superposición >0 con vasos que se cruzan');
 const par=mkVessel('P',line([0,0,0],[40,0,0],40),{r:1});
 const child=mkVessel('K',line([20,0,0],[20,30,0],30),{r:1,parent:'P',parentArc:20});
 check(ov([par,child],'P-s',0,0).overlap===0,'superposición excluida en la unión padre-hijo');
 check(ov([par,child],'P-s',0,0,0).overlap>0,'sin ventana de unión sí cuenta (control)');
 check(ov([par,child],'K-s',0,0).overlap===0,'excluida también medida desde el hijo');
 const sib=mkVessel('S',line([20,0,0],[20,-30,0],30),{r:1,parent:'P',parentArc:20});
 check(ov([par,child,sib],'K-s',0,0).overlap===0,'hermanos que nacen del mismo punto no se cuentan en el origen');
 const behind=mkVessel('D',line([20,-20,-200],[20,20,-200],40),{r:1});
 check(ov([A,behind],'A-s',0,0).overlap>0.02,'superposición sin importar la profundidad');
 check(ov([A,behind],'A-s',90,0).overlap===0,'otra proyección separa los vasos');
 const m=ov([A,cross],'A-s',0,0);check(near(m.combined,(1-m.foreshortening)*(1-m.overlap),1e-9),'combinado = (1-acort)(1-sup)');
 check(M.segmentMetrics(mkTree([A]),{system:'right',ramus:false,grafts:new Set()},'A-s',0,0)===null,'segmento no visible → null');
}

// --- pad + bestView ---
{
 const pad=P.createPad(3);
 check(pad.na===61&&pad.nb===31&&pad.foreshortening.length===61*31,'rejilla 61×31 a 3°');
 check(P.padIndex(pad,-90,-45)===0&&P.padIndex(pad,90,45)===61*31-1,'índices de la rejilla');
 const A=mkVessel('T',line([0,0,0],[30,0,30],40),{r:1}),O=mkVessel('O',line([0,80,0],[30,80,0],30),{r:1});
 const best=P.bestView(mkTree([A,O]),'T-s',VIS_LEFT);
 check(best&&best.a===-45&&best.b===0&&best.foreshortening<0.01&&best.overlap===0,'bestView elige OAD 45 donde el vaso se ve largo y limpio');
 const T2=mkVessel('T2',line([0,0,0],[30,0,0],40),{r:1}),O2=mkVessel('O2',line([15,10,-20],[15,10,20],40),{r:1});
 const tr2=mkTree([T2,O2]);const b2=P.bestView(tr2,'T2-s',VIS_LEFT);
 check(b2&&b2.overlap===0&&b2.foreshortening<0.02&&Math.abs(b2.a)<=3,'bestView en fixture de 2 vasos: largo y limpio');
 const prep=M.prepareTree(tr2,VIS_LEFT),tg=M.prepareTarget(prep,'T2-s');
 const full=P.computePad(prep,tg,3);
 check(full.overlap[P.padIndex(full,0,45)]>0&&full.overlap[P.padIndex(full,0,0)]===0,'el mapa de superposición marca el ángulo que cruza');
 const part=P.createPad(3);P.computePadRows(prep,tg,part,0,10);P.computePadRows(prep,tg,part,10,31);
 check(part.combined.every((x,i)=>x===full.combined[i]),'cálculo por bloques = cálculo completo');
 check(full.combined instanceof Float32Array,'Float32Array transferibles');
}

// --- 3,000-sample tree timing ---
{
 const vs=[];
 for(let k=0;k<10;k++){const pts=[];for(let i=0;i<=450;i++){const t=i*1.5;pts.push([40*Math.cos(t/60+k)+k*6-30,t/6-25+k*3,40*Math.sin(t/60+k*1.3)]);}vs.push(mkVessel('v'+k,pts,{r:1.2}));}
 const tr=mkTree(vs);const prep=M.prepareTree(tr,VIS_LEFT,1.5);
 const t0=performance.now();const tg=M.prepareTarget(prep,'v3-s');const pad=P.computePad(prep,tg,3);const dt=performance.now()-t0;
 console.log(`métricas: ${prep.count} muestras, ${tg.count} del segmento, rejilla ${pad.na}×${pad.nb} en ${dt.toFixed(0)} ms`);
 check(prep.count>=2900&&prep.count<=3600,`árbol de ~3000 muestras (${prep.count})`);
 check(dt<3000,`pad completo del segmento rápido (${dt.toFixed(0)} ms)`);
 check(Math.max(...pad.overlap)>Math.min(...pad.overlap),'overlap del árbol sintético con variación');
}

// --- standard views ---
{
 check(V.STANDARD_VIEWS.length===13,'13 vistas estándar');
 const left=V.STANDARD_VIEWS.filter(v=>v.group==='izquierda'),right=V.STANDARD_VIEWS.filter(v=>v.group==='derecha');
 check(left.length===8&&right.length===5,'8 izquierda + 5 derecha');
 check(V.STANDARD_VIEWS.every(v=>v.aValidar===true&&v.description.length>20&&v.sources.length>0&&v.padLabel&&v.name),'campos completos y aValidar');
 for(const v of V.STANDARD_VIEWS){
  const w=v.window;
  check(v.a>=w.aMin&&v.a<=w.aMax&&v.b>=w.bMin&&v.b<=w.bMax,`${v.id} dentro de su ventana`);
  check(R.collision(v.a,v.b)===null,`${v.id} sin colisión`);
  check(V.viewById(v.id)===v,`viewById ${v.id}`);
 }
 const spider=V.viewById('arana');check(spider.a===45&&spider.b===-35&&spider.name==='Araña'&&spider.padLabel==='Araña','Araña OAI 45 CAU 35');
 check(V.viewById('oad-caudal').a===-30&&V.viewById('oad-caudal').b===-30,'OAD caudal');
 check(V.viewById('lateral').a===90&&V.viewById('cd-oai').a===50&&V.viewById('cd-oad').a===-30,'lateral, CD OAI, CD OAD');
 check(V.viewAt(45,-35,'izquierda')?.id==='arana'&&V.viewAt(1,1)===null,'viewAt');
}

// --- URL ---
{
 const L1=U.parseHash('#angiografia&a=-30&b=-30&sys=left&sel=lad-mid');
 check(L1.a===-30&&L1.b===-30&&L1.sys==='left'&&L1.sel==='lad-mid'&&L1.dom==='right'&&L1.ri===false&&L1.g.length===0,'parse del ejemplo L1');
 check(U.parseHash('#angiografia?a=10&b=5').a===10,'acepta #angiografia?a=…');
 const cl=U.parseHash('#angiografia&a=200&b=-99');check(cl.a===90&&cl.b===-45,'clamp a=200→90, b=-99→-45');
 check(U.parseHash('#angiografia&a=12.6&b=x').a===13&&U.parseHash('#angiografia&a=12.6&b=x').b===0,'redondeo y valor no numérico → 0');
 check(U.parseHash('#angiografia&sys=foo').sys==='left','sys inválido → left');
 check(U.parseHash('#angiografia&sel=lad%20mid').sel===null&&U.parseHash('#angiografia&sel=LAD').sel===null&&U.parseHash('#angiografia&sel=').sel===null,'sel inválido → null');
 const d=U.parseHash('#angiografia');check(d.a===0&&d.b===0&&d.sys==='left'&&d.sel===null&&d.dom==='right'&&d.ri===false,'defaults');
 check(U.serializeHash(U.DEFAULT_STATE)==='#angiografia','serialize por defecto = solo el prefijo');
 check(U.serializeHash(L1)==='#angiografia&a=-30&b=-30&sel=lad-mid','serialize omite defaults (sys=left)');
 const full={a:45,b:-35,sys:'both',sel:'rca-mid',dom:'left',ri:true,g:['svg-pda','lima']};
 const s=U.serializeHash(full);
 check(s==='#angiografia&a=45&b=-35&sys=both&sel=rca-mid&dom=left&ri=1&g=lima,svg-pda','serialize completo y estable: '+s);
 const back=U.parseHash(s);check(JSON.stringify(back)===JSON.stringify({...full,g:['lima','svg-pda']}),'ida y vuelta');
 check(U.serializeHash(back)===s,'serialize(parse(serialize)) estable');
 check(U.parseHash('#angiografia&g=lima,foo,lima,svg-om').g.join()==='lima,svg-om','g filtra y deduplica');
 check(U.parseHash('#angiografia&dom=co').dom==='co'&&U.parseHash('#angiografia&dom=zz').dom==='right','dom');
 check(U.isAngioHash('#angiografia&a=1')&&U.isAngioHash('#angiografia')&&!U.isAngioHash('#cinesiologia'),'isAngioHash');
 check(U.serializeHash({a:300,b:-300,sys:'left',sel:null,dom:'right',ri:false,g:[]})==='#angiografia&a=90&b=-45','serialize aplica clamp');
}

// --- room ---
{
 const c1=R.collision(0,45),c2=R.collision(90,-45);
 check(c1!==null&&/^El detector tocaría /.test(c1.message),'AP CRA 45 toca la cabeza: '+JSON.stringify(c1));
 check(c2!==null&&/^El detector tocaría /.test(c2.message),'OAI 90 CAU 45 toca el brazo: '+JSON.stringify(c2));
 check(c1?.part==='cabeza'&&c1.message===R.COLLISION_MESSAGES.cabeza&&c2?.part==='brazo','partes: cabeza y brazo');
 check(R.collision(0,0)===null&&R.collision(0,-45)===null,'AP y AP caudal seguros');
 const msgs={cabeza:'El detector tocaría la cabeza del paciente',cuello:'El detector tocaría el cuello del paciente',brazo:'El detector tocaría el brazo del paciente',piernas:'El detector tocaría las piernas del paciente',pies:'El detector tocaría los pies del paciente',torso:'El detector tocaría el tórax del paciente'};
 check(Object.entries(msgs).every(([k,v])=>R.COLLISION_MESSAGES[k]===v),'mensajes en español');
 const hit=R.clampToSafe({a:0,b:0},{a:0,b:45});
 check(hit.hit!==null&&R.collision(hit.a,hit.b)===null&&hit.b<45&&hit.b>=40,'clampToSafe frena antes de la colisión');
 const further=R.collision(hit.a,hit.b+0.5);
 check(further!==null,'un paso más allá de clampToSafe ya colisiona');
 const ok=R.clampToSafe({a:0,b:0},{a:-30,b:-30});check(ok.hit===null&&ok.a===-30&&ok.b===-30,'trayecto seguro llega al destino');
 check(R.DETECTOR_HOUSING.size===250&&R.DETECTOR_HOUSING.thickness>=100&&R.TABLE.top<0,'constantes de la sala');
}

console.log(`${checks-failed}/${checks} comprobaciones correctas${failed?`, ${failed} fallan`:''}`);
process.exit(failed?1:0);

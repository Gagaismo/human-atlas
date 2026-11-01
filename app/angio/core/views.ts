// Standard coronary-angiography views (S8). Names, abbreviations and one-line descriptions are our own Spanish text,
// written from the cited literature and flagged `aValidar` until a teacher reviews them.
// `a` = rotation (negative OAD, positive OAI), `b` = angulation (negative CAU, positive CRA); windows are in the same signs.
// Windows come from the literature where it gives a range (see each `sources`); where it gives only a point angle
// (CAU 30 of the AP caudal, the OAI/OAD views of the right artery, AP) the window is our own ± tolerance, marked
// `windowIsTolerance: true`, so the pad outline has a visible size.
export interface ViewWindow{aMin:number;aMax:number;bMin:number;bMax:number}
export interface StandardView{
 id:string;group:'izquierda'|'derecha';name:string;
 /** Short label for the angle pad. */
 padLabel:string;a:number;b:number;window:ViewWindow;
 /** Extra accepted window (for example the shallow OAD of the OAD caudal). */
 altWindow?:ViewWindow;windowIsTolerance:boolean;
 description:string;sources:string[];aValidar:true}

const KOCKA='Kočka V et al., JACC Cardiovasc Interv 2020;13:2560–2570';
const TU='Tu S et al., Int J Cardiovasc Imaging 2012;28:1617';
const DODGE='Dodge JT Jr et al., Circulation 1988;78:1167–1180';

export const STANDARD_VIEWS:readonly StandardView[]=[
 {id:'arana',group:'izquierda',name:'Araña',padLabel:'Araña',a:45,b:-35,window:{aMin:30,aMax:50,bMin:-40,bMax:-25},windowIsTolerance:false,
  description:'Abre la bifurcación del tronco común izquierdo: separa la DA de la Cx y muestra la Cx proximal y el origen de las obtusas marginales.',
  sources:[KOCKA,TU],aValidar:true},
 {id:'oad-caudal',group:'izquierda',name:'OAD caudal',padLabel:'OAD caud',a:-30,b:-30,window:{aMin:-40,aMax:-30,bMin:-40,bMax:-30},
  altWindow:{aMin:-20,aMax:-10,bMin:-40,bMax:-30},windowIsTolerance:false,
  description:'Despliega la Cx media y distal con las obtusas marginales; también muestra el tronco común y la DA proximal hacia arriba.',
  sources:[KOCKA,TU],aValidar:true},
 {id:'ap-caudal',group:'izquierda',name:'AP caudal',padLabel:'AP caud',a:-10,b:-30,window:{aMin:-15,aMax:0,bMin:-35,bMax:-25},windowIsTolerance:true,
  description:'Alarga el tronco común y la Cx proximal, con la DA proximal en escorzo; útil para lesiones del tronco.',
  sources:[KOCKA,TU],aValidar:true},
 {id:'ap-craneal',group:'izquierda',name:'AP craneal',padLabel:'AP cran',a:-10,b:40,window:{aMin:-10,aMax:0,bMin:35,bMax:45},windowIsTolerance:false,
  description:'Muestra la DA media y distal y el origen de las diagonales, con poca superposición de la Cx.',
  sources:[KOCKA,TU],aValidar:true},
 {id:'oai-craneal',group:'izquierda',name:'OAI craneal',padLabel:'OAI cran',a:40,b:35,window:{aMin:30,aMax:45,bMin:25,bMax:35},windowIsTolerance:false,
  description:'Separa la DA proximal y media de las diagonales y de los septales; buena vista del ostium de la DA.',
  sources:[KOCKA,TU],aValidar:true},
 {id:'oad-craneal',group:'izquierda',name:'OAD craneal',padLabel:'OAD cran',a:-30,b:30,window:{aMin:-30,aMax:-20,bMin:25,bMax:35},windowIsTolerance:false,
  description:'Muestra la DA media y distal y las diagonales sin superposición del tronco; completa el estudio de la DA.',
  sources:[KOCKA,TU],aValidar:true},
 {id:'lateral',group:'izquierda',name:'Lateral',padLabel:'Lat',a:90,b:0,window:{aMin:80,aMax:90,bMin:-30,bMax:30},windowIsTolerance:false,
  description:'Perfil del corazón: la DA media y distal con su relación con la pared anterior y los puentes a la DA.',
  sources:[KOCKA,DODGE],aValidar:true},
 {id:'ap',group:'izquierda',name:'AP',padLabel:'AP',a:0,b:0,window:{aMin:-5,aMax:5,bMin:-5,bMax:5},windowIsTolerance:true,
  description:'Vista frontal de partida: visión general del árbol izquierdo, con superposición de la DA y la Cx.',
  sources:[DODGE],aValidar:true},
 {id:'cd-oai',group:'derecha',name:'OAI',padLabel:'OAI',a:50,b:0,window:{aMin:40,aMax:60,bMin:-10,bMax:10},windowIsTolerance:true,
  description:'Muestra la CD en su recorrido por el surco auriculoventricular, con el segmento medio y el origen de la DP y la PL.',
  sources:[DODGE,TU],aValidar:true},
 {id:'cd-oad',group:'derecha',name:'OAD',padLabel:'OAD',a:-30,b:0,window:{aMin:-45,aMax:-30,bMin:-10,bMax:10},windowIsTolerance:true,
  description:'Muestra la CD proximal y media y la DP en su trayecto sobre el tabique interventricular.',
  sources:[DODGE,TU],aValidar:true},
 {id:'cd-ap',group:'derecha',name:'AP',padLabel:'AP',a:0,b:0,window:{aMin:-5,aMax:5,bMin:-5,bMax:5},windowIsTolerance:true,
  description:'Vista frontal de la CD, útil para ver el ostium y comparar su recorrido con la silueta del corazón.',
  sources:[DODGE],aValidar:true},
 {id:'cd-ap-craneal',group:'derecha',name:'AP craneal',padLabel:'AP cran',a:0,b:30,window:{aMin:-5,aMax:5,bMin:25,bMax:40},windowIsTolerance:false,
  description:'Abre la CD distal y la bifurcación en DP y PL, separando sus ramas de la cruz del corazón.',
  sources:[KOCKA,TU],aValidar:true},
 {id:'cd-oai-craneal',group:'derecha',name:'OAI craneal',padLabel:'OAI cran',a:40,b:30,window:{aMin:30,aMax:50,bMin:20,bMax:40},windowIsTolerance:true,
  description:'Despliega la bifurcación distal de la CD en DP y PL y las ramas posterolaterales.',
  sources:[KOCKA,TU],aValidar:true},
];

export function viewById(id:string):StandardView|null{return STANDARD_VIEWS.find(v=>v.id===id)??null}

export const inWindow=(w:ViewWindow,a:number,b:number)=>a>=w.aMin&&a<=w.aMax&&b>=w.bMin&&b<=w.bMax;

/** Standard view whose exact angles are (a, b) (optionally within one group); null otherwise. */
export function viewAt(a:number,b:number,group?:StandardView['group']):StandardView|null{
 return STANDARD_VIEWS.find(v=>(!group||v.group===group)&&v.a===a&&v.b===b)??null;
}
/** Standard views whose accepted window contains (a, b). */
export function viewsContaining(a:number,b:number,group?:StandardView['group']):StandardView[]{
 return STANDARD_VIEWS.filter(v=>(!group||v.group===group)&&(inWindow(v.window,a,b)||(v.altWindow!==undefined&&inWindow(v.altWindow,a,b))));
}

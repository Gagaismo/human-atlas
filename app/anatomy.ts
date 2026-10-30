export type SystemId = 'skeletal'|'muscular'|'arterial'|'venous'|'nervous'|'digestive'|'respiratory'|'urinary'|'reproductive'|'lymphatic'|'endocrine'|'integumentary'|'connective'|'sensory'|'cardiac';
export const SYSTEMS: {id:SystemId;name:string;color:string;description:string}[] = [
 {id:'skeletal',name:'Esqueleto',color:'#e2d9ba',description:'Los huesos forman el armazón del cuerpo, protegen los órganos y dan inserción a los músculos. Su tejido interno almacena minerales y produce células sanguíneas.'},
 {id:'muscular',name:'Músculos',color:'#a85b50',description:'Los músculos esqueléticos producen el movimiento al traccionar de sus inserciones. Junto con los tendones mueven las articulaciones, estabilizan la postura y generan calor.'},
 {id:'cardiac',name:'Corazón',color:'#b96760',description:'El corazón es una bomba muscular de cuatro cavidades. Sus válvulas dirigen la sangre hacia adelante por la circulación pulmonar y la sistémica.'},
 {id:'sensory',name:'Órganos de los sentidos',color:'#b0c8ce',description:'Estas estructuras participan en los sentidos especiales, como la vista, la audición y el equilibrio. Sus tejidos especializados detectan estímulos y trabajan con el sistema nervioso para transmitir la información.'},
 {id:'arterial',name:'Arterias',color:'#c05245',description:'El corazón impulsa la sangre por la circulación. Las arterias la alejan del corazón para irrigar los tejidos o, en el circuito pulmonar, para llevarla a los pulmones.'},
 {id:'venous',name:'Venas',color:'#527c9f',description:'Las venas devuelven la sangre al corazón. Las redes superficial y profunda recogen la sangre de los tejidos; las venas pulmonares traen la sangre oxigenada desde los pulmones.'},
 {id:'nervous',name:'Sistema nervioso',color:'#d8b565',description:'El encéfalo, la médula espinal y los nervios periféricos conducen y procesan señales. Sostienen la sensibilidad, el movimiento, la coordinación y la regulación automática de las funciones del cuerpo.'},
 {id:'respiratory',name:'Respiratorio',color:'#b98991',description:'Las vías aéreas conducen el aire hasta los pulmones, donde el oxígeno y el dióxido de carbono pasan entre el aire y la sangre. La respiración depende de los cambios de presión que producen los músculos respiratorios.'},
 {id:'digestive',name:'Digestivo',color:'#b8916b',description:'El tubo digestivo degrada los alimentos, absorbe nutrientes y agua y hace avanzar los desechos. Los órganos anexos aportan bilis y enzimas digestivas.'},
 {id:'urinary',name:'Urinario',color:'#b47961',description:'Los riñones filtran la sangre y regulan el equilibrio de líquidos, electrolitos y ácido-base. La orina baja por los uréteres hasta la vejiga y sale por la uretra.'},
 {id:'lymphatic',name:'Linfático',color:'#879f7c',description:'Los vasos linfáticos devuelven a la circulación el exceso de líquido de los tejidos. Los ganglios linfáticos y otros órganos linfoides sostienen la vigilancia y la respuesta inmunitaria.'},
 {id:'endocrine',name:'Endocrino',color:'#c5a09a',description:'Los órganos endocrinos liberan hormonas a la sangre para coordinar procesos como el metabolismo, el crecimiento, la respuesta al estrés y la reproducción.'},
 {id:'reproductive',name:'Reproductor',color:'#bda098',description:'Las estructuras reproductoras masculinas representadas aquí participan en la producción, maduración y transporte de los espermatozoides y en la producción de hormonas sexuales.'},
 {id:'integumentary',name:'Superficie corporal',color:'#ba9b7d',description:'La superficie corporal da una referencia anatómica externa. El sistema tegumentario forma una barrera protectora y participa en la sensibilidad y la regulación de la temperatura.'},
 {id:'connective',name:'Tejido conectivo',color:'#aec3bb',description:'El cartílago, los ligamentos y otros tejidos conectivos sostienen, unen y separan estructuras. Entre sus funciones están estabilizar las articulaciones y repartir las cargas mecánicas.'},
];
export interface Part {id:string;name:string;nameEn?:string;conceptId:string;system:SystemId;chunk:number;positions:number;normals:number;indices:number;vertexCount:number;indexCount:number;bounds:[number[],number[]]}
export interface Concept {id:string;name:string;nameEn?:string;elements:string[]}
export interface Atlas {version:string;sex?:'male';source?:string;scope?:string;parts:Part[];concepts:Concept[];chunks:{url:string;bytes:number;gzip?:string;gzipBytes?:number}[];triangles:number}
export type View = 'three-quarter'|'front'|'back'|'side';
export interface SceneState {inspectorOpen?:boolean;explode:number;visible:SystemId[];selected:string[];isolate:boolean;view:View;rotate:boolean;reset:number}
export const DEFAULT_VISIBLE:SystemId[] = ['cardiac','sensory','skeletal','muscular','arterial','venous','nervous','respiratory','digestive','urinary','lymphatic','endocrine','reproductive','connective'];
/** Short Spanish explanations of major organs, keyed by the lowercase English source name. */
export const EXPLANATIONS:Record<string,string> = {
 'heart':'Bomba muscular en el tórax. Su lado derecho envía la sangre a los pulmones y su lado izquierdo la impulsa por la circulación sistémica.',
 'liver':'Órgano voluminoso debajo del lado derecho del diafragma. Procesa los nutrientes absorbidos, produce bilis y sintetiza muchas de las proteínas de la sangre.',
 'brain':'Órgano central del sistema nervioso. Sus regiones interconectadas sostienen la percepción, el movimiento, la memoria, el lenguaje y la regulación de las funciones del cuerpo.',
 'stomach':'Cavidad muscular entre el esófago y el intestino delgado. Almacena el alimento y lo mezcla con ácido y enzimas antes de pasarlo al duodeno.',
 'spleen':'Órgano linfoide del abdomen superior izquierdo. Filtra la sangre, elimina las células sanguíneas envejecidas y participa en la respuesta inmunitaria.',
 'pancreas':'Órgano abdominal con funciones digestivas y endocrinas. Aporta enzimas al intestino delgado y libera hormonas como la insulina y el glucagón.',
 'urinary bladder':'Reservorio muscular de la pelvis que almacena la orina que llega desde los riñones por los uréteres.',
 'trachea':'Vía aérea principal que une la laringe con los bronquios. Sus anillos cartilaginosos la mantienen abierta durante la respiración.',
 'diaphragm':'Músculo ancho que separa el tórax del abdomen. Al contraerse aumenta el volumen del tórax y ayuda a que entre el aire a los pulmones.',
};
export function explanation(name:string,system:SystemId){return EXPLANATIONS[name.toLowerCase()] ?? SYSTEMS.find(s=>s.id===system)?.description ?? '';}

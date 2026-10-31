// Spanish content of the gynecology area. Text copied from the Octubre Rosa leaflet stays verbatim, including its
// spelling (scripts/gyneco/validate.mjs checks it against docs/research/folleto-octubre-rosa.md).

export type SectionId='autoexamen'|'signos'|'controles'|'mitos'|'mamografia'|'anatomia';
export interface Source {label:string;url?:string}
export interface Myth {claim:string;verdict:'Falso';why:string}
export interface Section {
 id:SectionId;
 /** Name in the section list. */
 label:string;
 title:string;
 lead?:string;
 intro?:string;
 items?:string[];
 myths?:Myth[];
 /** Highlighted sentence. */
 callout?:string;
 note?:string;
 sources:Source[];
 /** Authored text stays false until a teacher reviews it. */
 validated:false;
}

export const LEAFLET_CREDIT='Folleto Octubre Rosa — IFMSA Tucumán (SCOPH) y Secretaría de Asuntos Estudiantiles UTN Tucumán, 2026';
const LEAFLET:Source={label:LEAFLET_CREDIT};
const HRA:Source={label:'Human Reference Atlas (HuBMAP), Visible Human femenino — CC BY 4.0',url:'https://lod.humanatlas.io/ref-organ'};

/** Researched sources per section: adding one is one line here, e.g. autoexamen:[{label:'…',url:'…'}]. */
export const EXTRA_SOURCES:Partial<Record<SectionId,Source[]>>={};

export const CENTERS=[
 'Instituto de Maternidad y Ginecología Sra. de las Mercedes',
 'Hospital Nicolás Avellaneda',
 'Hospital Centro de Salud Zenon Santillán',
 'Hospital Regional de Concepción',
 'Policlínica Banda del Rio Salí',
 'Policlínica Pedro Solórzano de Tafí Viejo',
 'Hospital de Aguilares',
 'Hospital Regional de Monteros',
 'Hospital de Tafí del Valle',
 'Centro Medico Ramon Carrillo, Yerba Buena',
 'CAM Parque Independencia de las Talitas',
 'Policlínica Alderetes',
 'Trailer de la Mujer (Mamógrafo Móvil)',
];

const sources=(id:SectionId,base:Source[]=[LEAFLET])=>[...base,...(EXTRA_SOURCES[id]??[])];

export const SECTIONS:Section[]=[
 {
  id:'autoexamen',label:'Autoexamen',title:'Conocé tus mamas',lead:'¡Tocate!',
  intro:'Una de las mejores herramientas de prevencion es el autoexamen',
  items:[
   'Usá las yemas de tus dedos y palpa toda la mama o área pectoral con movimientos circulares, aplicando presión suave, media y firme.',
   'Hazlo en posición acostada y de pie para detectar cualquier cambio o bulto.',
   'Realiza la palpación una vez al mes. Si tienes ciclo menstrual, hazlo después de tu período; si no tienes ciclo, elige un día fijo al mes para realizarlo.',
  ],
  note:'Recuerda: El cáncer de mama también afecta a los hombres. ¡La autoexploración es para todos!',
  callout:'El autoexamen ayuda a conocer tus mamas, pero no reemplaza el examen clínico ni la mamografía.',
  sources:sources('autoexamen'),validated:false,
 },
 {
  id:'signos',label:'Signos y síntomas',title:'Signos y síntomas',
  intro:'Si presentas uno o mas de estos debes acudir al medico de inmediato',
  items:['Bulto o zona endurecida','Retraccion o cambios en el pezon','Enrojecimiento, calor o dolor localizado','Cambios en el tamaño, forma o contorno','Secreciones','Cambios en la piel','Hundimiento','Erupción'],
  callout:'UN HALLAZGO NO SIGNIFICA NECESARIAMENTE CANCER, PERO TODO CAMBIO NECESITA SER EVALUADO',
  sources:sources('signos'),validated:false,
 },
 {
  id:'controles',label:'Controles',title:'¿Cuándo debo realizarme los controles?',
  items:[
   'Autoexamen mamario: una vez al mes, a partir de los 20 años. Si menstruás, hacelo entre 2 y 5 días después de terminar el sangrado; si no menstruás, elegí un día fijo cada mes.',
   'Examen clínico mamario: al menos una vez al año desde los 20 años, realizado por un profesional de salud.',
   'Mamografía de control: mujeres de 50 a 69 años sin antecedentes personales ni familiares de cáncer de mama, cada 1 o 2 años, junto con el examen clínico.',
   'Antes de los 50 años o después de los 69: Segun recomendacion del equipo de salud.',
  ],
  callout:'El autoexamen ayuda a conocer tus mamas, pero no reemplaza el examen clínico ni la mamografía.',
  sources:sources('controles'),validated:false,
 },
 {
  id:'mitos',label:'Mitos y verdades',title:'Mitos y verdades',
  myths:[
   {claim:'Si no hay casos en mi familia, no puedo tener cáncer de mama.',verdict:'Falso',why:'La mayoría de las personas diagnosticadas no tiene antecedentes familiares.'},
   {claim:'Los hombres no pueden tener cáncer de mama.',verdict:'Falso',why:'Aunque es mucho menos frecuente, los hombres también pueden desarrollarlo.'},
   {claim:'Si un bulto duele, no es cáncer.',verdict:'Falso',why:'El dolor no descarta cáncer; muchos tumores iniciales no duelen. Todo bulto nuevo debe ser evaluado.'},
   {claim:'El cáncer de mama siempre se cura o siempre es mortal.',verdict:'Falso',why:'Es un grupo de enfermedades distintas cada caso requiere evaluación individual.'},
  ],
  sources:sources('mitos'),validated:false,
 },
 {
  id:'mamografia',label:'Mamografía gratuita en Tucumán',title:'Centros donde podés hacerte una mamografía gratuita',
  items:CENTERS,callout:'LA DETECCION TEMPRANA SALVA VIDAS',
  sources:sources('mamografia'),validated:false,
 },
 {
  id:'anatomia',label:'Anatomía',title:'Anatomía',
  intro:'Tocá una estructura del modelo para ver su descripción: tejido adiposo, lobulillos y conductos de la mama; útero, trompas y ovarios; vejiga y pelvis ósea.',
  sources:sources('anatomia',[HRA]),validated:false,
 },
];

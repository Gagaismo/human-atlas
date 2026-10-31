// Spanish content of the gynecology area. Text copied from the Octubre Rosa leaflet stays verbatim, including its
// spelling (scripts/gyneco/validate.mjs checks it against docs/research/folleto-octubre-rosa.md). Everything else
// (extras, conflicts, center statuses) is authored from docs/research/ginecologia.md and cites its sources by id.

export type SectionId='autoexamen'|'signos'|'controles'|'mitos'|'mamografia'|'anatomia';
export type ConflictId='timing'|'mammography'|'selfexam'|'clinical';
export interface Source {
 /** Id of the research report table (F = the leaflet). */
 id:string;institution:string;title:string;
 /** Text shown in the source list. */
 label:string;url?:string;retrieved?:string;
 kind:'leaflet'|'researched'|'atlas';
 /** Press and international sources are backup, not official. */
 backup?:boolean;
}
export interface Myth {claim:string;verdict:'Falso';why:string;/** Ids of the sources that support it. */sources:string[]}
/** Authored text with the ids of the sources it rests on. */
export interface Extra {title:string;items:string[];sources:string[]}
export interface ConflictSide {who:string;says:string;sources:string[]}
export interface Conflict {id:ConflictId;topic:string;sides:ConflictSide[];agreement?:string;caveat?:string}
export interface CenterStatus {status:'confirmado'|'parcial'|'no confirmado';detail:string;sources:string[]}
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
 /** Authored additions from the research, after the leaflet text. */
 extras?:Extra[];
 /** Conflicts between sources shown in this section, each side attributed. */
 conflicts?:ConflictId[];
 /** Status per item, in the same order (mammography centers). */
 statuses?:CenterStatus[];
 /** Said when the research report found no source for the section. */
 noResearch?:string;
 sources:Source[];
 /** Authored text stays false until a teacher reviews it. */
 validated:false;
}

export const LEAFLET_CREDIT='Folleto Octubre Rosa — IFMSA Tucumán (SCOPH) y Secretaría de Asuntos Estudiantiles UTN Tucumán, 2026';
export const RETRIEVED='2026-10-30';
export const UNT_NOTE='No se encontró material publicado de la Facultad de Medicina de la UNT sobre el autoexamen (solo el temario de la Cátedra de Ginecología, U1 y U2): la base son el INC, el Ministerio de Salud Pública de Tucumán y la Sociedad Argentina de Mastología.';

const f=(id:string,institution:string,title:string,kind:Source['kind'],url?:string):Source=>({id,institution,title,label:kind==='leaflet'?title:`${institution} — ${title}`,url,kind});
/** A source of the research report: id, institution, title, URL; consulted on RETRIEVED; press and MedlinePlus are backup. */
const r=(id:string,institution:string,title:string,url:string):Source=>({...f(id,institution,title,'researched',url),retrieved:RETRIEVED,backup:/^(P|I)/.test(id)||undefined});

/** Every source by its id in docs/research/ginecologia.md. */
export const SOURCES:Record<string,Source>={
 F:f('F','IFMSA Tucumán (SCOPH) y UTN Tucumán',LEAFLET_CREDIT,'leaflet'),
 HRA:f('HRA','HuBMAP','Human Reference Atlas, Visible Human femenino — CC BY 4.0','atlas','https://lod.humanatlas.io/ref-organ'),
 MH:f('MH','MakeHuman Community','Cuerpo 3D: malla base, esqueleto y morfologías de MakeHuman, vía MPFB2 v2.0.18 — CC0 1.0 (dominio público)','atlas','https://github.com/makehumancommunity/mpfb2/tree/v2.0.18/src/mpfb/data'),
 U1:r('U1','UNT Fac. de Medicina, Cátedra de Ginecología','Programas','https://sites.google.com/fm.unt.edu.ar/ginecologia/programas'),
 U2:r('U2','UNT Fac. de Medicina, Rotatorio Gineco-Obstetricia','Seminario','https://sites.google.com/fm.unt.edu.ar/rotatoriogineroobstetricia/seminario'),
 A1:r('A1','Ministerio de Salud de la Nación','Cáncer: prevención y detección temprana','https://www.argentina.gob.ar/salud/cancer/prevencion'),
 A2:r('A2','INC / Ministerio de Salud de la Nación','Programa Nacional de Prevención de Cáncer Cervicouterino','https://www.argentina.gob.ar/salud/instituto-nacional-del-cancer/institucional/pnpcc'),
 A3:r('A3','INC','Programa Nacional de Control de Cáncer de Mama','https://www.argentina.gob.ar/salud/instituto-nacional-del-cancer/institucional/pncm'),
 A4:r('A4','Ministerio de Salud de la Nación','VPH (Virus del Papiloma Humano)','https://www.argentina.gob.ar/salud/vacunas/vph'),
 A5:r('A5','INC','Manual operativo de evaluación clínica mamaria (3.ª ed., 2014)','https://iah.msal.gov.ar/doc/401.pdf'),
 A6:r('A6','Ministerio de Salud de la Nación','Mitos y verdades sobre el cáncer','https://www.argentina.gob.ar/salud/cancer/mitos-y-verdades'),
 A7:r('A7','Rev. Argent. Salud Pública (Min. Salud), Spina y col. 2018','Cuán precisos son los principales diarios de Argentina al informar sobre los métodos de prevención del cáncer de mama','https://rasp.msal.gov.ar/rasp/articulos/volumen37/9-14.pdf'),
 A8:r('A8','PAMI (INSSJP)','Cáncer de mama','https://www.pami.org.ar/cancer-de-mama'),
 T1:r('T1','Min. de Salud Pública de Tucumán','Octubre Rosa: Salud refuerza la detección precoz… (30/9/2026)','https://msptucuman.gov.ar/octubre-rosa-salud-refuerza-la-deteccion-precoz-del-cancer-de-mama-en-toda-la-provincia/'),
 T2:r('T2','Min. de Salud Pública de Tucumán','El Ministerio de Salud acerca mamografías al personal del Siprosa… (28/10/2026)','https://msptucuman.gov.ar/el-ministerio-de-salud-acerca-mamografias-al-personal-del-siprosa-y-promueve-el-diagnostico-temprano/'),
 T3:r('T3','Min. de Salud Pública de Tucumán','Acto por el Día del Cáncer de Mama en Maternidad (19/10/2026)','https://msptucuman.gov.ar/acto-por-el-dia-del-cancer-de-mama-en-maternidad/'),
 T4:r('T4','Min. de Salud Pública de Tucumán','El Hospital de Aguilares desarrolló actividades… (26/10/2026)','https://msptucuman.gov.ar/el-hospital-de-aguilares-desarrollo-actividades-de-concientizacion-y-prevencion-de-cancer-de-mama/'),
 T5:r('T5','Min. de Salud Pública de Tucumán','El Hospital Padilla fortalece la prevención… (19/1/2026)','https://msptucuman.gov.ar/el-hospital-padilla-fortalece-la-prevencion-del-cancer-de-mama-con-un-servicio-de-mamografia-de-atencion-diaria/'),
 T6:r('T6','Min. de Salud Pública de Tucumán','El Ministerio de Salud refuerza la prevención y ya se efectuaron más de 10.000 mamografías (1/8/2025)','https://msptucuman.gov.ar/el-ministerio-de-salud-refuerza-la-prevencion-del-cancer-de-mama-con-nuevas-acciones-y-tecnologia/'),
 T7:r('T7','Min. de Salud Pública de Tucumán','Noviembre continúa con las mamografías gratuitas en todos los nodos… (8/11/2025)','https://msptucuman.gov.ar/noviembre-continua-con-las-mamografias-gratuitas-en-todos-los-nodos-de-la-provincia-incluso-los-sabados/'),
 T8:r('T8','Min. de Salud Pública de Tucumán','El hospital Nuestra Señora del Carmen se sumó a la lucha contra el cáncer de mama (fecha del listado: 19/10/2022)','https://msptucuman.gov.ar/el-hospital-nuestra-senora-del-carmen-se-sumo-a-la-lucha-contra-el-cancer-de-mama/'),
 T9:r('T9','Min. de Salud Pública de Tucumán','El tráiler ginecológico integral continúa recorriendo la provincia (listado: 10/10/2024)','https://msptucuman.gov.ar/el-trailer-ginecologico-integral-continua-recorriendo-la-provincia-2/'),
 T10:r('T10','Min. de Salud Pública de Tucumán','Los nodos rosas fortalecen la prevención ginecológica… (28/5/2026)','https://msptucuman.gov.ar/los-nodos-rosas-fortalecen-la-prevencion-ginecologica-en-toda-la-provincia/'),
 T11:r('T11','Min. de Salud Pública de Tucumán','Salud entregó equipamiento… cáncer cervicouterino (listado: 4/3/2026)','https://msptucuman.gov.ar/salud-entrego-equipamiento-de-alta-tecnologia-para-fortalecer-la-deteccion-temprana-del-cancer-cervicouterino/'),
 T12:r('T12','Min. de Salud Pública de Tucumán','En el mes del Cáncer de mama, el Centro de Salud promueve… (22/10/2026)','https://msptucuman.gov.ar/en-el-mes-del-cancer-de-mama-el-centro-de-salud-promueve-la-prevencion-y-el-diagnostico-temprano/'),
 T13:r('T13','Min. de Salud Pública de Tucumán','Octubre Rosa: prevención… en Alderetes (6/10/2026)','https://msptucuman.gov.ar/octubre-rosa-prevencion-concientizacion-y-acompanamiento-en-alderetes/'),
 T14:r('T14','Min. de Salud Pública de Tucumán','El Hospital de Concepción se suma a las actividades por el Mes Rosa (13/10/2026)','https://msptucuman.gov.ar/el-hospital-de-concepcion-se-suma-a-las-actividades-por-el-mes-rosa/'),
 T15:r('T15','Min. de Salud Pública de Tucumán','El hospital "Dr. Elías Medici" de Tafí del Valle ofrece mamografías… (listado: 21/6/2022)','https://msptucuman.gov.ar/el-hospital-dr-elias-medici-de-tafi-del-valle-ofrece-mamografias-para-el-control-y-prevencion-de-cancer-de-mama-en-mujeres-de-la-zona-de-los-valles/'),
 T16:r('T16','Min. de Salud Pública de Tucumán','El Aula Rosa acerca información… Valles Calchaquíes (13/10/2026)','https://msptucuman.gov.ar/el-aula-rosa-acerca-informacion-prevencion-y-controles-mamograficos-a-las-mujeres-de-los-valles-calchaquies/'),
 T17:r('T17','Min. de Salud Pública de Tucumán','Cómo funciona el Servicio de Diagnóstico por Imágenes del Hospital de Monteros (listado: 17/10/2024)','https://msptucuman.gov.ar/como-funciona-el-servicio-de-diagnostico-por-imagenes-del-hospital-de-monteros/'),
 T18:r('T18','Min. de Salud Pública de Tucumán','El Sistema Público de Salud fortalece la detección precoz… con el mamógrafo móvil (25/5/2026)','https://msptucuman.gov.ar/el-sistema-publico-de-salud-fortalece-la-deteccion-precoz-del-cancer-de-mama-con-el-mamografo-movil/'),
 T20:r('T20','Min. de Salud Pública de Tucumán','Resultados de búsqueda interna "octubre rosa" (solo para el nombre del hospital)','https://msptucuman.gov.ar/?s=octubre+rosa'),
 S1:r('S1','Sociedad Argentina de Mastología y otras (AMA, SAR, etc.)','Consenso Nacional Inter-Sociedades sobre Cáncer de Mama (2006)','https://www.samas.org.ar/archivos/consensoacordado.pdf'),
 S2:r('S2','Sociedad Argentina de Mastología (blog Infosam; reproduce nota de Infobae)','Mamografías anuales, autoexamen y diagnóstico temprano…','https://www.samas.org.ar/index.php/blog-infosam/546-mamografias-anuales-autoexamen-y-diagnostico-temprano-las-claves-contra-el-cancer-de-mama'),
 S3:r('S3','Sociedad Argentina de Mastología (blog Infosam)','Cáncer de mama: tocarse ya no alcanza…','https://www.samas.org.ar/index.php/blog-infosam/115-cancer-de-mama-tocarse-ya-no-alcanza-encontralo-antes-que-sea-palpable'),
 P1:r('P1','La Gaceta (Tucumán), prensa','Día Mundial del Cáncer de Mama: cómo hacer un autoexamen paso a paso en casa (19/10/2026)','https://www.lagaceta.com.ar/nota/1158665/sociedad/dia-mundial-cancer-mama-como-hacer-autoexamen-paso-paso-casa.html'),
 P2:r('P2','La Nación, prensa','Cáncer de mama. ¿Cómo hacer un autoexamen? (2021, act. 2026)','https://www.lanacion.com.ar/otros/cancer-de-mama-como-hacer-un-autoexamen-nid16092021/'),
 I1:r('I1','MedlinePlus (NIH, EE. UU.)','Autoexamen de mamas','https://medlineplus.gov/spanish/ency/article/001993.htm'),
};

const cite=(...ids:string[])=>ids.map(id=>SOURCES[id]);

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

/** What the research report could confirm about each leaflet center (same order as CENTERS). */
export const CENTER_STATUS:CenterStatus[]=[
 {status:'confirmado',detail:'Tiene mamógrafo en diagnóstico por imágenes, con turnos a libre demanda.',sources:['T3']},
 {status:'confirmado',detail:'Tiene Centro de Lectura Mamográfica y mamógrafo.',sources:['T1','T6']},
 {status:'confirmado',detail:'Diagnóstico por imágenes con mamógrafo, de lunes a viernes.',sources:['T12','T20']},
 {status:'confirmado',detail:'Tiene servicio de mamografía.',sources:['T14','T1']},
 {status:'confirmado',detail:'Solo figura en una lista de nodos de 2022.',sources:['T8']},
 {status:'confirmado',detail:'Es uno de los dos nodos de Tafí Viejo.',sources:['T9']},
 {status:'confirmado',detail:'De lunes a viernes sin agenda, de 7 a 19 h (nota de 2026).',sources:['T4']},
 {status:'confirmado',detail:'De lunes a viernes de 8 a 18 h, por orden de llegada, sin pedido médico ni turno (la nota lo llama Hospital General Lamadrid).',sources:['T17']},
 {status:'confirmado',detail:'Atiende con turnos coordinados (nota de 2026).',sources:['T15','T16']},
 {status:'parcial',detail:'Hay una policlínica Ramón Carrillo en la lista de nodos, pero ninguna fuente la ubica en Yerba Buena.',sources:['T8']},
 {status:'no confirmado',detail:'Ninguna fuente leída lo identifica; la lista de nodos nombra una policlínica «Independencia» sin localidad.',sources:['T8']},
 {status:'confirmado',detail:'De lunes a viernes de 8 a 20 h, sin turno ni indicación médica.',sources:['T13']},
 {status:'confirmado',detail:'Es itinerante: sus ubicaciones se informan por los canales oficiales.',sources:['T2','T18']},
];

/** Disagreements between sources, each side attributed. */
export const CONFLICTS:Conflict[]=[
 {id:'timing',topic:'Cuándo hacerse el autoexamen',sides:[
   {who:'Folleto Octubre Rosa',says:'Entre 2 y 5 días después de terminar el sangrado.',sources:['F']},
   {who:'Hospital Ntra. Sra. del Carmen (Ministerio de Tucumán), MedlinePlus y La Gaceta',says:'Entre 3 y 5 días desde el comienzo de la menstruación (el hospital dice a los cinco días); nunca durante el sangrado.',sources:['T8','I1','P1']},
   {who:'Consenso Nacional Inter-Sociedades (2006)',says:'Entre 7 y 10 días después del comienzo del ciclo.',sources:['S1']},
  ],agreement:'Las fuentes oficiales y las sociedades coinciden en hacerlo después de la menstruación, cuando las mamas están menos sensibles; si no menstruás, elegí un día fijo cada mes. Cambia desde cuándo cuentan los días.'},
 {id:'mammography',topic:'Desde qué edad y cada cuánto hacerse la mamografía',sides:[
   {who:'INC (Ministerio de Salud de la Nación) y folleto',says:'Mujeres de 50 a 69 años sin síntomas ni antecedentes: una mamografía cada 1 o 2 años, junto con el examen físico. Antes de los 50 o después de los 69, consultar al equipo de salud.',sources:['A1','F']},
   {who:'Programa de Tucumán (Ministerio de Salud Pública)',says:'De 40 a 70 años, anual y sin pedido médico (si da normal, se repite al año siguiente).',sources:['T1','T6']},
   {who:'Sociedades científicas',says:'Mamografía anual desde los 40 años.',sources:['S1','A7']},
  ],agreement:'Con antecedentes familiares, el equipo de salud puede indicar empezar antes (el consenso de 2006 propone 10 años antes de la edad del caso familiar).'},
 {id:'selfexam',topic:'Autoexamen: ¿herramienta de prevención o de autoconocimiento?',sides:[
   {who:'Folleto, Maternidad, Hospital Ntra. Sra. del Carmen y La Gaceta',says:'Lo promueven como herramienta de prevención.',sources:['F','T3','T8','P1']},
   {who:'Sociedad Argentina de Mastología y PAMI',says:'Sirve para conocerse y para el seguimiento, pero no es una buena herramienta para la detección.',sources:['S1','S2','S3','A8']},
   {who:'INC',says:'No nombra el autoexamen en las páginas leídas: recomienda mamografía y examen físico profesional. No hay una declaración explícita del INC; es una inferencia del informe.',sources:['A1','A3']},
  ],agreement:'Ninguna fuente lo presenta como reemplazo: no reemplaza el examen clínico ni la mamografía.'},
 {id:'clinical',topic:'Examen clínico mamario: desde qué edad',sides:[
   {who:'Folleto Octubre Rosa',says:'Al menos una vez al año desde los 20 años.',sources:['F']},
   {who:'Consenso Nacional Inter-Sociedades (2006)',says:'Una vez al año, por un médico especialista, a partir de los 30 años.',sources:['S1']},
  ],caveat:'El informe no encontró una fuente oficial que confirme «desde los 20 años».'},
];

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
  extras:[{title:'Cómo hacerlo, según las fuentes',items:[
   'Primero mirate al espejo: con los brazos caídos, con las manos en la cadera y con los brazos arriba. Buscá cambios en la forma, la simetría y la piel (hoyuelos, arrugas, textura de cáscara de naranja).',
   'Palpá con las yemas de los tres dedos del medio de la mano opuesta, con círculos pequeños y presión suave, media y firme.',
   'Recorré la mama en franjas que cubran toda la mama. No hay un patrón oficial único: el manual del INC acepta cuadrantes, radial, zigzag o circular, siempre que el examen sea completo.',
   'Cubrí desde la clavícula (fosa supraclavicular) hasta debajo del pliegue de la mama, hacia la axila (la cola de la mama).',
   'Acostada, con una almohada bajo el hombro del lado a examinar y ese brazo detrás de la cabeza; de pie, por ejemplo en la ducha.',
   'Por último, presioná suavemente el pezón entre el índice y el pulgar: si sale secreción, consultá.',
  ],sources:['F','P1','I1','A5']}],
  conflicts:['timing','selfexam'],
  sources:cite('F','A5','A1','A3','A8','S1','S2','S3','T3','T8','P1','P2','I1','U1','U2','HRA','MH'),validated:false,
 },
 {
  id:'signos',label:'Signos y síntomas',title:'Signos y síntomas',
  intro:'Si presentas uno o mas de estos debes acudir al medico de inmediato',
  items:['Bulto o zona endurecida','Retraccion o cambios en el pezon','Enrojecimiento, calor o dolor localizado','Cambios en el tamaño, forma o contorno','Secreciones','Cambios en la piel','Hundimiento','Erupción'],
  callout:'UN HALLAZGO NO SIGNIFICA NECESARIAMENTE CANCER, PERO TODO CAMBIO NECESITA SER EVALUADO',
  extras:[{title:'Qué agregan las fuentes',items:[
   'INC: «Todo síntoma mamario requiere una valoración y seguimiento»; entre los más importantes cuenta la tumoración mamaria o axilar, la secreción o retracción del pezón, la «piel de naranja», los cambios recientes de tamaño o forma y el dolor mamario.',
   'Una imagen sospechosa «no significa por sí misma un diagnóstico de cáncer»: es la biopsia la que permite analizar el tejido (Ministerio de Salud de Tucumán). La mayoría de los bultos detectados resultan ser benignos (La Gaceta).',
  ],sources:['A5','T1','P1']}],
  sources:cite('F','A5','T8','S2','T1','P1'),validated:false,
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
  conflicts:['mammography','clinical'],
  extras:[
   {title:'Cuello del útero: PAP y test de VPH',items:[
    'INC: «A partir de los 25 años se recomienda realizar el PAP. Los dos primeros controles se hacen con un año de diferencia. Si ambos resultados son normales, el PAP puede repetirse cada 3 años.»',
    'INC: el test de VPH está «destinado a mujeres a partir de los 30 años. Cuando el resultado es negativo, se recomienda repetir el estudio cada cinco años.»',
    'En Tucumán, el test de VPH está disponible entre los 30 y los 64 años y el Papanicolaou se hace entre los 25 y los 64.',
   ],sources:['A2','A1','T9','T10']},
   {title:'Vacuna contra el VPH',items:[
    'Ministerio de Salud de la Nación: «Única dosis a los 11 años.»',
    'Rescate: «Única dosis de vacuna hasta los 20 años. Dos dosis (0 y 6 meses) en caso de inicio de esquema entre los 21 a 26 años.»',
    'En Tucumán es gratuita y obligatoria para niñas y niños de 11 años.',
   ],sources:['A4','T11']},
   {title:'Si hay antecedentes familiares',items:['El equipo de salud puede indicar empezar antes: el consenso de 2006 propone que los estudios mamográficos comiencen 10 años antes de la edad en que se presentó el caso familiar.'],sources:['S1']},
  ],
  sources:cite('F','A1','A2','A4','A7','S1','T1','T6','T9','T10','T11'),validated:false,
 },
 {
  id:'mitos',label:'Mitos y verdades',title:'Mitos y verdades',
  myths:[
   {claim:'Si no hay casos en mi familia, no puedo tener cáncer de mama.',verdict:'Falso',why:'La mayoría de las personas diagnosticadas no tiene antecedentes familiares.',sources:['A6','A8']},
   {claim:'Los hombres no pueden tener cáncer de mama.',verdict:'Falso',why:'Aunque es mucho menos frecuente, los hombres también pueden desarrollarlo.',sources:['A8']},
   {claim:'Si un bulto duele, no es cáncer.',verdict:'Falso',why:'El dolor no descarta cáncer; muchos tumores iniciales no duelen. Todo bulto nuevo debe ser evaluado.',sources:['A5','T5']},
   {claim:'El cáncer de mama siempre se cura o siempre es mortal.',verdict:'Falso',why:'Es un grupo de enfermedades distintas cada caso requiere evaluación individual.',sources:['A6','T6']},
  ],
  extras:[{title:'Qué dicen las fuentes',items:[
   'Familia: el Ministerio de Salud de la Nación informa que el 75 % de las mujeres con diagnóstico cada año en Argentina no tenía ningún factor conocido de importancia, y PAMI que el 75 % de las mujeres con cáncer de mama no tiene antecedentes familiares.',
   'Dolor: el manual del INC incluye el dolor mamario entre los síntomas que requieren valoración y el Ministerio de Tucumán dice que «no hace falta sentir dolor ni detectar bultos». Ninguna fuente leída afirma con esas palabras que muchos tumores iniciales no duelen.',
   'Edad: «los tumores de mama pueden aparecer a cualquier edad» (Ministerio de Salud de la Nación).',
   'Curación: las notas de Tucumán dan cifras distintas para la detección precoz: 95 % a los cinco años, más de 90 % y del 80 al 90 %. El cáncer de mama puede volver, sobre todo en los primeros 5 a 10 años.',
  ],sources:['A6','A8','A5','T5','T6','T7','T8']}],
  sources:cite('F','A5','A6','A8','T5','T6','T7','T8'),validated:false,
 },
 {
  id:'mamografia',label:'Mamografía gratuita en Tucumán',title:'Centros donde podés hacerte una mamografía gratuita',
  items:CENTERS,callout:'LA DETECCION TEMPRANA SALVA VIDAS',statuses:CENTER_STATUS,
  extras:[{title:'Qué se pudo confirmar',items:[
   'Cada centro del folleto muestra su estado según las fuentes consultadas el 2026-10-30. «No confirmado» significa que no se encontró una fuente oficial, no que el centro no atienda.',
   'Tucumán cuenta con 18 nodos de mamografía, que en la campaña de noviembre de 2025 funcionaron también los sábados de 9 a 13 h.',
   'La unidad móvil de mamografía recorre distintas localidades; sus ubicaciones se informan por los canales oficiales.',
   'Los horarios y requisitos cambian entre notas oficiales (desde los 35, desde los 40 o de 40 a 70 años; con o sin pedido médico): confirmalos en el centro antes de ir.',
  ],sources:['T1','T7','T2','T5','T4']}],
  sources:cite('F','T1','T2','T3','T4','T5','T6','T7','T8','T9','T12','T13','T14','T15','T16','T17','T18','T20'),validated:false,
 },
 {
  id:'anatomia',label:'Anatomía',title:'Anatomía',
  intro:'Tocá una estructura del modelo para ver su descripción: tejido adiposo, lobulillos y conductos de la mama; útero, trompas y ovarios; vejiga y pelvis ósea.',
  noResearch:'El informe de investigación no relevó fuentes para esta sección: las descripciones salen del atlas de referencia.',
  sources:cite('HRA','MH'),validated:false,
 },
];

import type {Citation,MuscleId,PatientPosition,StretchEntry,StretchVariant} from './types';

export const MUSCLE_NAMES:Record<MuscleId,string>={
 biceps_femoris_long:'Bíceps femoral (cabeza larga)',biceps_femoris_short:'Bíceps femoral (cabeza corta)',semitendinosus:'Semitendinoso',semimembranosus:'Semimembranoso',
 rectus_femoris:'Recto femoral',vastus_lateralis:'Vasto lateral',vastus_medialis:'Vasto medial',vastus_intermedius:'Vasto intermedio',
 psoas_major:'Psoas mayor',iliacus:'Ilíaco',gastrocnemius_medial:'Gemelo medial',gastrocnemius_lateral:'Gemelo lateral',soleus:'Sóleo',
 adductor_longus:'Aductor largo',adductor_brevis:'Aductor corto',adductor_magnus:'Aductor mayor',gracilis:'Grácil',pectineus:'Pectíneo',
};
export const POSITION_NAMES:Record<PatientPosition,string>={supino:'Decúbito supino',prono:'Decúbito prono',lateral:'Decúbito lateral',sedente:'Sedente',bipedestacion:'Bipedestación'};
export const MODE_NAMES:Record<StretchVariant['mode'],string>={activo:'Activo: se mueve el paciente',pasivo:'Pasivo: mueve el terapeuta',inmovil:'Paciente inmóvil (decúbito obligado)'};

// Clinical content for slice 1. Every entry stays `validated:false` until a kinesiologist reviews it.
// Concepts and values follow the cited works; their figures and text are not reproduced.
const KENDALL=(section:string):Citation=>({source:'Kendall FP, McCreary EK, Provance PG, Rodgers MM, Romani WA. Músculos: pruebas funcionales, postura y dolor. 5.ª ed.',section});
const KAPANDJI=(section:string):Citation=>({source:'Kapandji AI. Fisiología articular. Tomo 2: miembro inferior.',section});
const IMMOBILE='Decúbito obligado: el paciente no puede cambiar de posición.';

export const STRETCHES:StretchEntry[]=[
 {
  id:'isquiotibiales',group:'Isquiotibiales',title:'Isquiotibiales',side:'r',
  muscles:['biceps_femoris_long','semitendinosus','semimembranosus'],
  test:'Elevación de la pierna recta (EPR)',
  normal:'Con la lumbar y el sacro apoyados y la otra pierna extendida, la cadera llega a unos 80° de flexión con la rodilla extendida.',
  variants:[
   {position:'supino',mode:'pasivo',setup:'Decúbito supino, miembro contralateral extendido sobre la camilla.',action:'Elevar el miembro con la rodilla extendida y el tobillo en neutro hasta la primera resistencia.',fixation:'Pelvis y muslo contralateral contra la camilla.',pose:{hip_r:{flexion:80},knee_r:{flexion:0},ankle_r:{flexion:0}}},
   {position:'lateral',mode:'pasivo',setup:'Decúbito lateral sobre el lado contralateral, con el miembro de abajo flexionado para estabilizar la pelvis.',action:'Sostener el miembro de arriba y flexionar la cadera con la rodilla extendida.',fixation:'Pelvis, para que no rote hacia atrás.',pose:{hip_r:{flexion:80},knee_r:{flexion:0},hip_l:{flexion:45},knee_l:{flexion:60}}},
   {position:'sedente',mode:'activo',setup:'Sentado en el borde de la camilla con la columna erguida.',action:'Extender la rodilla y llevar el tronco hacia adelante desde la cadera, sin redondear la espalda.',fixation:'El propio paciente mantiene la lordosis lumbar.',pose:{hip_r:{flexion:90},knee_r:{flexion:5},hip_l:{flexion:90},knee_l:{flexion:90}}},
   {position:'bipedestacion',mode:'activo',setup:'De pie, con el talón apoyado en un escalón bajo y la rodilla extendida.',action:'Inclinar el tronco hacia adelante desde la cadera manteniendo la espalda recta.',fixation:'Pierna de apoyo extendida; pelvis nivelada.',pose:{hip_r:{flexion:70},knee_r:{flexion:0},ankle_r:{flexion:5}}},
   {position:'supino',mode:'inmovil',setup:`${IMMOBILE} Está en supino.`,action:'La EPR pasiva es la técnica de elección: se hace igual que en supino, sin mover al paciente.',fixation:'Muslo contralateral contra la camilla.',pose:{hip_r:{flexion:70},knee_r:{flexion:0}}},
   {position:'prono',mode:'inmovil',setup:`${IMMOBILE} Está en prono.`,action:'No se elonga: en prono la cadera queda en extensión y no se puede flexionar.',fixation:'—',pose:{},note:'Sin flexión de cadera los isquiotibiales no se elongan; solo se puede mantener la rodilla en extensión.'},
  ],
  precautions:['Evitar la retroversión pélvica y la flexión lumbar: dan una falsa amplitud.','Mantener la rodilla extendida y la cadera sin rotar.','Si aparecen parestesias, descartar tensión neural (signo de Lasègue).'],
  citations:[KENDALL('Pruebas de longitud muscular: isquiotibiales (elevación de la pierna recta)'),KAPANDJI('La cadera y la rodilla: músculos biarticulares')],
  validated:false,
 },
 {
  id:'biceps-femoral-cabeza-corta',group:'Isquiotibiales',title:'Bíceps femoral, cabeza corta',side:'r',
  muscles:['biceps_femoris_short'],
  normal:'Es monoarticular: queda elongada con la rodilla en extensión completa (0°), sea cual sea la posición de la cadera.',
  variants:[
   {position:'prono',mode:'pasivo',setup:'Decúbito prono, con un rollo bajo el tobillo.',action:'Llevar la rodilla a la extensión completa.',fixation:'Muslo contra la camilla.',pose:{hip_r:{flexion:0},knee_r:{flexion:0}}},
   {position:'supino',mode:'pasivo',setup:'Decúbito supino, cadera en neutro.',action:'Extender la rodilla por completo presionando sobre la tibia proximal.',fixation:'Muslo distal.',pose:{hip_r:{flexion:0},knee_r:{flexion:0}}},
   {position:'supino',mode:'inmovil',setup:`${IMMOBILE} Está en supino o en prono.`,action:'Se puede elongar desde cualquier decúbito: alcanza con la extensión completa de rodilla.',fixation:'Muslo distal.',pose:{knee_r:{flexion:0}}},
  ],
  precautions:['Evitar la hiperextensión forzada de rodilla.'],
  citations:[KAPANDJI('La rodilla: flexores de la rodilla')],
  validated:false,
 },
 {
  id:'recto-femoral',group:'Recto femoral',title:'Recto femoral',side:'r',
  muscles:['rectus_femoris'],
  test:'Prueba de Thomas modificada; prueba de Ely',
  normal:'En la prueba de Thomas modificada, con el muslo apoyado en la camilla la rodilla flexiona unos 80°.',
  variants:[
   {position:'supino',mode:'pasivo',setup:'Sentado en el extremo de la camilla, se acuesta abrazando la rodilla contralateral contra el pecho.',action:'Dejar caer el muslo evaluado fuera del borde y flexionar la rodilla.',fixation:'Rodilla contralateral contra el pecho: aplana la lumbar.',pose:{hip_l:{flexion:120},knee_l:{flexion:120},hip_r:{flexion:-10},knee_r:{flexion:80}}},
   {position:'prono',mode:'pasivo',setup:'Decúbito prono, cadera en neutro.',action:'Flexionar la rodilla llevando el talón hacia el glúteo (Ely: si la pelvis se eleva, hay acortamiento).',fixation:'Pelvis contra la camilla para que no se eleve.',pose:{hip_r:{flexion:0},knee_r:{flexion:125}}},
   {position:'lateral',mode:'activo',setup:'Decúbito lateral sobre el lado contralateral, con el miembro de abajo flexionado.',action:'Tomar el tobillo, flexionar la rodilla y llevar la cadera a una leve extensión.',fixation:'El miembro de abajo flexionado estabiliza la pelvis.',pose:{hip_r:{flexion:-10},knee_r:{flexion:120},hip_l:{flexion:60},knee_l:{flexion:70}}},
   {position:'bipedestacion',mode:'activo',setup:'De pie, apoyado en una pared.',action:'Tomarse el tobillo y llevar el talón al glúteo, con la rodilla apuntando al piso y la pelvis en retroversión.',fixation:'Abdomen activo para no hiperextender la lumbar.',pose:{hip_r:{flexion:-10},knee_r:{flexion:130}}},
   {position:'prono',mode:'inmovil',setup:`${IMMOBILE} Está en prono.`,action:'Flexión pasiva de rodilla con la cadera en neutro, como en la prueba de Ely.',fixation:'Pelvis contra la camilla.',pose:{hip_r:{flexion:0},knee_r:{flexion:115}}},
   {position:'supino',mode:'inmovil',setup:`${IMMOBILE} Está en supino.`,action:'Solo si el muslo puede quedar fuera del borde de la camilla; si no, la cadera no llega a extensión y la elongación no es efectiva.',fixation:'Rodilla contralateral flexionada.',pose:{hip_r:{flexion:0},knee_r:{flexion:90}},note:'Sobre la camilla la cadera no pasa de 0°: el recto femoral queda poco elongado.'},
  ],
  precautions:['Evitar la anteversión pélvica y la hiperlordosis lumbar.','Mantener el muslo alineado, sin abducir.','La prueba de Ely no forma parte de la secuencia de Kendall: se incluye como complemento.'],
  citations:[KENDALL('Pruebas de longitud muscular: flexores de cadera (prueba de Thomas modificada)'),KAPANDJI('La cadera y la rodilla: el recto femoral como músculo biarticular')],
  validated:false,
 },
 {
  id:'vastos',group:'Cuádriceps monoarticular',title:'Vastos (cuádriceps monoarticular)',side:'r',
  muscles:['vastus_lateralis','vastus_medialis','vastus_intermedius'],
  normal:'Flexión de rodilla de unos 140° con la cadera flexionada (así el recto femoral no limita).',
  variants:[
   {position:'supino',mode:'pasivo',setup:'Decúbito supino.',action:'Flexionar la cadera y llevar la rodilla a flexión máxima.',fixation:'Pelvis contra la camilla.',pose:{hip_r:{flexion:90},knee_r:{flexion:140}}},
   {position:'sedente',mode:'activo',setup:'Sentado, con el pie bajo la silla.',action:'Deslizar el pie hacia atrás para aumentar la flexión de rodilla.',fixation:'Muslo apoyado en el asiento.',pose:{hip_r:{flexion:90},knee_r:{flexion:120},hip_l:{flexion:90},knee_l:{flexion:90}}},
   {position:'lateral',mode:'pasivo',setup:'Decúbito lateral sobre el lado contralateral.',action:'Flexionar la cadera y la rodilla del miembro de arriba hasta el tope.',fixation:'Pelvis.',pose:{hip_r:{flexion:80},knee_r:{flexion:135},hip_l:{flexion:30},knee_l:{flexion:40}}},
   {position:'supino',mode:'inmovil',setup:`${IMMOBILE} Está en supino.`,action:'Se puede: flexión pasiva de cadera y rodilla sin cambiar de decúbito.',fixation:'Miembro contralateral.',pose:{hip_r:{flexion:90},knee_r:{flexion:130}}},
  ],
  precautions:['Si duele en la cara anterior de la rodilla, reducir la flexión (presión femoropatelar).'],
  citations:[KAPANDJI('La rodilla: amplitud de flexión con la cadera flexionada')],
  validated:false,
 },
 {
  id:'psoasiliaco',group:'Psoasilíaco',title:'Psoasilíaco',side:'r',
  muscles:['psoas_major','iliacus'],
  test:'Prueba de Thomas',
  normal:'Con la lumbar apoyada, el muslo evaluado llega a apoyarse en la camilla (cadera en 0° a 10° de extensión).',
  variants:[
   {position:'supino',mode:'pasivo',setup:'Sentado en el extremo de la camilla, se acuesta abrazando la rodilla contralateral contra el pecho.',action:'Dejar descender el muslo evaluado hasta la extensión de cadera.',fixation:'Rodilla contralateral contra el pecho (retroversión pélvica).',pose:{hip_l:{flexion:120},knee_l:{flexion:120},hip_r:{flexion:-10},knee_r:{flexion:80}}},
   {position:'prono',mode:'pasivo',setup:'Decúbito prono.',action:'Elevar el muslo en extensión de cadera con la rodilla extendida.',fixation:'Sacro contra la camilla.',pose:{hip_r:{flexion:-15},knee_r:{flexion:0}}},
   {position:'lateral',mode:'pasivo',setup:'Decúbito lateral sobre el lado contralateral, con cadera y rodilla de abajo flexionadas.',action:'Llevar la cadera de arriba a extensión con la rodilla extendida.',fixation:'Pelvis, con el miembro de abajo flexionado.',pose:{hip_r:{flexion:-15},knee_r:{flexion:0},hip_l:{flexion:90},knee_l:{flexion:90}}},
   {position:'bipedestacion',mode:'activo',setup:'Posición de caballero: rodilla del lado a elongar apoyada en el piso.',action:'Retroversión pélvica y desplazamiento del peso hacia adelante.',fixation:'Glúteo activo del lado a elongar.',pose:{hip_r:{flexion:-15},knee_r:{flexion:90},hip_l:{flexion:90},knee_l:{flexion:90}}},
   {position:'prono',mode:'inmovil',setup:`${IMMOBILE} Está en prono.`,action:'Extensión pasiva de cadera fijando la pelvis.',fixation:'Sacro contra la camilla.',pose:{hip_r:{flexion:-10},knee_r:{flexion:0}}},
   {position:'supino',mode:'inmovil',setup:`${IMMOBILE} Está en supino.`,action:'Solo si el miembro puede salir del borde de la camilla; si no, la cadera no pasa de 0°.',fixation:'Flexionar la cadera contralateral para fijar la pelvis.',pose:{hip_l:{flexion:90},knee_l:{flexion:90},hip_r:{flexion:-10},knee_r:{flexion:0}},note:'La pose muestra el miembro fuera del borde. Si no puede salir de la camilla, la cadera no pasa de 0° y la elongación queda limitada.'},
  ],
  precautions:['Evitar la hiperlordosis lumbar y la anteversión pélvica: compensan la falta de extensión de cadera.','Diferenciar del recto femoral: si el muslo baja al extender la rodilla, limita el recto femoral.'],
  citations:[KENDALL('Pruebas de longitud muscular: flexores de cadera (prueba de Thomas)'),KAPANDJI('La cadera: extensión y flexores de cadera')],
  validated:false,
 },
 {
  id:'gemelos',group:'Tríceps sural',title:'Gemelos',side:'r',
  muscles:['gastrocnemius_medial','gastrocnemius_lateral'],
  test:'Dorsiflexión con la rodilla extendida',
  normal:'Unos 10° de dorsiflexión con la rodilla extendida.',
  variants:[
   {position:'supino',mode:'pasivo',setup:'Decúbito supino, rodilla extendida.',action:'Tomar el calcáneo y llevar el pie a dorsiflexión apoyando el antebrazo en la planta.',fixation:'Rodilla en extensión.',pose:{knee_r:{flexion:0},ankle_r:{flexion:10}}},
   {position:'prono',mode:'pasivo',setup:'Decúbito prono, con los pies fuera de la camilla.',action:'Con la rodilla extendida, llevar el pie a dorsiflexión.',fixation:'Tibia distal.',pose:{knee_r:{flexion:0},ankle_r:{flexion:10}}},
   {position:'bipedestacion',mode:'activo',setup:'Frente a una pared, pierna a elongar atrás, rodilla extendida y talón apoyado.',action:'Llevar la cadera hacia adelante sin despegar el talón.',fixation:'Pie apuntando hacia adelante.',pose:{hip_r:{flexion:-10},knee_r:{flexion:0},ankle_r:{flexion:15}}},
   {position:'supino',mode:'inmovil',setup:`${IMMOBILE} Está en supino o en prono.`,action:'Se puede desde cualquier decúbito: rodilla extendida y dorsiflexión pasiva.',fixation:'Rodilla en extensión.',pose:{knee_r:{flexion:0},ankle_r:{flexion:10}}},
  ],
  precautions:['Mantener el retropié en neutro: la pronación da una falsa dorsiflexión.'],
  citations:[KENDALL('Pruebas de longitud muscular: flexores plantares (gastrocnemio)'),KAPANDJI('El tobillo: flexión dorsal y músculos biarticulares')],
  validated:false,
 },
 {
  id:'soleo',group:'Tríceps sural',title:'Sóleo',side:'r',
  muscles:['soleus'],
  test:'Dorsiflexión con la rodilla flexionada',
  normal:'Unos 20° de dorsiflexión con la rodilla flexionada (los gemelos quedan relajados).',
  variants:[
   {position:'prono',mode:'pasivo',setup:'Decúbito prono, rodilla flexionada a 90°.',action:'Empujar el calcáneo hacia arriba y llevar el pie a dorsiflexión.',fixation:'Muslo contra la camilla.',pose:{knee_r:{flexion:90},ankle_r:{flexion:20}}},
   {position:'supino',mode:'pasivo',setup:'Decúbito supino, cadera y rodilla flexionadas, pie apoyado.',action:'Llevar el pie a dorsiflexión con la rodilla flexionada.',fixation:'Rodilla.',pose:{hip_r:{flexion:45},knee_r:{flexion:90},ankle_r:{flexion:20}}},
   {position:'bipedestacion',mode:'activo',setup:'Frente a una pared, pierna a elongar atrás con la rodilla flexionada.',action:'Bajar el peso sin despegar el talón.',fixation:'Talón apoyado.',pose:{knee_r:{flexion:30},ankle_r:{flexion:20}}},
   {position:'prono',mode:'inmovil',setup:`${IMMOBILE} Está en prono o en supino.`,action:'Se puede: rodilla flexionada y dorsiflexión pasiva.',fixation:'Muslo.',pose:{knee_r:{flexion:90},ankle_r:{flexion:15}}},
  ],
  precautions:['Mantener el retropié en neutro.'],
  citations:[KENDALL('Pruebas de longitud muscular: flexores plantares (sóleo)'),KAPANDJI('El tobillo: flexión dorsal')],
  validated:false,
 },
 {
  id:'aductores',group:'Aductores',title:'Aductores monoarticulares',side:'r',
  muscles:['adductor_longus','adductor_brevis','adductor_magnus','pectineus'],
  test:'Abducción de cadera en supino',
  normal:'Unos 40° de abducción con la rodilla extendida.',
  variants:[
   {position:'supino',mode:'pasivo',setup:'Decúbito supino, rodillas extendidas.',action:'Abducir la cadera deslizando el miembro sobre la camilla.',fixation:'Espina ilíaca contralateral, para que la pelvis no se incline.',pose:{hip_r:{abduction:40},knee_r:{flexion:0}}},
   {position:'sedente',mode:'activo',setup:'Sentado con las plantas juntas (posición de mariposa).',action:'Dejar caer las rodillas hacia afuera, con la espalda recta.',fixation:'Tronco erguido.',pose:{hip_r:{flexion:70,abduction:40,rotation:-40},knee_r:{flexion:120},hip_l:{flexion:70,abduction:40,rotation:-40},knee_l:{flexion:120}}},
   {position:'bipedestacion',mode:'activo',setup:'De pie, con las piernas separadas.',action:'Desplazar el peso hacia el lado contralateral flexionando esa rodilla.',fixation:'Pie del lado a elongar apoyado.',pose:{hip_r:{abduction:30},knee_r:{flexion:0},hip_l:{flexion:30,abduction:10},knee_l:{flexion:50}}},
   {position:'supino',mode:'inmovil',setup:`${IMMOBILE} Está en supino.`,action:'Se puede: abducción pasiva deslizando el miembro sobre la camilla.',fixation:'Pelvis.',pose:{hip_r:{abduction:35}}},
   {position:'prono',mode:'inmovil',setup:`${IMMOBILE} Está en prono.`,action:'Abducción pasiva sobre la camilla con la pelvis fija.',fixation:'Sacro.',pose:{hip_r:{abduction:30}}},
  ],
  precautions:['Evitar que la pelvis se incline o rote.','El aductor mayor tiene una porción isquiotibial: se elonga más con la cadera flexionada y abducida.'],
  citations:[KENDALL('Pruebas de longitud muscular: aductores de cadera'),KAPANDJI('La cadera: abducción y músculos aductores')],
  validated:false,
 },
 {
  id:'gracil',group:'Aductores',title:'Grácil',side:'r',
  muscles:['gracilis'],
  test:'Abducción con la rodilla extendida y flexionada',
  normal:'Si la abducción aumenta al flexionar la rodilla, el acortamiento es del grácil (biarticular).',
  variants:[
   {position:'supino',mode:'pasivo',setup:'Decúbito supino.',action:'Abducir la cadera manteniendo la rodilla extendida.',fixation:'Espina ilíaca contralateral.',pose:{hip_r:{abduction:40},knee_r:{flexion:0}}},
   {position:'bipedestacion',mode:'activo',setup:'De pie, de costado a una camilla baja, con el pie del lado a elongar apoyado arriba.',action:'Con la rodilla extendida, bajar el peso alejándose de la camilla.',fixation:'Pierna de apoyo firme.',pose:{hip_r:{abduction:35},knee_r:{flexion:0}}},
   {position:'supino',mode:'inmovil',setup:`${IMMOBILE} Está en supino.`,action:'Se puede: abducción pasiva con la rodilla extendida.',fixation:'Pelvis.',pose:{hip_r:{abduction:35},knee_r:{flexion:0}}},
  ],
  precautions:['Mantener la rodilla extendida: si se flexiona, el grácil se relaja.'],
  citations:[KENDALL('Pruebas de longitud muscular: aductores de cadera'),KAPANDJI('La rodilla: músculos de la pata de ganso')],
  validated:false,
 },
];

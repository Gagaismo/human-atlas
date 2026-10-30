// Z-Anatomy names paired lymphatic structures the same on both sides; the side comes from the geometry.
const WORDS={left:{m:'izquierdo',f:'izquierda',mp:'izquierdos',fp:'izquierdas'},right:{m:'derecho',f:'derecha',mp:'derechos',fp:'derechas'}};

/** Gender and number of a Spanish noun phrase, from its head noun. */
function agreement(nameEs){
 const head=nameEs.split(' ')[0].toLowerCase(),plural=head.endsWith('s');
 const singular=plural?head.replace(/e?s$/,''):head;
 const feminine=/a$|ción$|ión$|dad$/.test(singular)&&!/^(sistema|tema|problema)$/.test(singular);
 return (feminine?'f':'m')+(plural?'p':'');
}

/** [English name, Spanish name] with the side added; midline structures, and names whose anatomical name
 * already says left or right (e.g. left colic nodes), are returned unchanged. */
export function sidedNames(name,nameEs,side){
 if(side==='midline'||/(^| )(left|right)( |$)/i.test(name))return [name,nameEs];
 return [`${side==='left'?'Left':'Right'} ${name.charAt(0).toLowerCase()}${name.slice(1)}`,`${nameEs} ${WORDS[side][agreement(nameEs)]}`];
}

/** Side of a structure from its bounds (+x is the body's left); within 2 cm of the midline counts as midline. */
export function sideOf(bounds){
 const x=(bounds[0][0]+bounds[1][0])/2;
 return Math.abs(x)<.02?'midline':x>0?'left':'right';
}

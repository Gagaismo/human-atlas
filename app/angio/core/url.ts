// URL hash state of the angiography mode (S10): '#angiografia&a=-30&b=-30&sys=left&sel=lad-mid'.
// `a` rotation (negative OAD, positive OAI, clamped ±90), `b` angulation (negative CAU, positive CRA, clamped ±45),
// `sys` left|right|both, `sel` a segment id (the UI checks it exists). Extras so the whole state is shareable:
// `dom` right|left|co, `ri=1` ramus intermedius, `g` comma list of grafts. Invalid values fall back to the defaults.
// Serialising omits defaults, always keeps the '#angiografia' prefix and parse(serialize(s)) round-trips.
import {A_LIMIT,B_LIMIT} from './geometry';
import type {Dominance,GraftId,System} from './types';

export interface AngioState{a:number;b:number;sys:System;sel:string|null;dom:Dominance;ri:boolean;g:GraftId[]}

export const MODE_HASH='#angiografia';
export const DEFAULT_STATE:Readonly<AngioState>={a:0,b:0,sys:'left',sel:null,dom:'right',ri:false,g:[]};
const GRAFT_ORDER:GraftId[]=['lima','svg-om','svg-pda'];

const num=(s:string|undefined,lim:number)=>{
 const x=s===undefined||s.trim()===''?NaN:Number(s);
 return Number.isFinite(x)?Math.max(-lim,Math.min(lim,Math.round(x))):0;
};
const sortGrafts=(g:Iterable<string>):GraftId[]=>GRAFT_ORDER.filter(x=>new Set(g).has(x));

export function isAngioHash(hash:string):boolean{return /^#angiografia(?:$|[&?])/.test(hash)}

/** Parse a location hash; anything that is not valid falls back to the defaults. */
export function parseHash(hash:string):AngioState{
 const state:AngioState={...DEFAULT_STATE,g:[]};
 const m=/^#angiografia(?:[&?](.*))?$/.exec(hash.trim());
 if(!m||!m[1])return state;
 const params=new Map<string,string>();
 for(const part of m[1].split('&')){
  const eq=part.indexOf('=');if(eq<0)continue;
  let value=part.slice(eq+1);
  try{value=decodeURIComponent(value);}catch{continue;}
  params.set(part.slice(0,eq),value);
 }
 state.a=num(params.get('a'),A_LIMIT);state.b=num(params.get('b'),B_LIMIT);
 const sys=params.get('sys');state.sys=sys==='right'||sys==='both'?sys:'left';
 const sel=params.get('sel');state.sel=sel!==undefined&&/^[a-z0-9-]+$/.test(sel)?sel:null;
 const dom=params.get('dom');state.dom=dom==='left'||dom==='co'?dom:'right';
 state.ri=params.get('ri')==='1';
 state.g=sortGrafts((params.get('g')??'').split(','));
 return state;
}

/** Serialise to a stable hash; defaults are omitted. */
export function serializeHash(s:AngioState):string{
 const a=num(String(s.a),A_LIMIT),b=num(String(s.b),B_LIMIT),parts:string[]=[];
 if(a!==0)parts.push(`a=${a}`);
 if(b!==0)parts.push(`b=${b}`);
 if(s.sys!=='left')parts.push(`sys=${s.sys}`);
 if(s.sel&&/^[a-z0-9-]+$/.test(s.sel))parts.push(`sel=${s.sel}`);
 if(s.dom!=='right')parts.push(`dom=${s.dom}`);
 if(s.ri)parts.push('ri=1');
 const g=sortGrafts(s.g);if(g.length)parts.push(`g=${g.join(',')}`);
 return MODE_HASH+parts.map(p=>'&'+p).join('');
}

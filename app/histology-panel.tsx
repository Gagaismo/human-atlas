import {useState} from 'react';
import {ArrowLeft,ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {TISSUE_CATEGORIES,type HistologyCatalog,type Tissue} from './histology';

interface Props {open:boolean;onOpenChange:(open:boolean)=>void;catalog:HistologyCatalog|undefined;tissueId:string|null;onTissue:(id:string|null)=>void}

/** Histology section: openly licensed micrographs of the basic tissues and organs, with credits. */
export default function HistologyPanel({open,onOpenChange,catalog,tissueId,onTissue}:Props){
 const [category,setCategory]=useState<Tissue['categoria']|null>(null);
 const tissue=catalog?.tissues.find(t=>t.id===tissueId);
 const shown=catalog?.tissues.filter(t=>!category||t.categoria===category)??[];
 return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="histology-sheet glass">
  <div className="eyebrow">HISTOLOGÍA</div>
  {tissue?<div className="tissue-detail" key={tissue.id}>
   <Button variant="ghost" className="tissue-back" onClick={()=>onTissue(null)}><ArrowLeft size={15}/>Todos los tejidos</Button>
   <SheetTitle className="structure-title">{tissue.nombre}</SheetTitle>
   <SheetDescription className="tissue-category">{tissue.categoria}</SheetDescription>
   <a href={tissue.image} target="_blank" rel="noreferrer" className="tissue-image" title="Abrir la imagen completa"><img src={tissue.image} width={tissue.width} height={tissue.height} alt={`Micrografía: ${tissue.nombre}`}/></a>
   <p className="tissue-text">{tissue.descripcion}</p>
   <dl className="structure-facts tissue-facts">
    <div><dt>Tinción</dt><dd>{tissue.tincion}</dd></div>
    {tissue.aumento&&<div><dt>Aumento</dt><dd>{tissue.aumento}</dd></div>}
    {tissue.especie&&<div><dt>Especie</dt><dd>{tissue.especie}</dd></div>}
   </dl>
   <span className="context-note review-note">Contenido educativo · a validar por un docente</span>
   <p className="tissue-credit">Imagen: {tissue.credit.author} · <a href={tissue.credit.licenseUrl} target="_blank" rel="noreferrer">{tissue.credit.license}</a> · <a href={tissue.credit.source} target="_blank" rel="noreferrer">fuente <ArrowUpRight size={11}/></a> · {tissue.credit.modification}.</p>
  </div>:<>
   <SheetTitle className="structure-title">Tejidos al microscopio</SheetTitle>
   <SheetDescription>Micrografías de licencia abierta de los tejidos básicos y de órganos del atlas.</SheetDescription>
   <div className="layer-presets tissue-filters" role="group" aria-label="Filtrar por tipo de tejido">
    <Button variant="ghost" aria-pressed={!category} onClick={()=>setCategory(null)}>Todos</Button>
    {TISSUE_CATEGORIES.map(c=><Button variant="ghost" key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</Button>)}
   </div>
   {!catalog&&<p className="search-note">Cargando el catálogo…</p>}
   <ul className="tissue-grid">{shown.map(t=><li key={t.id}><button type="button" onClick={()=>onTissue(t.id)}><img src={t.image} alt="" loading="lazy" width={t.width} height={t.height}/><span>{t.nombre}</span></button></li>)}</ul>
  </>}
 </SheetContent></Sheet>;
}

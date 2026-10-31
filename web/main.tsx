import {Suspense,lazy,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';
// The kinesiology mode lives behind #kinesiologia so it can be shared as a link; the atlas stays the default.
const KINESIO='#kinesiologia',KinesioMode=lazy(()=>import('../app/kinesio/kinesio-mode'));
// Same for the gynecology area at #ginecologia.
const GYNECO='#ginecologia',GynecoMode=lazy(()=>import('../app/gyneco/gyneco-mode'));
function App(){
 const [hash,setHash]=useState(location.hash);
 useEffect(()=>{const update=()=>setHash(location.hash);addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
 useEffect(()=>{document.documentElement.lang=hash===KINESIO||hash===GYNECO?'es':'en';},[hash]);
 if(hash===GYNECO)return <Suspense fallback={null}><GynecoMode/></Suspense>;
 return hash===KINESIO?<Suspense fallback={null}><KinesioMode/></Suspense>:<Home/>;
}
createRoot(document.getElementById('root')!).render(<App/>);

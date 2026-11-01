// Centreline of a tube-like mesh: geodesic diameter A→B over the mesh graph, bands of equal geodesic
// distance from A, one centroid + mean radius per band (only the band component the diameter crosses).
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

function adjacency(positions,indices){
 const n=positions.length/3,adj=Array.from({length:n},()=>new Map());
 const link=(a,b)=>{if(a===b)return;const d=Math.hypot(positions[a*3]-positions[b*3],positions[a*3+1]-positions[b*3+1],positions[a*3+2]-positions[b*3+2]);adj[a].set(b,d);adj[b].set(a,d);};
 for(let t=0;t<indices.length;t+=3){link(indices[t],indices[t+1]);link(indices[t+1],indices[t+2]);link(indices[t+2],indices[t]);}
 return adj;
}

// Small binary heap Dijkstra; returns dist and parent arrays.
function dijkstra(adj,src){
 const n=adj.length,d=new Float64Array(n).fill(Infinity),par=new Int32Array(n).fill(-1);
 const heap=[[0,src]];d[src]=0;
 const push=x=>{heap.push(x);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){let l=i*2+1,r=l+1,m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
 while(heap.length){const [dv,u]=pop();if(dv>d[u])continue;for(const [v,w] of adj[u]){const nd=dv+w;if(nd<d[v]){d[v]=nd;par[v]=u;push([nd,v]);}}}
 return {d,par};
}

/** positions: Float32Array (any unit), returns [{p:[x,y,z], r}] ordered from end A to end B, step = band width. */
export function extractCenterline(positions,indices,step){
 const adj=adjacency(positions,indices),n=adj.length;
 // restrict to the largest connected component reachable from vertex 0 region (meshes are single pieces)
 const first=dijkstra(adj,0);let a=0;for(let i=0;i<n;i++)if(first.d[i]<Infinity&&first.d[i]>first.d[a])a=i;
 const fromA=dijkstra(adj,a);let b=a;for(let i=0;i<n;i++)if(fromA.d[i]<Infinity&&fromA.d[i]>fromA.d[b])b=i;
 const onPath=new Set();for(let v=b;v!==-1;v=fromA.par[v])onPath.add(v);
 const nb=Math.max(2,Math.round(fromA.d[b]/step)),w=fromA.d[b]/nb;
 const band=new Int32Array(n).fill(-1);
 for(let i=0;i<n;i++)if(fromA.d[i]<Infinity)band[i]=Math.min(nb-1,Math.floor(fromA.d[i]/w));
 // component within a band containing a path vertex
 const keep=new Uint8Array(n);
 for(let k=0;k<nb;k++){}
 const seen=new Uint8Array(n);
 for(const s of onPath){if(seen[s])continue;const stack=[s];seen[s]=1;keep[s]=1;while(stack.length){const u=stack.pop();for(const v of adj[u].keys())if(!seen[v]&&band[v]===band[u]){seen[v]=1;keep[v]=1;stack.push(v);}}}
 const groups=Array.from({length:nb},()=>[]);for(let i=0;i<n;i++)if(keep[i])groups[band[i]].push(i);
 const pts=[];
 for(const g of groups){if(!g.length)continue;const c=[0,0,0];for(const i of g)for(let k=0;k<3;k++)c[k]+=positions[i*3+k]/g.length;pts.push({p:c,r:0,g});}
 for(let j=0;j<pts.length;j++){
  const prev=pts[Math.max(0,j-1)].p,next=pts[Math.min(pts.length-1,j+1)].p;let t=sub(next,prev);const tl=Math.hypot(...t)||1;t=t.map(x=>x/tl);
  let s=0;for(const i of pts[j].g){const d=[positions[i*3]-pts[j].p[0],positions[i*3+1]-pts[j].p[1],positions[i*3+2]-pts[j].p[2]];const al=d[0]*t[0]+d[1]*t[1]+d[2]*t[2];s+=Math.hypot(d[0]-al*t[0],d[1]-al*t[1],d[2]-al*t[2]);}
  pts[j].r=s/pts[j].g.length;
 }
 return pts.map(({p,r})=>({p,r}));
}

export const polylineLength=pts=>{let s=0;for(let i=1;i<pts.length;i++)s+=dist(pts[i-1],pts[i]);return s;};

/** Gaussian smoothing over sample index (ends keep their weight share), then resampling at constant arc length. */
export function smoothResample(pts,spacing,sigma=1.6){
 const n=pts.length,out=[];
 const rr=pts.map(q=>q.r),med=rr.map((_,i)=>{const w=[rr[Math.max(0,i-1)],rr[i],rr[Math.min(n-1,i+1)]].sort((a,b)=>a-b);return w[1];});
 for(let i=0;i<n;i++){let sw=0,p=[0,0,0],r=0;for(let j=Math.max(0,i-4);j<=Math.min(n-1,i+4);j++){const w=Math.exp(-((i-j)**2)/(2*sigma*sigma));sw+=w;for(let k=0;k<3;k++)p[k]+=w*pts[j].p[k];r+=w*med[j];}out.push({p:p.map(x=>x/sw),r:r/sw});}
 out[0]={p:[...pts[0].p],r:out[0].r};out[n-1]={p:[...pts[n-1].p],r:out[n-1].r};
 const cum=[0];for(let i=1;i<n;i++)cum.push(cum[i-1]+dist(out[i-1].p,out[i].p));
 const total=cum[n-1],m=Math.max(2,Math.round(total/spacing)+1),res=[];
 for(let s=0,j=0;s<m;s++){const t=total*s/(m-1);while(j<n-2&&cum[j+1]<t)j++;const f=(t-cum[j])/((cum[j+1]-cum[j])||1);res.push({p:[0,1,2].map(k=>out[j].p[k]+f*(out[j+1].p[k]-out[j].p[k])),r:out[j].r+f*(out[j+1].r-out[j].r)});}
 return res;
}

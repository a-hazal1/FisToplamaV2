(function(){
let cvPromise=null;
function loadCv(){
  if(cvPromise)return cvPromise;
  cvPromise=new Promise((resolve,reject)=>{
    const ready=async()=>{
      try{
        let c=window.cv;
        if(c&&typeof c.then==='function'){c=await c;window.cv=c;}
        const start=Date.now();
        while((!c||typeof c.Mat!=='function')&&Date.now()-start<30000){await new Promise(r=>setTimeout(r,100));c=window.cv;if(c&&typeof c.then==='function'){c=await c;window.cv=c;}}
        if(!c||typeof c.Mat!=='function')throw new Error('OPENCV_RUNTIME_TIMEOUT');
        resolve(c);
      }catch(e){reject(e);}
    };
    if(window.cv){ready();return;}
    let s=document.querySelector('script[data-fistoplama-opencv]');
    if(!s){s=document.createElement('script');s.src='opencv.js';s.async=true;s.dataset.fistoplamaOpencv='1';document.head.appendChild(s);}
    s.addEventListener('load',ready,{once:true});
    s.addEventListener('error',()=>reject(new Error('OPENCV_SCRIPT_LOAD_FAILED')),{once:true});
  });
  return cvPromise.catch(e=>{cvPromise=null;throw e;});
}
function order(p){const s=p.map(x=>x[0]+x[1]),d=p.map(x=>x[0]-x[1]);return[p[s.indexOf(Math.min(...s))],p[d.indexOf(Math.max(...d))],p[s.indexOf(Math.max(...s))],p[d.indexOf(Math.min(...d))]];}
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function bytes(canvas){return new Promise((resolve,reject)=>canvas.toBlob(async b=>{if(!b)return reject(new Error('OUTPUT_BLOB_FAILED'));resolve(Array.from(new Uint8Array(await b.arrayBuffer())));},'image/jpeg',0.94));}
async function process(raw){
  const cv=await loadCv(); const bitmap=await createImageBitmap(new Blob([Uint8Array.from(raw)]));
  const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,w,h);bitmap.close();
  const src=cv.imread(canvas),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),contours=new cv.MatVector(),hier=new cv.Mat();
  let best=null,bestArea=0; const imageArea=w*h;
  try{
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);cv.Canny(blur,edges,35,135);
    const k=cv.Mat.ones(3,3,cv.CV_8U);cv.dilate(edges,edges,k,new cv.Point(-1,-1),2);k.delete();
    cv.findContours(edges,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    for(let i=0;i<contours.size();i++){const cnt=contours.get(i);try{const area=Math.abs(cv.contourArea(cnt));if(area<imageArea*.015||area<=bestArea)continue;const peri=cv.arcLength(cnt,true);for(const er of [.01,.015,.02,.025,.03,.04,.05]){const ap=new cv.Mat();try{cv.approxPolyDP(cnt,ap,er*peri,true);if(ap.rows===4&&cv.isContourConvex(ap)){const pts=[];for(let r=0;r<4;r++){const q=ap.intPtr(r,0);pts.push([q[0],q[1]]);}best=pts;bestArea=area;break;}}finally{ap.delete();}}}finally{cnt.delete();}}
    if(!best)throw new Error('NO_DOCUMENT'); const [tl,tr,br,bl]=order(best); const ow=Math.max(220,Math.round(Math.max(dist(br,bl),dist(tr,tl)))),oh=Math.max(320,Math.round(Math.max(dist(tr,br),dist(tl,bl))));
    const sp=cv.matFromArray(4,1,cv.CV_32FC2,[tl[0],tl[1],tr[0],tr[1],br[0],br[1],bl[0],bl[1]]),dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,ow-1,0,ow-1,oh-1,0,oh-1]),M=cv.getPerspectiveTransform(sp,dp),warped=new cv.Mat();
    try{cv.warpPerspective(src,warped,M,new cv.Size(ow,oh),cv.INTER_LINEAR,cv.BORDER_REPLICATE,new cv.Scalar());const g=new cv.Mat(),fin=new cv.Mat();try{cv.cvtColor(warped,g,cv.COLOR_RGBA2GRAY);cv.equalizeHist(g,g);cv.cvtColor(g,fin,cv.COLOR_GRAY2RGBA);const out=document.createElement('canvas');out.width=ow;out.height=oh;cv.imshow(out,fin);return{bytes:await bytes(out),confidence:Math.min(1,bestArea/imageArea)};}finally{g.delete();fin.delete();}}finally{sp.delete();dp.delete();M.delete();warped.delete();}
  }finally{src.delete();gray.delete();blur.delete();edges.delete();contours.delete();hier.delete();}
}
window.receiptScanner={scan(raw,ok,err){process(raw).then(r=>ok(r.bytes,r.confidence)).catch(e=>{console.error(e);err(e&&e.message?e.message:String(e));});}};
})();

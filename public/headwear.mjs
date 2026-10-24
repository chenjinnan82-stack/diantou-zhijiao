import { foodSVG, foodKind } from './art.mjs';
export function headwearSVG(name) {
  const kind=foodKind(name), yellow='#E8C547', orange='#D88443', green='#70A58B', paper='#F4F0E4';
  let shape;
  if(['burger','muffin','fishburger','cheeseburger'].includes(kind)) shape=`<path d="M20 94C13 5 221 1 222 94Z" fill="${kind==='muffin'?paper:yellow}"/><path d="m48 56 6-5m28-13 5 4m32-15 4 6m28 1 7-3m26 21 6 2"/><path d="M19 94q13-12 26 0t26 0 26 0 26 0 26 0 26 0 26 0l18 9-3 21H22Z" fill="${green}"/><path d="m21 120 196-1-3 32-190 1Z" fill="#986445"/><path d="m22 151 46-5 35 17 34-17 79 6-2 22H25Z" fill="${yellow}"/><path d="M24 174h190q4 53-94 52-99-1-96-52Z" fill="${orange}"/>`;
  else if(kind==='fries') shape=`<path d="m35 119-9-86 21-3 13 89m2-1L62 11h23l4 110m8 1L103 5l23 3-5 115m12-1 15-105 23 4-14 106m8-2 25-87 22 6-21 88" fill="${yellow}"/><path d="m17 96 22 121q83 20 164-1l24-117-51 20-54-18-53 20Z" fill="${orange}"/><path d="m40 139 13 58m144-59-12 59"/>`;
  else if(['drink','coffee','water','milk','juice'].includes(kind)) shape=`<path d="m28 68 19 155 148-1 19-155Z" fill="${kind==='coffee'?orange:'#B69ACA'}"/><path d="m39 109 164-2-10 77-145 2Z" fill="${paper}"/><path d="m120 65 11-48 53-10 4 15-43 11-8 33Z" fill="${green}"/><path d="m20 62 201-1 4 22-207 2Z" fill="${paper}"/>`;
  else {
    // Other foods retain their existing outline, expanded to leave a real face opening.
    const body=foodSVG(kind).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
    shape=`<g transform="translate(-48 -48) scale(1.4)">${body}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" fill="none" stroke="#25231F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><defs><mask id="face"><rect width="240" height="240" fill="white" stroke="none"/><ellipse cx="120" cy="135" rx="54" ry="67" fill="black" stroke="none"/></mask></defs><g mask="url(#face)">${shape}</g><ellipse cx="120" cy="135" rx="55" ry="68" stroke="#25231F"/></svg>`;
}
export function photoTransform(sw,sh,w,h,fit,zoom,ox,oy){
 const scale=(fit?Math.min(w/sw,h/sh):Math.max(w/sw,h/sh))*zoom;
 const clamp=(v,max)=>Math.max(-max,Math.min(max,v));
 const x=clamp(ox,Math.abs(w-sw*scale)/2),y=clamp(oy,Math.abs(h-sh*scale)/2);
 return {scale,x:(w-sw*scale)/2+x,y:(h-sh*scale)/2+y,ox:x,oy:y};
}

// Points use source-image pixels so gestures remain stable through photo zoom/crop.
export function moveHeadwear(hat,start,now,width,height){
 const mid=points=>points.reduce((p,q)=>({x:p.x+q.x/points.length,y:p.y+q.y/points.length}),{x:0,y:0});
 const a=mid(start),b=mid(now);let ratio=1,turn=0;
 if(start.length===2&&now.length===2){
  const dx=start[1].x-start[0].x,dy=start[1].y-start[0].y,d=Math.hypot(dx,dy);
  if(d<4)return {...hat};
  ratio=Math.max(.1,Math.min(1.5,hat.size*Math.hypot(now[1].x-now[0].x,now[1].y-now[0].y)/d))/hat.size;
  turn=Math.atan2(now[1].y-now[0].y,now[1].x-now[0].x)-Math.atan2(dy,dx);
 }
 const x=hat.x*width-a.x,y=hat.y*height-a.y;
 return {...hat,x:(b.x+ratio*(x*Math.cos(turn)-y*Math.sin(turn)))/width,y:(b.y+ratio*(x*Math.sin(turn)+y*Math.cos(turn)))/height,size:hat.size*ratio,angle:((hat.angle+turn*180/Math.PI+540)%360)-180};
}
export function hitHeadwear(hat,point,width,height){
 if(!hat.visible)return false;
 const angle=-hat.angle*Math.PI/180,dx=point.x-hat.x*width,dy=point.y-hat.y*height,size=hat.size*width;
 const x=dx*Math.cos(angle)-dy*Math.sin(angle),y=dx*Math.sin(angle)+dy*Math.cos(angle);
 return Math.abs(x)<=size/2&&y>=-size*135/240&&y<=size*105/240;
}

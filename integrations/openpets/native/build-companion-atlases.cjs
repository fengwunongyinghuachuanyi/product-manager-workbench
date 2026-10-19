const path=require('node:path'),fs=require('node:fs');
const root=process.cwd(),sharp=require(path.join(root,'node_modules/sharp'));
const mod=path.join(root,'../integrations/openpets'),source=path.join(mod,'independent-source');
const {clips}=require(path.join(source,'src/renderer/motion.js'));
(async()=>{
 const small={};
 const names=new Set(Object.values(clips).map(x=>x.atlas==='legacy'?'actions':x.atlas));names.add('expressions');
 for(const name of names){
  const file=path.join(source,'assets/whale',name+'.png'),meta=await sharp(file).metadata(),cols=name==='idle-front'?2:4,rows=meta.height/(meta.width/cols);
  small[name]={buffer:await sharp(file).resize(cols*192,Math.round(rows*192)).png().toBuffer(),cols};
 }
 const reactions=[];
 for(const [name,c] of Object.entries(clips)){
  if(['drag','fall','land','story-recover','idle'].includes(name))continue;
  const frames=[];
  for(let i=0;i<c.frames.length;i++){
   let atlas=c.atlas,index=c.frames[i];if(atlas==='legacy'){atlas=index>=16?'expressions':'actions';index%=16;}
   const a=small[atlas];let pipeline=sharp(a.buffer).extract({left:index%a.cols*192,top:Math.floor(index/a.cols)*192,width:192,height:192});
   if(name==='left')pipeline=pipeline.flop();
   frames.push({input:await pipeline.extend({top:8,bottom:8,left:0,right:0,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer(),left:i*192,top:0});
  }
  const dest=path.join(mod,'pets/deepseek/companion',name+'.png');
  await sharp({create:{width:frames.length*192,height:208,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames).png().toFile(dest);
  // Preserve the source canvas; register companion feet with the base atlas.
  reactions.push({kind:name,spritesheetPath:'companion/'+name+'.png',row:0,frameCount:frames.length,frameDurationsMilliseconds:c.times,loop:c.loop,hold:c.hold,verticalOffsetPixels:-8,...(name==='happy'?{motion:'affection'}:{})});
 }
 const petfile=path.join(mod,'pets/deepseek/pet.json'),pet=JSON.parse(fs.readFileSync(petfile));pet.reactionAnimations=reactions;fs.writeFileSync(petfile,JSON.stringify(pet,null,2)+'\n');
 console.log('Built',reactions.length,'companion reactions from original atlases.');
})().catch(e=>{console.error(e);process.exit(1)});

// Keep Twilio's playback queue small and retain enough state to discard stale speech.
export class VoicePlayback {
 constructor(send,streamSid){
  this.send=send;this.streamSid=streamSid;this.pending=Buffer.alloc(0);this.marks=new Map();this.markIndex=0;
  this.maxPendingMs=0;this.sentFrames=0;this.playedFrames=0;this.clearedFrames=0;this.clearedPendingMs=0;this.markLatencyTotalMs=0;
 }
 get pendingMs(){return this.pending.length/8}
 get queuedMs(){return this.marks.size*20}
 append(base64){
  this.pending=Buffer.concat([this.pending,Buffer.from(base64,'base64')]);
  this.maxPendingMs=Math.max(this.maxPendingMs,this.pendingMs);
  return this.pending.length<=80000;
 }
 tick(now=Date.now()){
  if(!this.pending.length||this.marks.size>=10)return false;
  const frame=this.pending.subarray(0,160);this.pending=this.pending.subarray(frame.length);
  const name=String(++this.markIndex);this.marks.set(name,{sentAt:now,cleared:false});this.sentFrames++;
  this.send({event:'media',streamSid:this.streamSid,media:{payload:frame.toString('base64')}});
  this.send({event:'mark',streamSid:this.streamSid,mark:{name}});
  return true;
 }
 clear(){
  if(!this.pending.length&&!this.marks.size)return null;
  const removed={pendingMs:this.pendingMs,twilioQueuedMs:this.queuedMs};
  this.clearedPendingMs+=removed.pendingMs;this.pending=Buffer.alloc(0);
  for(const mark of this.marks.values())mark.cleared=true;
  this.send({event:'clear',streamSid:this.streamSid});
  return removed;
 }
 acknowledge(name,now=Date.now()){
  const mark=this.marks.get(name);if(!mark)return false;
  this.marks.delete(name);
  if(mark.cleared)this.clearedFrames++;
  else{this.playedFrames++;this.markLatencyTotalMs+=now-mark.sentAt}
  return !mark.cleared;
 }
 summary(){return {maxPendingMs:Math.round(this.maxPendingMs),sentFrames:this.sentFrames,playedFrames:this.playedFrames,clearedFrames:this.clearedFrames,clearedPendingMs:Math.round(this.clearedPendingMs),averageMarkMs:this.playedFrames?Math.round(this.markLatencyTotalMs/this.playedFrames):null}}
}

// Transcript fragments can arrive late; clear only when they describe recent
// caller speech during playback, and avoid reacting repeatedly to one utterance.
export function shouldClearForTranscript({delta,endMs,elapsedMs,pendingMs,queuedMs,sinceLastClearMs,ending=false}){
 return !ending&&typeof delta==='string'&&delta.trim().length>0&&Number.isFinite(endMs)&&Number.isFinite(elapsedMs)&&
  endMs>=elapsedMs-2500&&endMs<=elapsedMs+1000&&(pendingMs>0||queuedMs>0)&&sinceLastClearMs>=800;
}

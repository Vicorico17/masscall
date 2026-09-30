const clean=(value,max)=>String(value??'').trim().slice(0,max);
export function normalizeCallPlan(value={}){
 const branches=Array.isArray(value.branches)?value.branches.map(branch=>({when:clean(branch?.when,180),then:clean(branch?.then,500)})).filter(branch=>branch.when&&branch.then).slice(0,6):[];
 return {
  category:clean(value.category,80),
  company:clean(value.company,100),
  role:clean(value.role,100),
  personNotes:clean(value.personNotes,1000),
  templateName:clean(value.templateName,100),
  opening:clean(value.opening,600),
  talkingPoints:clean(value.talkingPoints,1600),
  closing:clean(value.closing,600),
  completionTrigger:clean(value.completionTrigger,600),
  branches
 };
}
export function callPlanInstructions(value={}){
 const plan=normalizeCallPlan(value),lines=[];
 if(plan.category)lines.push(`Target category: ${plan.category}.`);
 if(plan.company)lines.push(`Person's company: ${plan.company}.`);
 if(plan.role)lines.push(`Person's role: ${plan.role}.`);
 if(plan.personNotes)lines.push(`Relevant context about this person: ${plan.personNotes}`);
 if(plan.templateName)lines.push(`Call template: ${plan.templateName}.`);
 if(plan.opening)lines.push(`Opening guidance: ${plan.opening}`);
 if(plan.talkingPoints)lines.push(`Conversation focus: ${plan.talkingPoints}`);
 if(plan.closing)lines.push(`Closing guidance: ${plan.closing}`);
 if(plan.completionTrigger)lines.push(`Complete this call objective only when this condition is met: ${plan.completionTrigger}`);
 if(plan.branches.length){lines.push('Follow these conditional conversation paths when they fit; after handling one, return to the main call objective unless the condition ends the call:');for(const [index,branch] of plan.branches.entries())lines.push(`${index+1}. If ${branch.when}: ${branch.then}`)}
 return lines.length?`\n\nCall plan for this person:\n${lines.join('\n')}`:'';
}

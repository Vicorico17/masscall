const clean=(value,max)=>String(value??'').trim().slice(0,max);
export function normalizeCallPlan(value={}){
 return {
  category:clean(value.category,80),
  company:clean(value.company,100),
  role:clean(value.role,100),
  personNotes:clean(value.personNotes,1000),
  templateName:clean(value.templateName,100),
  opening:clean(value.opening,600),
  talkingPoints:clean(value.talkingPoints,1600),
  closing:clean(value.closing,600),
  completionTrigger:clean(value.completionTrigger,600)
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
 return lines.length?`\n\nCall plan for this person:\n${lines.join('\n')}`:'';
}

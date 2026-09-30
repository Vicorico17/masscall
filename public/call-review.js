export const callReviewResults=[
 {id:'goal_met',label:'Goal achieved'},
 {id:'follow_up',label:'Follow-up agreed'},
 {id:'not_interested',label:'Not interested'},
 {id:'no_answer',label:'No answer'},
 {id:'wrong_number',label:'Wrong number'},
 {id:'other',label:'Other'}
];
const resultIds=new Set(callReviewResults.map(result=>result.id));
export function normalizeCallReview(value={}){
 const followUpAt=String(value.followUpAt||'');
 const parsedDate=new Date(followUpAt+'T00:00:00Z');
 return {
  result:resultIds.has(value.result)?value.result:'',
  nextStep:String(value.nextStep||'').trim().slice(0,400),
  followUpAt:/^\d{4}-\d{2}-\d{2}$/.test(followUpAt)&&!Number.isNaN(parsedDate.getTime())&&parsedDate.toISOString().slice(0,10)===followUpAt?followUpAt:'',
  notes:String(value.notes||'').trim().slice(0,1000),
  reviewedAt:String(value.reviewedAt||new Date().toISOString()).slice(0,40)
 };
}

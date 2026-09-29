import {createHmac} from 'node:crypto';
import {equal} from './telephony.js';

export function verifyStreamSignature(url,authToken,signature){
 const websocketURL=new URL(url).href;
 const candidates=[websocketURL,websocketURL.replace(/^wss:/,'https:')].flatMap(value=>[value,`${value}/`]);
 return candidates.some(candidate=>{
  const expected=createHmac('sha1',authToken).update(candidate).digest('base64');
  return equal(signature,expected);
 });
}

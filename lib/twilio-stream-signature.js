import {createHmac} from 'node:crypto';
import {equal} from './telephony.js';

export function verifyStreamSignature(url,authToken,signature){
 const signedURL=new URL(url).href.replace(/^wss:/,'https:');
 return [signedURL,`${signedURL}/`].some(candidate=>{
  const expected=createHmac('sha1',authToken).update(candidate).digest('base64');
  return equal(signature,expected);
 });
}

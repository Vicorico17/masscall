import {config,json} from '../lib/telephony.js';
export default function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});json(res,200,config())}

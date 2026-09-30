import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import config from './api/config.js';
import telephony from './api/telephony.js';
import demo from './api/demo.js';
import studio from './api/studio.js';
import rehearsal from './api/rehearsal.js';
import campaigns from './api/campaigns.js';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/config')return config(req,res);
 if(url.pathname==='/api/telephony')return telephony(req,res);
 if(url.pathname==='/api/demo')return demo(req,res);
 if(url.pathname==='/api/studio')return studio(req,res);
 if(url.pathname==='/api/rehearsal')return rehearsal(req,res);
 if(url.pathname==='/api/campaigns')return campaigns(req,res);
 if(url.pathname.startsWith('/api/')){res.writeHead(404);return res.end('Not found')}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 if(['/studio','/studio/','/studio.html','/demo.html','/dashboard.html'].includes(url.pathname)){const destination=url.pathname.startsWith('/studio')?'/dashboard':url.pathname==='/dashboard.html'?'/dashboard':'/';res.writeHead(308,{Location:destination});return res.end()}
 let pathname;try{pathname=decodeURIComponent(url.pathname)}catch{res.writeHead(400);return res.end()}
 const file=path.resolve(root,'.'+(pathname==='/'?'/demo.html':pathname==='/dashboard'?'/dashboard.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end()}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end('Not found')};res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data)})
});
server.listen(process.env.PORT||3000,()=>console.log('Masscall listening on port '+(process.env.PORT||3000)));

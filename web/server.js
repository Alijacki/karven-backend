import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const mime = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.svg':'image/svg+xml',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.ico':'image/x-icon'
};

function send(res,status,body,type='text/plain; charset=utf-8'){
  res.writeHead(status,{
    'content-type':type,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'strict-origin-when-cross-origin'
  });
  res.end(body);
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/', 'http://localhost');
    if(url.pathname==='/healthz') return send(res,200,JSON.stringify({service:'KARVEN Web',status:'ok'}),'application/json; charset=utf-8');

    if(url.pathname==='/runtime-config.js'){
      const cfg={
        apiUrl:process.env.KARVEN_API_URL || 'https://karven-backend-production.up.railway.app',
        adminUrl:process.env.KARVEN_ADMIN_URL || 'https://karven-admin-8kzjxw.v2.appdeploy.ai/'
      };
      return send(res,200,`window.KARVEN_RUNTIME=${JSON.stringify(cfg)};`,'application/javascript; charset=utf-8');
    }

    let path=url.pathname==='/'?'/index.html':url.pathname;
    path=normalize(path).replace(/^([.][.][/\\])+/, '');
    let file=join(root,path);
    if(!file.startsWith(root)) return send(res,403,'Forbidden');

    try{
      const data=await readFile(file);
      res.writeHead(200,{
        'content-type':mime[extname(file)]||'application/octet-stream',
        'cache-control':extname(file)==='.html'?'no-store':'public, max-age=300',
        'x-content-type-options':'nosniff',
        'x-frame-options':'DENY',
        'referrer-policy':'strict-origin-when-cross-origin',
        'content-security-policy':"default-src 'self'; connect-src 'self' https://karven-backend-production.up.railway.app; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      });
      return res.end(data);
    }catch{
      const html=await readFile(join(root,'index.html'));
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      return res.end(html);
    }
  }catch(err){
    console.error(err);
    return send(res,500,'Internal Server Error');
  }
});

server.listen(port,host,()=>console.log(`KARVEN Web listening on http://${host}:${port}`));

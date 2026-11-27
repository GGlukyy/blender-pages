(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))o(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const c of i.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&o(c)}).observe(document,{childList:!0,subtree:!0});function n(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function o(r){if(r.ep)return;r.ep=!0;const i=n(r);fetch(r.href,i)}})();const Un="/tmp/mcp_in.json",tt="/tmp/mcp_out.json",ft="/tmp/mcp_ctl.json",Ct="/tmp/mcp_status.json";function rn(e,t){if(!e||!t)return{error:"URL and token are required"};let n;try{n=new URL(e)}catch{return{error:"invalid URL"}}return!(n.protocol==="ws:"&&(n.hostname==="127.0.0.1"||n.hostname==="localhost"))&&n.protocol!=="wss:"?{error:"only ws://localhost or wss:// allowed"}:{url:n.toString(),token:t}}function zn(e){const t=rn(e.get("mcp"),e.get("mcptoken"));return t.error?(e.get("mcp")&&console.warn("MCP: "+t.error),null):t}const sn=String.raw`
import bpy, os, json, io, contextlib, traceback
_IN, _OUT = '/tmp/mcp_in.json', '/tmp/mcp_out.json'
_ns = {'bpy': bpy, '__name__': 'mcp_exec'}
def _obj_info(o):
    d = {'name': o.name, 'type': o.type, 'location': list(o.location), 'rotation_euler': list(o.rotation_euler),
         'scale': list(o.scale), 'dimensions': list(o.dimensions), 'visible': o.visible_get(),
         'parent': o.parent.name if o.parent else None,
         'materials': [s.material.name for s in o.material_slots if s.material]}
    if o.type == 'MESH':
        m = o.data
        d['mesh'] = {'vertices': len(m.vertices), 'edges': len(m.edges), 'polygons': len(m.polygons)}
    return d
def _handle(cmd, p):
    if cmd == 'get_scene_info':
        sc = bpy.context.scene
        return {'name': sc.name, 'frame': sc.frame_current, 'object_count': len(sc.objects),
                'active_object': bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None,
                'objects': [{'name': o.name, 'type': o.type, 'location': [round(v, 3) for v in o.location]} for o in list(sc.objects)[:50]]}
    if cmd == 'get_object_info':
        o = bpy.data.objects.get(p['name'])
        if o is None: raise ValueError('Object not found: ' + p['name'])
        return _obj_info(o)
    if cmd == 'execute_blender_code':
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            exec(p['code'], _ns)
        return buf.getvalue()
    raise ValueError('unknown command ' + cmd)
def _mcp_tick():
    if os.path.exists(_IN):
        try:
            with open(_IN) as f: req = json.load(f)
            os.remove(_IN)
            try: res = {'result': _handle(req['cmd'], req.get('params') or {})}
            except Exception: res = {'error': traceback.format_exc(limit=3)}
            with open(_OUT + '.tmp', 'w') as f: json.dump(res, f)
            os.replace(_OUT + '.tmp', _OUT)
        except Exception as e: print('MCP tick error', e)
    return 0.15
`,In=String.raw`
bpy.app.timers.register(_mcp_tick, first_interval=1.0, persistent=True)
print('MCP python ready')
`,Nn=String.raw`bl_info = {"name": "Blender Web MCP", "author": "blender-wasm", "version": (0, 1, 0), "blender": (5, 0, 0),
            "category": "System", "description": "Let an AI client (Claude etc.) drive this browser Blender through a local relay"}
`,Dn=String.raw`
_CTL, _ST = '/tmp/mcp_ctl.json', '/tmp/mcp_status.json'
def _status():
    try:
        with open(_ST) as f: return json.load(f)
    except Exception: return {'state': 'off', 'msg': ''}
def _send(d):
    with open(_CTL + '.tmp', 'w') as f: json.dump(d, f)
    os.replace(_CTL + '.tmp', _CTL)
class WebMCPPrefs(bpy.types.AddonPreferences):
    bl_idname = __name__
    url: bpy.props.StringProperty(name='Relay URL', default='ws://127.0.0.1:8765')
    token: bpy.props.StringProperty(name='Token', subtype='PASSWORD')
    def draw(self, context):
        l = self.layout; st = _status()
        l.prop(self, 'url'); l.prop(self, 'token')
        row = l.row(); row.operator('webmcp.connect', icon='LINKED'); row.operator('webmcp.disconnect', icon='UNLINKED')
        l.label(text='Status: ' + st.get('state', 'off') + ((' - ' + st['msg']) if st.get('msg') else ''))
        b = l.box()
        b.label(text='1. On your PC run:  node mcp/relay.mjs  (prints the URL and a token)')
        b.label(text='2. Paste URL + token here and press Connect (only ws://localhost or wss:// is allowed)')
        b.label(text='3. Add the relay as an MCP server in your AI client')
        b.label(text='Warning: the AI client can run any Python in this Blender. Keep the token secret.', icon='ERROR')
class WEBMCP_OT_connect(bpy.types.Operator):
    bl_idname = 'webmcp.connect'; bl_label = 'Connect'
    def execute(self, context):
        p = context.preferences.addons[__name__].preferences
        _send({'action': 'connect', 'url': p.url, 'token': p.token})
        return {'FINISHED'}
class WEBMCP_OT_disconnect(bpy.types.Operator):
    bl_idname = 'webmcp.disconnect'; bl_label = 'Disconnect'
    def execute(self, context):
        _send({'action': 'disconnect'})
        return {'FINISHED'}
_last = [None]
def _ui_tick():
    st = _status()
    if st != _last[0]:
        _last[0] = st
        for w in bpy.context.window_manager.windows:
            for a in w.screen.areas: a.tag_redraw()
    return 1.0
_classes = (WebMCPPrefs, WEBMCP_OT_connect, WEBMCP_OT_disconnect)
def register():
    for c in _classes: bpy.utils.register_class(c)
    bpy.app.timers.register(_mcp_tick, first_interval=1.0, persistent=True)
    bpy.app.timers.register(_ui_tick, first_interval=1.0, persistent=True)
def unregister():
    try: _send({'action': 'disconnect'})
    except Exception: pass
    for f in (_mcp_tick, _ui_tick):
        if bpy.app.timers.is_registered(f): bpy.app.timers.unregister(f)
    for c in reversed(_classes): bpy.utils.unregister_class(c)
`,jn="blender_web_mcp.py",Fn=`import bpy, os, json, sys
try:
    _d = bpy.utils.user_resource('SCRIPTS', path='addons', create=True)
    with open(os.path.join(_d, ${JSON.stringify(jn)}), 'w') as _f: _f.write(json.loads(${JSON.stringify(JSON.stringify(Nn+sn+Dn))}))
    if _d not in sys.path: sys.path.append(_d)
except Exception as _e: print('MCP add-on install failed', _e)
`;function Kn(e){return[...e?["--python-expr",sn+In]:[],"--python-expr",Fn]}function Wn(e,t,n){const o=()=>window.Module&&window.Module.FS;let r=Promise.resolve();const i=g=>new Promise(A=>setTimeout(A,g)),c=async(g,A)=>{const B=o();try{B.unlink(tt)}catch{}B.writeFile(Un,JSON.stringify({cmd:g,params:A}));for(let K=0;K<400;K++)if(await i(150),B.analyzePath(tt).exists){const te=JSON.parse(new TextDecoder().decode(B.readFile(tt)));if(B.unlink(tt),te.error)throw new Error(te.error);return te.result}throw new Error("Blender Python did not answer")},d=g=>new Promise((A,B)=>requestAnimationFrame(async()=>{try{const K=await createImageBitmap(t),te=Math.min(1,g/Math.max(K.width,K.height)),X=document.createElement("canvas");X.width=Math.round(K.width*te),X.height=Math.round(K.height*te),X.getContext("2d").drawImage(K,0,0,X.width,X.height),A({png_base64:X.toDataURL("image/png").split(",")[1],width:X.width,height:X.height})}catch(K){B(K)}}));let _=null,m=null,y=null;const w=(g,A="")=>{try{try{o().unlink(Ct)}catch{}o().writeFile(Ct,JSON.stringify({state:g,msg:A}))}catch{}},b=()=>{if(!_)return;w("connecting");const g=new WebSocket(_.url+(_.url.includes("?")?"&":"?")+"token="+encodeURIComponent(_.token));m=g,g.onopen=()=>{w("connected"),n("MCP: connected to relay")},g.onerror=()=>{m===g&&w("error","relay not reachable or wrong token (retrying)")},g.onclose=()=>{m===g&&(m=null,_&&(y=setTimeout(b,3e3)))},g.onmessage=A=>{const B=JSON.parse(A.data);r=r.then(async()=>{try{const K=B.cmd==="get_viewport_screenshot"?await d(B.params.max_size):await c(B.cmd,B.params);g.send(JSON.stringify({id:B.id,result:K}))}catch(K){g.send(JSON.stringify({id:B.id,error:String(K.message||K)}))}})}},E=()=>{_=null,clearTimeout(y);const g=m;if(m=null,g)try{g.close()}catch{}w("off")},L=g=>{E(),_=g,b()};return setInterval(()=>{const g=o();if(!g||!g.analyzePath(ft).exists)return;let A;try{A=JSON.parse(new TextDecoder().decode(g.readFile(ft))),g.unlink(ft)}catch{return}if(A.action==="disconnect")E();else if(A.action==="connect"){const B=rn(A.url,A.token);B.error?(E(),w("error",B.error)):L(B)}},500),e&&L(e),{connect:L,disconnect:E}}const Bt=350,Ut=8,Gn=500,Hn=6,zt=10,$n=60,Vn=120,qn=210;function Yn(e){const t=new URLSearchParams(location.search),n={shift:!1,ctrl:!1,alt:!1};let o=()=>{};const r=new Map;window.__touchDebug=()=>({mode:p,pointers:[...r.keys()],modalArmed:d});let i="mouse";for(const a of["pointerdown","pointermove"])addEventListener(a,s=>{i=s.pointerType,s.pointerType!=="mouse"&&document.pointerLockElement&&document.exitPointerLock()},!0);const c=Element.prototype.requestPointerLock;c&&(Element.prototype.requestPointerLock=function(...a){if(i==="mouse")try{const s=c.apply(this,a);return s&&s.catch&&s.catch(()=>{}),s}catch{return}});let d=!1,_=!1,m=1,y=!1;window.addEventListener("keydown",a=>{!a.isTrusted||a.ctrlKey||a.metaKey||a.altKey||(a.code==="Escape"||a.code==="Enter"?y=!1:/^Key[FGRSE]$/.test(a.code)&&!/^(INPUT|TEXTAREA)$/.test(a.target.tagName||"")&&(y=!0))},!0);let w=0,b=0;e.addEventListener("mousemove",a=>{a.isTrusted&&(w=a.clientX,b=a.clientY)},!0);let E=!1,L=null;const g=t.has("movecap")?+t.get("movecap"):33;let A=null,B=0,K=0;const te=()=>{if(B=0,!A)return;const a=A;A=null,K=performance.now(),P("mousemove",a.x,a.y,0,a.buttons,{},!0)},X=(a,s,l)=>{if(!g){P("mousemove",a,s,0,l);return}A={x:a,y:s,buttons:l},B||(B=setTimeout(te,Math.max(0,g-(performance.now()-K))))};let Ee=null,ke=0;const De=()=>{clearTimeout(ke),ke=0;const a=Ee;Ee=null,a&&P("mousemove",a.x,a.y,0,a.buttons,{},!1,!0)},P=(a,s,l,x,M,R={},U=!1,ie=!1)=>{if(A&&!U&&(clearTimeout(B),B=0,a==="mousemove"?A=null:te()),ke&&!ie){if(a==="mousemove"){Ee={x:s,y:l,buttons:M};return}De()}w=s,b=l,e.dispatchEvent(new MouseEvent(a,{bubbles:!0,cancelable:!0,view:window,clientX:s,clientY:l,button:x,buttons:M,shiftKey:!E&&n.shift||!!R.shift,ctrlKey:!E&&n.ctrl||!!R.ctrl,altKey:!E&&n.alt}))},Te=(a,s,l)=>{P("mousemove",a,s,0,0),setTimeout(()=>P("mousedown",a,s,l,1<<l),20),setTimeout(()=>P("mouseup",a,s,l,0),90)},u=(a,s)=>{const l=window.Module&&window.Module._blender_web_pen;l&&l(a?1:0,a&&s.pressure||0,(s.tiltX||0)/90,(s.tiltY||0)/90)},C=(a,s)=>{const l=window.Module;if(!l||!l._blender_web_viewport_rects||!l.HEAPU8)return!0;const x=new Int32Array(l.HEAPU8.buffer,l._blender_web_viewport_rects(),33),M=x[0];if(M===0)return!0;if(l._blender_web_viewport_holes){const R=new Int32Array(l.HEAPU8.buffer,l._blender_web_viewport_holes(),33);for(let U=0;U<R[0];U++)if(a>=R[1+4*U]&&s>=R[2+4*U]&&a<=R[3+4*U]&&s<=R[4+4*U])return!1}for(let R=0;R<M;R++)if(a>=x[1+4*R]&&s>=x[2+4*R]&&a<=x[3+4*R]&&s<=x[4+4*R])return!0;return!1};let T="view",p="idle",V=0,me=!1,f=null;const ne=()=>{const a=[...r.values()];return{x:a.reduce((s,l)=>s+l.x,0)/a.length,y:a.reduce((s,l)=>s+l.y,0)/a.length}},H=()=>{const[a,s]=[...r.values()];return Math.hypot(a.x-s.x,a.y-s.y)},oe=()=>{if(f&&f.kind){const a=f.kind==="zoom"?{ctrl:!0}:{shift:T==="view"};P("mouseup",f.ax,f.ay,1,0,a),P("mousemove",f.ax,f.ay,0,0)}f=null};e.addEventListener("pointerdown",a=>{if(a.pointerType==="mouse")return;if(a.preventDefault(),e.setPointerCapture(a.pointerId),r.set(a.pointerId,{x:a.clientX,y:a.clientY,type:a.pointerType,x0:a.clientX,y0:a.clientY,t0:performance.now()}),a.pointerType==="pen"&&(y||d)&&!_&&C(a.clientX,a.clientY)){p="penmodal",u(!0,a),P("mousemove",a.clientX,a.clientY,0,0);return}if(a.pointerType==="pen"){p="pen",u(!0,a),P("mousemove",a.clientX,a.clientY,0,0),P("mousedown",a.clientX,a.clientY,a.button>0?a.button:0,1<<(a.button>0?a.button:0));return}const s=[...r.values()].filter(l=>l.type==="touch");if(s.length===1&&p==="idle"&&d&&C(a.clientX,a.clientY)){p="pad",E=!0,L={bx:w,by:b,px:a.clientX,py:a.clientY,down:!1},_&&(P("mousemove",w,b,0,0),L.down=!0,setTimeout(()=>{p==="pad"&&P("mousedown",w,b,0,1)},20));return}if(s.length===1&&p==="idle")p="pending",me=!1,T=C(a.clientX,a.clientY)?"view":"ui",T==="view"&&(P("mousemove",a.clientX,a.clientY,0,0),setTimeout(()=>{p==="pending"&&P("mousemove",a.clientX,a.clientY,0,0)},35)),clearTimeout(V),V=setTimeout(()=>{const l=[...r.values()][0];p==="pending"&&l&&(me=!0,Te(l.x,l.y,2))},Gn);else if(s.length===2&&(p==="pending"||p==="orbit"||p==="uidrag")){if(clearTimeout(V),p==="orbit"||p==="uidrag"){const x=[...r.values()][0];P("mouseup",x.x,x.y,p==="uidrag"?0:1,0,{})}const l=ne();T=C(l.x,l.y)?"view":"ui",f={d0:H(),cx0:l.x,cy0:l.y,kind:null,ax:l.x,ay:l.y,dragY:l.y},p="two"}else s.length>=3&&(clearTimeout(V),p==="two"&&oe(),p="ignore")},{passive:!1}),e.addEventListener("pointermove",a=>{if(a.pointerType==="mouse")return;a.preventDefault();const s=r.get(a.pointerId);if(a.pointerType==="pen"){s&&(s.x=a.clientX,s.y=a.clientY),u(p==="pen"||p==="penmodal",a),P("mousemove",a.clientX,a.clientY,0,p==="pen"?1:0);return}if(s){if(s.x=a.clientX,s.y=a.clientY,p==="pad"){X(L.bx+(s.x-L.px),L.by+(s.y-L.py),L.down?1:0);return}if(p==="pending"){if(Math.hypot(s.x-s.x0,s.y-s.y0)>Hn&&(T!=="view"||performance.now()-s.t0>=80)){clearTimeout(V);const l=T==="view"&&window.Module&&window.Module._blender_web_gizmo_hot&&window.Module._blender_web_gizmo_hot()===1,x=T==="ui"||l;p=x?"uidrag":"orbit",P("mousemove",s.x0,s.y0,0,0),P("mousedown",s.x0,s.y0,x?0:1,x?1:4),ke=setTimeout(De,$n),P("mousemove",s.x,s.y,0,x?1:4)}}else if(p==="orbit")P("mousemove",s.x,s.y,0,4);else if(p==="uidrag")P("mousemove",s.x,s.y,0,1);else if(p==="two"&&f&&r.size===2){const l=ne(),x=H();if(f.kind)if(f.kind==="zoom"){const M=Math.log(x/f.d0),R=f.ay-(M>0?Vn:qn)*M;P("mousemove",f.ax,R,0,4,{ctrl:!0})}else P("mousemove",l.x,l.y,0,4,{shift:T==="view"});else{const M=Math.abs(x-f.d0),R=Math.hypot(l.x-f.cx0,l.y-f.cy0);if(M>zt||R>zt){f.kind=M>R?"zoom":"pan",f.ax=l.x,f.ay=l.y,f.dragY=l.y,f.d0=x,f.cx0=l.x,f.cy0=l.y;const U=f.kind==="zoom"?{ctrl:!0}:{shift:T==="view"};P("mousemove",l.x,l.y,0,0,U),P("mousedown",l.x,l.y,1,4,U)}}}}},{passive:!1});const fe=a=>{if(a.pointerType==="mouse")return;a.preventDefault();const s=r.get(a.pointerId);r.delete(a.pointerId);try{e.releasePointerCapture(a.pointerId)}catch{}if(a.pointerType==="pen"){if(p==="penmodal"){const l=s?s.x:a.clientX,x=s?s.y:a.clientY;u(!1,a),Te(l,x,0),y=!1,d=!1,_=!1,o(),p=r.size?"ignore":"idle"}else p==="pen"&&(P("mouseup",s?s.x:a.clientX,s?s.y:a.clientY,0,0),u(!1,a),p=r.size?"ignore":"idle");return}p==="pad"&&L&&L.down?(P("mouseup",w,b,0,0),d=!1,_=!1,o(),p="idle",setTimeout(()=>{p!=="pad"&&(E=!1)},150)):p==="pad"?(s&&performance.now()-s.t0<Bt&&Math.hypot(s.x-s.x0,s.y-s.y0)<Ut&&(Te(w,b,0),--m<=0&&(d=!1,o())),p="idle",setTimeout(()=>{p!=="pad"&&(E=!1)},150)):p==="pending"?(clearTimeout(V),s&&!me&&performance.now()-s.t0<Bt&&Math.hypot(s.x-s.x0,s.y-s.y0)<Ut&&Te(s.x0,s.y0,0),p="idle"):p==="orbit"?(P("mouseup",s?s.x:a.clientX,s?s.y:a.clientY,1,0),p="idle"):p==="uidrag"?(P("mouseup",s?s.x:a.clientX,s?s.y:a.clientY,0,0),p="idle"):p==="two"?(oe(),p=r.size?"ignore":"idle"):r.size===0&&(p="idle"),r.size===0&&(p="idle")};e.addEventListener("pointerup",fe,{passive:!1}),e.addEventListener("pointercancel",fe,{passive:!1});for(const a of["touchstart","touchmove","touchend","touchcancel"])e.addEventListener(a,s=>s.preventDefault(),{passive:!1});const be={" ":"Space","-":"Minus",_:"Minus","=":"Equal","+":"Equal","[":"BracketLeft","{":"BracketLeft","]":"BracketRight","}":"BracketRight","\\":"Backslash","|":"Backslash",";":"Semicolon",":":"Semicolon","'":"Quote",'"':"Quote","`":"Backquote","~":"Backquote",",":"Comma","<":"Comma",".":"Period",">":"Period","/":"Slash","?":"Slash"},ge={Tab:"Tab",Enter:"Enter",Escape:"Escape",Backspace:"Backspace",Delete:"Delete",ArrowLeft:"ArrowLeft",ArrowRight:"ArrowRight",ArrowUp:"ArrowUp",ArrowDown:"ArrowDown",Home:"Home",End:"End"},_e={"!":"1","@":"2","#":"3",$:"4","%":"5","^":"6","&":"7","*":"8","(":"9",")":"0"},Pe=a=>ge[a]?ge[a]:a.length!==1?"":/[a-z]/i.test(a)?"Key"+a.toUpperCase():/[0-9]/.test(a)?"Digit"+a:_e[a]?"Digit"+_e[a]:be[a]||"",je=a=>{if(a.code||a.__fixed||!a.key)return;const s=Pe(a.key);if(!s)return;a.stopImmediatePropagation(),a.preventDefault();const l=new KeyboardEvent(a.type,{code:s,key:a.key,bubbles:!0,cancelable:!0,repeat:a.repeat,shiftKey:a.shiftKey,ctrlKey:a.ctrlKey,altKey:a.altKey});l.__fixed=!0,window.dispatchEvent(l)};window.addEventListener("keydown",je,!0),window.addEventListener("keyup",je,!0),window.__touchCodeFromKey=Pe;const ve=[],Fe=()=>{let a=document.getElementById("kbd-input");a||(a=document.createElement("input"),a.id="kbd-input",a.type="text",a.autocapitalize="off",a.autocomplete="off",a.autocorrect="off",a.spellcheck=!1,a.style.cssText="position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;font-size:16px;border:0;padding:0;z-index:95",document.body.appendChild(a),window.addEventListener("keydown",s=>{document.activeElement===a&&s.key&&[...s.key].length===1&&ve.push(s.key)},!0),a.addEventListener("input",s=>{const l=(s.inputType==="insertText"||s.inputType==="insertReplacementText")&&s.data||"";for(const x of l){const M=ve.indexOf(x);if(M>=0){ve.splice(0,M+1);continue}for(const R of["keydown","keyup"])window.dispatchEvent(new KeyboardEvent(R,{key:x,code:"",bubbles:!0,cancelable:!0}))}ve.length=0,a.value=""})),a.focus({preventScroll:!0})};let le=!1;const Re=()=>{const a=window.Module,s=a&&(a.calledRun||window.__rtInit)&&a._blender_web_text_editing;return s?s()===1:!1},h=()=>{const a=performance.now(),s=()=>{const l=Re();if(l&&!le)le=!0,Fe();else if(!l&&le){le=!1;const x=document.getElementById("kbd-input");x&&x.blur()}performance.now()-a<950&&setTimeout(s,40)};setTimeout(s,40)};window.__touchTextEditing=Re,e.addEventListener("pointerup",a=>{a.pointerType!=="mouse"&&!t.get("autokbd")?.startsWith("0")&&h()},!0);const v=()=>{if(document.hidden||le||window.Module&&Re())return;const a=document.activeElement;if(!(a===e||a&&a!==document.body&&a.id!=="kbd-input"&&/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(a.tagName))){a&&a.id==="kbd-input"&&a.blur();try{e.focus({preventScroll:!0})}catch{}}};document.addEventListener("visibilitychange",()=>{document.hidden||setTimeout(v,50)}),window.addEventListener("pageshow",()=>setTimeout(v,50)),window.addEventListener("focus",()=>setTimeout(v,50)),e.addEventListener("pointerdown",()=>setTimeout(v,0),!0),setInterval(()=>{if(le&&!Re()){le=!1;const a=document.getElementById("kbd-input");a&&a.blur()}},500);const S=(a,s,l,x)=>{let M=[];try{M=a.readdir(s)}catch{return}for(const R of M){if(R==="."||R==="..")continue;const U=(s==="/"?"":s)+"/"+R;let ie;try{ie=a.stat(U)}catch{continue}(ie.mode&61440)===16384?l>0&&S(a,U,l-1,x):/(\.index\.json$|\/\.)/.test(U)||x.push({path:U,size:ie.size,mtime:ie.mtime})}},j=()=>{const a=window.Module;if(!a||!a.FS)return;const s=document.createElement("div");s.style.cssText="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:15px system-ui,sans-serif;color:#ddd";const l=document.createElement("div");l.style.cssText="width:560px;max-width:92vw;max-height:80vh;overflow:auto;padding:18px;border-radius:12px;background:#1c1c1c;border:1px solid #555",s.appendChild(l);const x=()=>{const M=[];for(const ae of["/uploads","/opfs/home","/home","/tmp","/exports"])S(a.FS,ae,4,M);M.sort((ae,We)=>We.mtime-ae.mtime),l.innerHTML="<div style='font-size:18px;font-weight:600;margin-bottom:10px'>Soubory</div><div style='color:#aaa;margin-bottom:12px;line-height:1.4'>Nahraj soubory pro File ▸ Import (jsou v /uploads) a stáhni to, co Blender uložil/exportoval.</div>";const R=document.createElement("button");R.textContent="⬆ Nahrát soubory…",R.style.cssText="padding:10px 16px;border:0;border-radius:8px;background:#e87d0d;color:#111;font:600 15px system-ui;margin-right:8px";const U=document.createElement("input");U.type="file",U.multiple=!0,U.style.display="none",R.onclick=()=>U.click(),U.onchange=async()=>{try{a.FS.mkdir("/uploads")}catch{}for(const ae of U.files)a.FS.writeFile("/uploads/"+ae.name,new Uint8Array(await ae.arrayBuffer()));x()};const ie=document.createElement("button");ie.textContent="Zavřít",ie.style.cssText="padding:10px 16px;border:0;border-radius:8px;background:#333;color:#ddd;font:15px system-ui",ie.onclick=()=>s.remove(),l.append(R,U,ie);const Ke=document.createElement("div");Ke.style.marginTop="14px",M.length||(Ke.innerHTML="<div style='color:#888'>Zatím žádné soubory (ulož/exportuj něco v Blenderu).</div>");for(const ae of M){const We=document.createElement("div");We.style.cssText="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #333";const mt=document.createElement("div");mt.style.cssText="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap",mt.textContent=ae.path+"  ("+(ae.size/1024).toFixed(0)+" KB)";const et=document.createElement("button");et.textContent="⬇",et.style.cssText="padding:6px 14px;border:0;border-radius:6px;background:#2a6fd6;color:#fff;font:15px system-ui",et.onclick=()=>{const Bn=a.FS.readFile(ae.path),Ge=document.createElement("a");Ge.href=URL.createObjectURL(new Blob([Bn],{type:"application/octet-stream"})),Ge.download=ae.path.split("/").pop(),document.body.appendChild(Ge),Ge.click(),Ge.remove()},We.append(mt,et),Ke.appendChild(We)}l.appendChild(Ke)};x(),s.addEventListener("click",M=>{M.target===s&&s.remove()}),document.body.appendChild(s)};if(window.__openFileManager=j,!(t.get("touch")==="1"||t.get("touch")!=="0"&&(navigator.maxTouchPoints||0)>0))return;const q=[["Esc","Escape","Escape"],["Enter","Enter","Enter"],["Tab","Tab","Tab"],["A","KeyA","a"],["G","KeyG","g"],["R","KeyR","r"],["S","KeyS","s"],["X","KeyX","x"],["Y","KeyY","y"],["Z","KeyZ","z"],["Del","Delete","Delete"],["1","Digit1","1"],["2","Digit2","2"],["3","Digit3","3"],["⌂","Home","Home"]],se=[["Shift","shift","ShiftLeft"],["Ctrl","ctrl","ControlLeft"],["Alt","alt","AltLeft"]],D=(a,s,l)=>window.dispatchEvent(new KeyboardEvent(a,{code:s,key:l,bubbles:!0,cancelable:!0})),J=new Set(["KeyG","KeyR","KeyS","KeyE","KeyB","KeyK"]),W=(a,s)=>{a==="KeyR"&&n.ctrl?(d=!0,m=2,o()):a==="KeyK"&&!n.ctrl?(d=!0,m=1e9,o()):a==="KeyB"&&!n.ctrl?(d=!0,_=!0,m=1,o()):J.has(a)&&!n.ctrl&&!n.shift&&!n.alt?(d=!0,m=1,o()):(a==="Enter"||a==="Escape"||a==="Tab")&&(d=!1,_=!1,o());const l=s.length===1&&n.shift?s.toUpperCase():s;D("keydown",a,l),setTimeout(()=>D("keyup",a,l),40)},de=(a,s,l)=>{a.forEach(([x,M])=>D("keydown",x,M)),D("keydown",s,l),setTimeout(()=>{D("keyup",s,l),a.forEach(([x,M])=>D("keyup",x,M))},60)},Z=document.createElement("div");Z.id="touchbar",o=()=>{Z.style.borderColor=d?"#2a6fd6":"#555",Z.style.boxShadow=d?"0 0 0 2px #2a6fd6":"none"},Z.style.cssText="position:fixed;left:0;right:0;margin:0 auto;width:fit-content;bottom:30px;z-index:90;display:flex;gap:4px;padding:4px;background:rgba(28,28,28,.88);border:1px solid #555;border-radius:10px;font:600 14px system-ui,sans-serif;-webkit-user-select:none;user-select:none;touch-action:manipulation;flex-wrap:wrap;max-width:98vw;justify-content:center";const Q=(a,s)=>{const l=document.createElement("button");return l.textContent=a,l.style.cssText="min-width:38px;height:36px;padding:0 6px;border-radius:7px;border:1px solid #666;background:#3a3a3a;color:#eee;font:inherit;touch-action:manipulation",l.addEventListener("pointerdown",x=>x.preventDefault()),l.addEventListener("click",s),Z.appendChild(l),l};q.forEach(([a,s,l])=>Q(a,()=>W(s,l))),Q("↶",()=>de([["ControlLeft","Control"]],"KeyZ","z")).title="Undo (Ctrl+Z)",Q("↷",()=>de([["ControlLeft","Control"],["ShiftLeft","Shift"]],"KeyZ","z")).title="Redo (Ctrl+Shift+Z)",se.forEach(([a,s,l])=>{const x=Q(a,()=>{n[s]=!n[s],x.style.background=n[s]?"#2a6fd6":"#3a3a3a",D(n[s]?"keydown":"keyup",l,a)})});const Ln=[["E","KeyE","e"],["F","KeyF","f"],["B","KeyB","b"],["C","KeyC","c"],["D","KeyD","d"],["H","KeyH","h"],["I","KeyI","i"],["K","KeyK","k"],["M","KeyM","m"],["N","KeyN","n"],["P","KeyP","p"],["T","KeyT","t"],["Q","KeyQ","q"],["W","KeyW","w"],["Space","Space"," "],["⌫","Backspace","Backspace"],["F2","F2","F2"],["F3","F3","F3"],[".","Period","."],["-","Minus","-"],["/","Slash","/"]],Oe=document.createElement("div");Oe.id="touchbar-more",Oe.style.cssText="display:none;flex-basis:100%;flex-wrap:wrap;gap:4px;justify-content:center";const At=(a,s)=>{const l=document.createElement("button");return l.textContent=a,l.style.cssText="min-width:38px;height:36px;padding:0 6px;border-radius:7px;border:1px solid #666;background:#3a3a3a;color:#eee;font:inherit;touch-action:manipulation",l.addEventListener("pointerdown",x=>x.preventDefault()),l.addEventListener("click",s),Oe.appendChild(l),l};Ln.forEach(([a,s,l])=>At(a,()=>W(s,l))),At("💾",()=>de([["ControlLeft","Control"]],"KeyS","s")).title="Uložit (Ctrl+S)";const Mn=Q("⋯",()=>{Oe.style.display=Oe.style.display==="none"?"flex":"none"});Mn.title="Další klávesy (E, Space, F2, Ctrl+S…)",Q("📁",j).title="Soubory: nahrát / stáhnout",Q("⌨",Fe).title="Klávesnice (psaní do polí, přejmenování)";const An=Q("✕",()=>Z.remove());An.title="Skrýt lištu",Z.appendChild(Oe),Z.style.display="none",document.body.appendChild(Z);const Cn=setInterval(()=>{window.__BGUI__&&window.__BGUI__.window&&(Z.style.display="flex",clearInterval(Cn))},300)}new URLSearchParams(location.search).get("tel");Math.random().toString(36).slice(2,8);performance.now();const cn=["ws","edit","sculpt","texpaint","gn","files","export","rigify","gp"],ct=new URLSearchParams(location.search),Xn=(ct.get("tourpart")||cn.join(",")).split(","),ln=e=>(ct.get(e)||"").split(",").filter(Boolean),It=ln("tourws"),Jn=ln("tourskip"),Zn=+ct.get("tourrep")||1,Nt=Math.max(0,+ct.get("tourwait")||0),Qn=`
import json
_G = globals()
def _view():
    w = bpy.context.window_manager.windows[0]
    for a in w.screen.areas:
        if a.type == 'VIEW_3D': return w, a, [r for r in a.regions if r.type == 'WINDOW'][0]
    return w, None, None
def _rect():
    w, a, r = _view()
    return [r.x, w.height - r.y - r.height, r.width, r.height] if a else None
def _px(co):
    from bpy_extras import view3d_utils
    w, a, r = _view(); p = view3d_utils.location_3d_to_region_2d(r, a.spaces[0].region_3d, co)
    return None if p is None else [r.x + p.x, w.height - (r.y + p.y)]
def _shade(t):
    w, a, r = _view()
    if a: a.spaces[0].shading.type = t
    return bool(a)
def _state():
    o = bpy.context.view_layer.objects.active; s = {'mode': bpy.context.mode, 'objs': len(bpy.data.objects), 'ws': bpy.context.window_manager.windows[0].workspace.name}
    if o:
        s.update(ob=o.name, type=o.type)
        if o.type == 'MESH':
            if o.mode == 'EDIT': o.update_from_editmode()
            s.update(v=len(o.data.vertices), zsum=round(sum(x.co.z for x in o.data.vertices), 4))
    return s
def _tour_tick():
    if os.path.exists('/tmp/tour_cmd'):
        s = open('/tmp/tour_cmd').read(); os.remove('/tmp/tour_cmd'); out = None
        try:
            if s.startswith('eval:'): out = eval(s[5:], _G)
            else: exec(s, _G)
        except Exception as e: out = {'err': repr(e)}
        _say('AUTO_TOUR_R ' + json.dumps(out))
    return 0.05
bpy.app.timers.register(_tour_tick, first_interval=0.5, persistent=True)
_gated(lambda: _say('AUTO_TOUR_READY'))`,k=e=>new Promise(t=>setTimeout(t,e)),bt=()=>document.getElementById("canvas"),Dt=()=>window.__DPR__||1,re=(e,t,n,o=0,r=0)=>{const i=bt().getBoundingClientRect();bt().dispatchEvent(new MouseEvent(e,{bubbles:!0,cancelable:!0,view:window,clientX:i.left+t/Dt(),clientY:i.top+n/Dt(),button:o,buttons:r}))},eo=e=>/^[a-z]$/.test(e)?["Key"+e.toUpperCase(),e]:/^[0-9]$/.test(e)?["Digit"+e,e]:[e,e],Le=(e,t,n,o={})=>window.dispatchEvent(new KeyboardEvent(e,{code:t,key:n,bubbles:!0,cancelable:!0,ctrlKey:!!o.ctrl,shiftKey:!!o.shift})),ee=async(e,t={},n=400)=>{const[o,r]=eo(e);t.ctrl&&Le("keydown","ControlLeft","Control",{ctrl:!0}),t.shift&&Le("keydown","ShiftLeft","Shift",t),Le("keydown",o,r,t),await k(40),Le("keyup",o,r,t),t.shift&&Le("keyup","ShiftLeft","Shift",{ctrl:t.ctrl}),t.ctrl&&Le("keyup","ControlLeft","Control"),await k(n)},nt=async(e,t,n,o,r=16)=>{re("mousemove",e,t),await k(200),re("mousedown",e,t,0,1),await k(60);for(let i=1;i<=r;i++)re("mousemove",e+(n-e)*i/r,t+(o-t)*i/r,0,1),await k(30);re("mouseup",n,o,0,0),await k(800)},_t=async(e,t)=>{re("mousemove",e,t),await k(250),re("mousedown",e,t,0,1),await k(70),re("mouseup",e,t,0,0),await k(500)};let Ae=null;function to(e){Ae&&Ae(JSON.parse(e))}const jt=24e4,F=e=>new Promise((t,n)=>{const o=setTimeout(()=>{Ae=null,clearInterval(i),n(new Error("HANG: Python neodpověděl do "+jt/1e3+" s"))},jt),r=performance.now(),i=setInterval(()=>{window.__GPU_LOST__&&performance.now()-r>15e3&&(clearTimeout(o),clearInterval(i),Ae=null,n(new Error("HANG: Python po ztrátě GPU neodpověděl do 15 s")))},1e3);Ae=d=>{clearTimeout(o),clearInterval(i),Ae=null,d&&d.err?n(new Error(d.err)):t(d)};const c=window.Module.FS;try{c.unlink("/tmp/tour_cmd")}catch{}c.writeFile("/tmp/tour_cmd",e)}),I=e=>F("eval:"+e),no=async(e=1500)=>{await I("0"),await k(e),await I("0")},ce=(e,t)=>{if(!e)throw new Error(t)};async function oo(){const e=await I("_rect()").catch(()=>null);return new Promise(t=>requestAnimationFrame(async()=>{try{const n=await createImageBitmap(bt()),o=256/Math.max(n.width,n.height),r=document.createElement("canvas");r.width=Math.round(n.width*o),r.height=Math.round(n.height*o);const i=r.getContext("2d",{willReadFrequently:!0});i.drawImage(n,0,0,r.width,r.height);const c=e?e.map(b=>Math.round(b*o)):[0,0,r.width,r.height],d=i.getImageData(c[0],c[1],Math.max(1,c[2]),Math.max(1,c[3])).data;let _=0,m=0,y=0;for(let b=0;b<d.length;b+=4){const E=(d[b]+d[b+1]+d[b+2])/3;_+=E,m+=E*E,y++}const w=Math.sqrt(Math.max(0,m/y-_/y*(_/y)));t({url:r.toDataURL("image/jpeg",.6),std:Math.round(w*10)/10,blank:w<1})}catch(n){t({url:"",std:-1,blank:!0,err:String(n)})}}))}let Ye=null,Ce=!1,ao=0;const ot=window.__TOUR=[],O=async(e,t,n=1500)=>{if(Ce)return;Ye={errs:[]};const o=performance.now();let r=!0,i="";try{await t(),await no(n)}catch(m){r=!1,i=String(m.message||m).slice(0,300),i.startsWith("HANG")&&(Ce=!0)}window.__GPU_LOST__&&(r=!1,i="GPU LOST "+window.__GPU_LOST__+(i?" | "+i:""),Ce=!0);const c=Math.round(performance.now()-o),d=Ce?{url:"",std:-1,blank:!0}:await oo(),_={i:ao++,name:e,ok:r,err:i,ms:c,gpuerrs:Ye.errs.slice(0,4),nerr:Ye.errs.length,blank:d.blank,std:d.std};ot.push(_),console.log("TOUR_STEP "+JSON.stringify(_)),{..._,shot:d.url}},Se=()=>F("bpy.ops.wm.read_homefile(app_template='', use_factory_startup=True)"),Y=async(e,t)=>{const n=await I("_state()");return ce(e(n),t+" "+JSON.stringify(n)),n},He=async()=>{const e=await I("_rect()");return[e[0]+e[2]/2,e[1]+e[3]/2]},$e=e=>F(`bpy.context.window.workspace = bpy.data.workspaces[${JSON.stringify(e)}]`),ro={ws:async()=>{for(let e=0;e<Zn;e++)for(const t of await I("[w.name for w in bpy.data.workspaces]")){const n=(e?"r"+e+"_":"")+t.replace(/ /g,"_"),o=t.replace(/ /g,"_");if(!(It.length&&!It.includes(o)||Jn.includes(o))&&(await O("ws_"+n,()=>$e(t),2500),!!await I("bool(_view()[1])"))){for(const r of["SOLID","MATERIAL","RENDERED","WIREFRAME"])await O(`ws_${n}_${r}`,()=>F(`_shade('${r}')`),r==="MATERIAL"||r==="RENDERED"?4e3:1500);await F("_shade('SOLID')").catch(()=>{})}}await $e("Layout").catch(()=>{})},edit:async()=>{await O("edit_enter",async()=>{await Se(),await k(1500);const[e,t]=await He();re("mousemove",e,t),await k(300),await ee("Tab",{},900),await Y(n=>n.mode==="EDIT_MESH","Tab nepřepnul")}),await O("edit_extrude",async()=>{await F("import bmesh; o=bpy.context.object; b=bmesh.from_edit_mesh(o.data); [f.select_set(False) for f in b.faces]; [e.select_set(False) for e in b.edges]; [v.select_set(False) for v in b.verts]; f=max(b.faces,key=lambda f:f.calc_center_median().z); f.select_set(True); b.select_flush(True); bmesh.update_edit_mesh(o.data)");const[e,t]=await He();re("mousemove",e,t),await k(300),await ee("e"),await ee("1"),await ee("Enter",{},900),await Y(n=>n.v===12,"E 1: čekám 12 vrcholů")}),await O("edit_loopcut",async()=>{const e=await I("(lambda o: _px(o.matrix_world @ ((o.data.vertices[max(range(8), key=lambda i: o.data.vertices[i].co.x - o.data.vertices[i].co.y + o.data.vertices[i].co.z)].co + o.data.vertices[max(range(8), key=lambda i: o.data.vertices[i].co.x - o.data.vertices[i].co.y - o.data.vertices[i].co.z)].co) / 2)))(bpy.context.object)");re("mousemove",e[0],e[1]),await k(300),await ee("r",{ctrl:!0},900),re("mousemove",e[0]+1,e[1]+1),await k(500),await _t(e[0]+1,e[1]+1),await _t(e[0]+1,e[1]+1),await k(600),await Y(t=>t.v>12,"Ctrl+R: vrcholů má přibýt")}),await O("edit_undo",async()=>{const e=await I("_state()");await ee("z",{ctrl:!0},900),await Y(t=>t.v<e.v,"Ctrl+Z nevrátil")}),await O("edit_redo",async()=>{const e=await I("_state()");await ee("z",{ctrl:!0,shift:!0},900),await Y(t=>t.v>e.v,"Ctrl+Shift+Z nevrátil")}),await O("edit_exit",async()=>{await ee("Tab",{},900),await Y(e=>e.mode==="OBJECT","Tab zpět")})},sculpt:async()=>{let e=0;await O("sculpt_enter",async()=>{await Se(),await k(1200),await F("bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1.3)"),await k(600),await $e("Sculpting"),await k(1500),e=(await Y(t=>t.mode==="SCULPT","workspace Sculpting")).zsum},2500),await O("sculpt_stroke",async()=>{const[t,n]=await He();await nt(t-40,n-30,t+60,n+10),await Y(o=>o.zsum!==e,"tah nezměnil mesh")},2e3),await O("sculpt_undo",async()=>{await ee("z",{ctrl:!0},1e3),await Y(t=>t.zsum===e,"Ctrl+Z nevrátil")})},texpaint:async()=>{const e="(lambda p: sum(1 for i in range(0,len(p),4) if p[i]<0.99))(list(bpy.data.images['TOUR'].pixels))";await O("texpaint_enter",async()=>{await Se(),await k(1200),await F("o=bpy.context.view_layer.objects.active; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(); bpy.ops.object.mode_set(mode='OBJECT'); img=bpy.data.images.new('TOUR',256,256); img.generated_color=(1,1,1,1); m=bpy.data.materials.new('TM'); m.use_nodes=True; n=m.node_tree.nodes.new('ShaderNodeTexImage'); n.image=img; m.node_tree.links.new(n.outputs[0],m.node_tree.nodes['Principled BSDF'].inputs['Base Color']); o.data.materials.clear(); o.data.materials.append(m); m.node_tree.nodes.active=n"),await k(800),await $e("Texture Paint"),await k(1500),await Y(t=>t.mode==="PAINT_TEXTURE","workspace Texture Paint")},2500),await O("texpaint_stroke",async()=>{await F("bpy.context.tool_settings.image_paint.brush.color=(1,0,0)");const t=await I(e),[n,o]=await He();await nt(n-30,o-20,n+40,o+5);const r=await I(e);ce(r>t,`tah neobarvil pixely (${t} -> ${r})`)},2e3)},gn:async()=>{await O("gn_workspace",async()=>{await Se(),await k(1200),await $e("Geometry Nodes")},2500),await O("gn_modifier",async()=>{await F("o=bpy.context.view_layer.objects.active; m=o.modifiers.new('G','NODES'); t=bpy.data.node_groups.new('T','GeometryNodeTree'); t.interface.new_socket('Geometry',in_out='INPUT',socket_type='NodeSocketGeometry'); t.interface.new_socket('Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry'); i=t.nodes.new('NodeGroupInput'); u=t.nodes.new('NodeGroupOutput'); d=t.nodes.new('GeometryNodeDistributePointsOnFaces'); p=t.nodes.new('GeometryNodeInstanceOnPoints'); c=t.nodes.new('GeometryNodeMeshIcoSphere'); r=t.nodes.new('GeometryNodeRealizeInstances'); c.inputs['Radius'].default_value=0.05; d.inputs['Density'].default_value=50; L=t.links.new; L(i.outputs[0],d.inputs['Mesh']); L(d.outputs['Points'],p.inputs['Points']); L(c.outputs['Mesh'],p.inputs['Instance']); L(p.outputs[0],r.inputs[0]); L(r.outputs[0],u.inputs[0]); m.node_group=t"),await k(1500);const e=await I("len(bpy.context.view_layer.objects.active.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices)");ce(e>100,`scatter: ${e} vrcholů`)},2500),await O("gn_MATERIAL",()=>F("_shade('MATERIAL')"),4e3)},files:async()=>{await O("file_save",async()=>{await Se(),await k(1200),await F("bpy.ops.mesh.primitive_uv_sphere_add(location=(3,0,0))"),await F("bpy.ops.wm.save_as_mainfile(filepath='/opfs/home/tour.blend')"),ce(await I("bpy.data.filepath.endswith('tour.blend')"),"soubor neuložen")}),await O("file_new",async()=>{await Se(),await k(1500),await Y(e=>e.objs===3,"nový soubor")}),await O("file_reopen",async()=>{await F("bpy.ops.wm.open_mainfile(filepath='/opfs/home/tour.blend')"),await k(2e3),await Y(e=>e.objs===4,"otevřený soubor")})},export:async()=>{await O("export_gltf",async()=>{await F("bpy.ops.export_scene.gltf(filepath='/opfs/home/tour.glb')");const e=await I("os.path.getsize('/opfs/home/tour.glb')");ce(e>100,`glb ${e} B`)})},rigify:async()=>{const e="(lambda ob: (lambda b: (b.name, _px(ob.matrix_world @ ((b.head + b.tail) / 2))))(ob.pose.bones['NAME']))(bpy.context.object)";await O("rigify_generate",async()=>{await Se(),await k(1200),await F("bpy.ops.preferences.addon_enable(module='rigify'); bpy.ops.object.select_all(action='DESELECT'); bpy.ops.object.armature_human_metarig_add(); bpy.ops.pose.rigify_generate()"),await k(2e3),ce(await I("'rig' in bpy.data.objects or any(o.name.startswith('rig') for o in bpy.data.objects)"),"rig nevznikl")},2500),await O("rigify_pose",async()=>{await F("o=[o for o in bpy.data.objects if o.name.startswith('rig') and o.type=='ARMATURE'][0]; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o; bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='DESELECT')"),await Y(t=>t.mode==="POSE","pose mode")}),await O("rigify_click",async()=>{const t="torso",n=await I(e.replace("NAME",t));ce(n[1],"kost mimo pohled"),await _t(n[1][0],n[1][1]),await k(700);const o=await I("bpy.context.active_pose_bone.name if bpy.context.active_pose_bone else ''");ce(o!=="",`klik na ${t} nevybral nic`)}),await O("rigify_box",async()=>{await F("bpy.ops.pose.select_all(action='DESELECT')");const t=await I("_rect()");re("mousemove",t[0]+t[2]/2,t[1]+t[3]/2),await k(300),await ee("b",{},500),await nt(t[0]+t[2]*.2,t[1]+t[3]*.1,t[0]+t[2]*.8,t[1]+t[3]*.9);const n=await I("len(bpy.context.selected_pose_bones or [])");ce(n>0,"box vybral 0 kostí")})},gp:async()=>{const e="(lambda o: sum(len(d.strokes) for l in o.data.layers for d in [l.current_frame().drawing] if l.current_frame()))(bpy.context.view_layer.objects.active)";let t=0;await O("gp_template",async()=>{await F("bpy.ops.wm.read_homefile(app_template='2D_Animation', use_factory_startup=True)"),await k(5e3),ee("Escape"),await k(600),t=await I(e)},2500),await O("gp_stroke",async()=>{const[n,o]=await He();await nt(n-100,o-30,n+100,o+20,20);const r=await I(e);ce(r===t+1,`tah nepřibyl (${t} -> ${r})`)},2e3),await O("gp_SOLID",()=>F("_shade('SOLID')"),2e3),await O("gp_WIREFRAME",()=>F("_shade('WIREFRAME')"),2e3),await O("gp_undo",async()=>{await ee("z",{ctrl:!0},900);const n=await I(e);ce(n===t,`Ctrl+Z (${n})`)})}};async function so(){try{new BroadcastChannel("blender-gpuerr").onmessage=n=>{const o=String(n.data);Ye&&!o.startsWith("PIPE_SPARSE")&&Ye.errs.push(o.slice(0,200))}}catch{}const e=performance.now();if(await k(1e3),await ee("Escape",{},600),Nt)for(let n=0;n<Nt;n+=10)await k(1e4);await O("boot",async()=>{await Y(n=>n.objs===3,"startovní scéna")});for(const n of cn)if(Xn.includes(n)&&!Ce)try{await ro[n]()}catch(o){await O(n+"_part",()=>{throw o})}const t=ot.filter(n=>!n.ok||n.blank||n.nerr).length;console.log(`TOUR_DONE steps=${ot.length} problem=${t} s=${Math.round((performance.now()-e)/1e3)} hung=${Ce}`),ot.length,Math.round((performance.now()-e)/1e3),window.__AUTO_DONE="tour"}const he=(e,t)=>{e==="auto_done"&&(window.__AUTO_DONE=t.name)},Me=new URLSearchParams(location.search),xe=Me.get("auto")||"",we=`import bpy, sys, os
def _say(s):
    print(s); sys.stdout.flush()
def _v3d():
    for a in bpy.context.window_manager.windows[0].screen.areas:
        if a.type == 'VIEW_3D': return a
def _mp():
    a = _v3d()
    if a: a.spaces[0].shading.type = 'MATERIAL'
    _say('AUTO_STEP mp_on')
    return None
def _gated(fn):                               # čeká na /tmp/auto_go (JS ho zapíše, až je Blender zahřátý)
    def _poll():
        if os.path.exists('/tmp/auto_go'):
            fn(); return None
        return 1.0
    bpy.app.timers.register(_poll, first_interval=1.0)
`,gt={light:we+`
_n = [0]
def _move():
    L = bpy.data.objects.get('Light')
    if L is None or _n[0] >= 10:
        _say('AUTO_DONE light'); return None
    _n[0] += 1
    L.location.x = 4.0 * (-1 if _n[0] % 2 else 1); L.location.z = 3.0 + 0.4 * _n[0]
    _say('AUTO_STEP light_%d' % _n[0])
    return 1.0
_gated(lambda: (_mp(), bpy.app.timers.register(_move, first_interval=4.0)))`,lightdrag:we+`
def _sel():
    L = bpy.data.objects.get('Light')
    bpy.ops.object.select_all(action='DESELECT')
    L.select_set(True); bpy.context.view_layer.objects.active = L
    _say('AUTO_STEP light_selected'); _say('AUTO_DRAG_READY')
    return None
_gated(lambda: (_mp(), bpy.app.timers.register(_sel, first_interval=4.0)))`,orbit:we+`
_gated(lambda: (_mp(), bpy.app.timers.register(lambda: (_say('AUTO_ORBIT_READY'), None)[1], first_interval=4.0)))`,soak:we+`
import math, time
_t0 = [0.0]; _k = [0]; _p = [0]
def _post():
    a = _v3d()
    if not a: return 2.0
    if _p[0] >= 6:
        _say('AUTO_DONE soak'); return None
    t = 'RENDERED' if _p[0] % 2 == 0 else 'MATERIAL'
    _p[0] += 1
    _say('AUTO_STEP post_shade_%s_%d' % (t, _p[0]))
    a.spaces[0].shading.type = t
    return 15.0
def _soak():
    if not _t0[0]: _t0[0] = time.time()
    el = time.time() - _t0[0]
    if el > float(SOAK_SEC):
        if 'R' in 'SOAK_MODE':
            _say('AUTO_STEP soak_done_switching'); bpy.app.timers.register(_post, first_interval=1.0); return None
        _say('AUTO_DONE soak'); return None
    _k[0] += 1; k = _k[0]
    L = bpy.data.objects.get('Light')
    if L and 'l' in 'SOAK_MODE': L.location.x = 4.0 * math.sin(k / 5.0); L.location.z = 4.0 + math.cos(k / 3.0)
    ob = bpy.data.objects.get('Cube')
    if ob and 'm' in 'SOAK_MODE':
        if not ob.data.materials:
            m = bpy.data.materials.new('SoakMat'); m.use_nodes = True; ob.data.materials.append(m)
        ob.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (abs(math.sin(k / 7.0)), abs(math.cos(k / 11.0)), 0.3, 1.0)
    a = _v3d()
    if a and 'o' in 'SOAK_MODE': a.spaces[0].region_3d.view_rotation.rotate(__import__('mathutils').Euler((0, 0, 0.05)))
    if a:
        for r in a.regions: r.tag_redraw()          # H50: bez toho z timeru nevznikne překreslení (rt_frame stál na 18)
    if k % 30 == 0: _say('AUTO_STEP soak_%ds' % int(el))
    return 0.25 if 'f' in 'SOAK_MODE' else 1.0
if 'SOAK_SCENE' == 'vol':      # H50: kostka s Principled Volume + 4 barevná světla (scéna z hlášení Lukáše)
    ob = bpy.data.objects['Cube']; m = bpy.data.materials.new('Vol'); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == 'BSDF_PRINCIPLED': nt.nodes.remove(n)
    vol = nt.nodes.new('ShaderNodeVolumePrincipled'); vol.inputs['Density'].default_value = 1.0
    nt.links.new(vol.outputs['Volume'], [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0].inputs['Volume'])
    ob.data.materials.clear(); ob.data.materials.append(m)
    for i, c in enumerate([(1, 0, 0), (0, 1, 0), (0, 0, 1)]):
        ld = bpy.data.lights.new('VL%d' % i, 'POINT'); ld.color = c; ld.energy = 800
        lo = bpy.data.objects.new('VL%d' % i, ld); lo.location = (3 * (i - 1), -3, 3); bpy.context.scene.collection.objects.link(lo)
_gated(lambda: (_mp(), bpy.app.timers.register(_soak, first_interval=4.0)))`.replace("SOAK_SEC",String(+Me.get("soaksec")||600)).replace("SOAK_MODE",Me.get("soakmode")||"lmo").replace("SOAK_SCENE",Me.get("soakscene")||""),ws:we+`
_ws = [None, 0]
def _next():
    names = [w.name for w in bpy.data.workspaces]
    if _ws[1] >= len(names):
        _say('AUTO_DONE ws'); return None
    n = names[_ws[1]]; _ws[1] += 1
    _say('AUTO_STEP ws_' + n.replace(' ', '_'))        # před přepnutím: když to zamrzne, poslední krok = viník
    bpy.context.window.workspace = bpy.data.workspaces[n]
    return 6.0
_gated(lambda: bpy.app.timers.register(_next, first_interval=2.0))`,tmpl:we+`
def _load():
    _say('AUTO_STEP tmpl_load_' + 'TMPL_NAME')
    bpy.ops.wm.read_homefile(app_template='TMPL_NAME')
    _say('AUTO_STEP tmpl_loaded')
    bpy.app.timers.register(lambda: (_say('AUTO_DONE tmpl'), None)[1], first_interval=30.0, persistent=True)
    return None
_gated(lambda: bpy.app.timers.register(_load, first_interval=2.0))`.replace("TMPL_NAME",Me.get("tmpl")||"2D_Animation").replace("TMPL_NAME",Me.get("tmpl")||"2D_Animation"),rendered:we+`
_r = [0]
def _sw():
    a = _v3d()
    if not a: return 2.0
    if _r[0] >= 10:
        _say('AUTO_DONE rendered'); return None
    t = 'RENDERED' if _r[0] % 2 == 0 else 'MATERIAL'
    _r[0] += 1
    _say('AUTO_STEP shade_%s_%d' % (t, _r[0]))
    a.spaces[0].shading.type = t
    return 15.0
_gated(lambda: bpy.app.timers.register(_sw, first_interval=3.0))`,tour:we+Qn,mp:we+`
_gated(lambda: (_mp(), bpy.app.timers.register(lambda: (_say('AUTO_DONE mp'), None)[1], first_interval=60.0)))`};function io(){return gt[xe]?["--python-expr",gt[xe]]:[]}const pe=e=>new Promise(t=>setTimeout(t,e)),dn=()=>document.getElementById("canvas"),ye=(e,t,n,o=0,r=0)=>dn().dispatchEvent(new MouseEvent(e,{bubbles:!0,cancelable:!0,view:window,clientX:t,clientY:n,button:o,buttons:r})),rt=(e,t,n)=>window.dispatchEvent(new KeyboardEvent(e,{code:t,key:n,bubbles:!0,cancelable:!0})),kt=()=>{const e=dn().getBoundingClientRect();return[e.left+e.width*.5,e.top+e.height*.45,e]};async function pn(){const[e,t]=kt();ye("mousemove",e,t),await pe(200),rt("keydown","Escape","Escape"),await pe(50),rt("keyup","Escape","Escape"),await pe(400)}async function co(){const[e,t]=kt();await pn(),ye("mousemove",e,t),await pe(300),rt("keydown","KeyG","g"),await pe(50),rt("keyup","KeyG","g"),await pe(300);for(let n=1;n<=120;n++)ye("mousemove",e+150*Math.sin(n/12),t+100*Math.cos(n/12)),await pe(33);ye("mousedown",e,t,0,1),await pe(70),ye("mouseup",e,t,0,0),he("auto_step",{name:"drag_done"}),he("auto_done",{name:xe})}async function lo(){const[e,t]=kt();await pn(),ye("mousemove",e,t),await pe(200),ye("mousedown",e,t,1,4);for(let n=1;n<=150;n++)ye("mousemove",e+200*Math.sin(n/15),t+80*Math.sin(n/7),1,4),await pe(33);ye("mouseup",e,t,1,0),he("auto_done",{name:xe})}let wt=0,Ft=!1;function po(){if(!gt[xe])return;const e=performance.now();let t=9999,n=0;try{new BroadcastChannel("blender-perf").onmessage=r=>{t=r.data.dt_avg_ms,n=performance.now()}}catch{}const o=setInterval(()=>{if(Ft){clearInterval(o);return}const r=performance.now()-n<3e3?t:9999;if(wt=window.__BGUI__&&window.__BGUI__.window&&r<150?wt+1:0,wt>=3||performance.now()-e>12e4&&window.__BGUI__&&window.__BGUI__.window)try{window.Module.FS.writeFile("/tmp/auto_go","1"),Ft=!0,he("auto_step",{name:"go"})}catch(i){console.log("auto_go failed",i)}},1e3)}function uo(e){if(!xe||!e.startsWith("AUTO_"))return;const t=e.trim();if(t.startsWith("AUTO_TOUR_R ")){to(t.slice(12));return}if(t==="AUTO_TOUR_READY"){so();return}window.__AUTO_LOG=(window.__AUTO_LOG||[]).concat(t),t==="AUTO_DRAG_READY"?co():t==="AUTO_ORBIT_READY"?lo():t.startsWith("AUTO_DONE")?he("auto_done",{name:xe}):he("auto_step",{name:t.slice(10)})}if(xe){let e=0;const t=setInterval(()=>{e++;const n=document.getElementById("gpu-ack");n&&!n.checked&&(n.checked=!0,n.dispatchEvent(new Event("change",{bubbles:!0})));const o=document.getElementById("start-btn");o&&!o.disabled?(o.click(),clearInterval(t),he("auto_launch",{})):e>=600?(clearInterval(t),he("auto_launch_fail",{disabled:!!(o&&o.disabled)})):e%30===0&&he("auto_launch_wait",{disabled:!!(o&&o.disabled)})},1e3)}const mo=new URLSearchParams(location.search).get("sw")?new URLSearchParams(location.search).get("sw")==="1":!0;window.__swCheck=Promise.resolve();mo&&"serviceWorker"in navigator&&window.self===window.top&&(window.__swCheck=new Promise(e=>{const t=()=>e();setTimeout(t,4e3),navigator.serviceWorker.addEventListener("message",n=>{const o=n.data&&n.data.type;if(o==="version-ok")t();else if(o==="update-available"&&!window.__blenderStarted&&!sessionStorage.getItem("auto_upd")){sessionStorage.setItem("auto_upd","1");const r=document.getElementById("splash-status");r&&(r.textContent="Aktualizuji na novou verzi…"),navigator.serviceWorker.controller&&navigator.serviceWorker.controller.postMessage({type:"update"})}}),navigator.serviceWorker.ready.then(n=>n.active&&n.active.postMessage({type:"check"})).catch(t)}),navigator.serviceWorker.register("./sw.js").then(async()=>{const e=await navigator.serviceWorker.ready;if(!crossOriginIsolated&&!sessionStorage.getItem("coi_reload")){sessionStorage.setItem("coi_reload","1"),location.reload();return}const t=[location.pathname,...performance.getEntriesByType("resource").map(n=>n.name)];e.active&&e.active.postMessage({type:"precache",urls:t}),navigator.storage&&navigator.storage.persist&&navigator.storage.persist().catch(()=>{})}).catch(e=>console.warn("sw register failed",e)),navigator.serviceWorker.addEventListener("message",e=>{if(!(e.data&&e.data.type==="update-available"&&!window.__blenderStarted&&!sessionStorage.getItem("auto_upd")))if(e.data&&e.data.type==="update-available"&&!document.getElementById("sw-update")){const t=document.createElement("div");t.id="sw-update",t.style.cssText="position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2000;padding:8px 14px;border-radius:8px;background:#e87d0d;color:#111;font:600 14px system-ui;cursor:pointer",t.textContent="Je nová verze Blenderu — klepni pro aktualizaci (neuložená práce se ztratí)",t.onclick=()=>navigator.serviceWorker.controller&&navigator.serviceWorker.controller.postMessage({type:"update"}),document.body.appendChild(t)}else e.data&&e.data.type==="updated"&&location.reload()}));fetch("version.json").then(e=>e.json()).then(e=>{const t=document.getElementById("build-version");t&&e&&e.v&&(t.textContent="build "+new Date(e.v).toLocaleString("cs-CZ",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"}))}).catch(()=>{});const fo=document.getElementById("splash"),_o=document.getElementById("splash-shell"),wo=document.getElementById("stage-card"),yo=document.querySelector(".stage"),un=document.getElementById("splash-status"),ho=document.getElementById("progress-phase"),Kt=document.getElementById("progress-percent"),bo=document.getElementById("progress-fill"),Wt=document.querySelector(".progress-track"),Ve=document.getElementById("console-output"),Xe=document.getElementById("start-btn"),Gt=document.getElementById("gpu-warning"),go=document.getElementById("gpu-warning-text"),Ht=document.getElementById("gpu-ack-row"),mn=document.getElementById("gpu-ack");function Tt(e){_o.dataset.phase=e,wo.dataset.phase=e,yo.dataset.phase=e}const St={log:console.log.bind(console),warn:console.warn.bind(console),error:console.error.bind(console)},vo=400,xo=e=>{if(e instanceof Error)return e.stack||e.message;if(typeof e=="string")return e;try{return JSON.stringify(e)}catch{return String(e)}};function Pt(e,t){const n=document.createElement("div");n.className=`console-line ${e}`;const o=document.createElement("span");for(o.className="console-prefix",o.textContent=`[${e}] `,n.append(o,t.map(xo).join(" ")),Ve.appendChild(n);Ve.childElementCount>vo;)Ve.firstElementChild?.remove();Ve.scrollTop=Ve.scrollHeight}console.log=(...e)=>{Pt("log",e),St.log(...e)};console.warn=(...e)=>{Pt("warn",e),St.warn(...e)};console.error=(...e)=>{Pt("error",e),St.error(...e)};const N=e=>console.log(e);function $t(e){const t=["B","KB","MB","GB"];let n=e,o=0;for(;n>=1024&&o<t.length-1;)n/=1024,o++;return`${n>=10||o===0?n.toFixed(0):n.toFixed(1)} ${t[o]}`}function Rt(e){const t=e.percent==null?void 0:Math.max(0,Math.min(1,e.percent));if(un.textContent=e.loaded&&e.total?`${e.message} · ${$t(e.loaded)} / ${$t(e.total)}`:e.message,ho.textContent=e.phase[0].toUpperCase()+e.phase.slice(1),t==null){Wt.removeAttribute("aria-valuenow"),Kt.textContent="";return}const n=Math.round(t*100);bo.style.width=`${n}%`,Wt.setAttribute("aria-valuenow",String(n)),Kt.textContent=`${n}%`}const Vt=e=>{un.textContent=e},$={assets:{loaded:0,total:0},wasm:{loaded:0,total:0}};function vt(){const e=$.assets.loaded+$.wasm.loaded,t=$.assets.total&&$.wasm.total?$.assets.total+$.wasm.total:void 0;Rt({phase:"downloading",loaded:e,total:t,percent:t?e/t:void 0,message:"Downloading Blender"})}const fn="blender-bin-v1",Eo=e=>[e.headers.get("etag"),e.headers.get("last-modified"),e.headers.get("content-length")].join("|");async function qt(e){try{const t=new AbortController,n=setTimeout(()=>t.abort(),4e3),o=await fetch(e,{method:"HEAD",cache:"no-store",signal:t.signal});return clearTimeout(n),o.ok?Eo(o):null}catch{return null}}async function ko(e,t,n=!1){let o=null;try{o=await caches.open(fn)}catch{}if(o&&!n)try{const c=await o.match(e);if(c){const d=await qt(e);if(d===null||d===c.headers.get("x-bin-token")){const _=new Uint8Array(await c.arrayBuffer());return $[t].loaded=$[t].total=_.length,vt(),console.log("bin cache hit",e,_.length,d===null?"(server unreachable)":""),_}await o.delete(e)}}catch(c){console.warn("bin cache read failed",e,String(c))}const r=o?await qt(e):null,i=await To(e,t);if(o)try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist().catch(()=>{}),await o.put(e,new Response(i,{headers:{"x-bin-token":r??"","content-length":String(i.length)}}))}catch(c){console.warn("bin cache write failed (quota?)",e,String(c));try{await o.delete(e)}catch{}}return i}async function To(e,t){for(let n=1;;n++)try{return await So(e,t)}catch(o){if(n>=4)throw o;for(console.warn("fetch retry",n,e,String(o)),$[t].loaded=0,$[t].total=0;document.hidden;)await new Promise(r=>setTimeout(r,500));await new Promise(r=>setTimeout(r,800*n))}}async function So(e,t){const n=await fetch(e);if(!n.ok||!n.body)throw new Error(`${e}: HTTP ${n.status}`);$[t].total=Number(n.headers.get("Content-Length"))||0;const o=n.body.getReader(),r=[];for(;;){const{done:d,value:_}=await o.read();if(d)break;r.push(_),$[t].loaded+=_.byteLength,vt()}$[t].total||($[t].total=$[t].loaded),vt();const i=new Uint8Array($[t].loaded);let c=0;for(const d of r)i.set(d,c),c+=d.length;return i}const lt=new Worker(new URL(""+new URL("zstd_worker-BnM-co9b.js",import.meta.url).href,import.meta.url),{type:"module"}),Je=new Map;let Po=0;lt.onmessage=e=>{const{id:t,out:n,err:o}=e.data,r=Je.get(t);Je.delete(t),o?r.rej(new Error(o)):r.res(n)};lt.onerror=e=>{for(const t of Je.values())t.rej(new Error("zstd worker: "+(e.message||"error")));Je.clear()};const Ro=(e,t)=>new Promise((n,o)=>{const r=++Po;Je.set(r,{res:n,rej:o}),lt.postMessage({id:r,buf:e.buffer,size:t},[e.buffer])}),_n=await(async()=>{try{const e=await(await fetch("manifest.json")).text(),t=JSON.parse(e);try{localStorage.setItem("manifest.json",e)}catch{}return t}catch(e){const t=localStorage.getItem("manifest.json");if(t)return JSON.parse(t);throw e}})(),wn=()=>{const e=new URLSearchParams(location.search),t=e.get("ipad")==="1"||e.get("ipad")!=="0"&&navigator.maxTouchPoints>1&&/Macintosh|iPad/.test(navigator.userAgent);return(e.get("cycles")??(t?"0":"1"))==="1"&&_n["blender-pc.wasm.zst"]?"blender-pc":"blender"},yn=new TextDecoder;function st(e,t,n){let o=t;const r=t+n;for(;o<r&&e[o]!==0;)o++;return yn.decode(e.subarray(t,o))}function Oo(e,t){const n=e[t];if(n&128){let r=n&127;for(let i=t+1;i<t+12;i++)r=r*256+e[i];return r}const o=st(e,t,12).trim();return o?Number.parseInt(o,8):0}function Lo(e){const t=yn.decode(e),n={};let o=0;for(;o<t.length;){const r=t.indexOf(" ",o);if(r<0)break;const i=Number.parseInt(t.slice(o,r),10);if(!Number.isFinite(i)||i<=0)break;const c=t.slice(r+1,o+i-1),d=c.indexOf("=");d>=0&&(n[c.slice(0,d)]=c.slice(d+1)),o+=i}return n}function Mo(e,t){const n=st(e,t,100),o=st(e,t+345,155);return o?`${o}/${n}`:n}function Ao(e,t){for(let n=t;n<t+512;n++)if(e[n]!==0)return!1;return!0}function it(e,t,n){let o="";for(let r=0;r<t.length;r++){const i=r===t.length-1;let c=e.get(o);if(c||(c=new Set,e.set(o,c)),c.add(t[r]),i&&!n)break;o=o?`${o}/${t[r]}`:t[r],i&&!e.has(o)&&e.set(o,new Set)}}function Co(e){const t=new Map,n=new Map([["",new Set]]);let o=0,r,i;for(;o+512<=e.length&&!Ao(e,o);){const c=String.fromCharCode(e[o+156]||0),d=Oo(e,o+124),_=o+512,m=_+d;if(m>e.length)throw new Error("asset-fs: truncated tar");const y=e.subarray(_,m),w=(r?.path??i??Mo(e,o)).replace(/^\.\//,"");r=void 0,i=void 0;const b=w.split("/").filter(Boolean);if(w.startsWith("/")||b.includes(".."))throw new Error(`asset-fs: unsafe path ${w}`);c==="x"?r=Lo(y):c==="L"?i=st(y,0,y.length):b.length&&(c==="0"||c==="\0"||c==="")?(t.set(b.join("/"),y),it(n,b,!1)):b.length&&c==="5"&&it(n,b,!0),o=_+Math.ceil(d/512)*512}return{files:t,dirs:n}}const Ue=e=>e.split("/").filter(Boolean).join("/");function Bo(e){return{stat(t){const n=Ue(t),o=e.files.get(n);return o?{size:o.byteLength,isDir:!1}:e.dirs.has(n)?{size:0,isDir:!0}:null},readdir(t){const n=e.dirs.get(Ue(t));if(!n)throw new Error(`asset-fs: no such directory ${t}`);return[...n]},readFile(t){const n=e.files.get(Ue(t));if(!n)throw new Error(`asset-fs: no such file ${t}`);return n}}}let hn=!1,ue=null;function dt(){if(ue&&ue.fatal){Xe.disabled=!0;return}const t=!!(ue&&ue.software)?mn.checked:!0;Xe.disabled=!hn||!t}function Uo(e){ue=e,e.ok?(Gt.hidden=!0,Ht.hidden=!0):(Gt.hidden=!1,go.innerHTML=e.message,Ht.hidden=!e.software),dt()}async function zo(){if(!navigator.gpu)return{ok:!1,software:!1,fatal:!0,desc:"",message:"This browser has no <b>WebGPU</b> support, so Blender cannot start. Use a recent Chromium-based browser (Chrome/Edge 113+) with hardware acceleration enabled."};try{const e=await navigator.gpu.requestAdapter();if(e&&void 0,e&&(window.__noDualSrc=!e.features.has("dual-source-blending")),!e)return{ok:!1,software:!1,fatal:!0,desc:"",message:"No <b>WebGPU adapter</b> is available, so Blender cannot start. Enable hardware acceleration / GPU access in your browser and reload."};const t=e.info||{},n=[t.vendor,t.architecture,t.device,t.description].filter(Boolean).join(" | "),o=e.isFallbackAdapter||/swiftshader|software|llvmpipe|lavapipe|basic|warp|microsoft basic/i.test(n);return n&&N("WEBGPU_ADAPTER "+n),o?{ok:!1,software:!0,fatal:!1,desc:n,message:"WebGPU is running on a <b>software renderer</b>"+(n?" (<code>"+n+"</code>)":"")+" — Blender will be <b>extremely slow</b>. For real performance, enable hardware GPU acceleration (Chrome: <code>--enable-unsafe-webgpu --enable-features=Vulkan --ignore-gpu-blocklist</code>)."}:{ok:!0,software:!1,fatal:!1,desc:n,message:""}}catch(e){return{ok:!1,software:!1,fatal:!0,desc:"",message:"WebGPU probe failed ("+(e&&e.message||e)+"). Blender cannot start."}}}mn.addEventListener("change",dt);zo().then(Uo).catch(()=>{});Tt("loading");async function Yt(e,t,n){const o=_n[e];for(let r=0;;r++){const i=await ko(e,t,r>0);Rt({phase:"decompressing",percent:1,message:n});try{const c=await Ro(i,o);if(c.length!==o)throw new Error(`size ${c.length} != ${o}`);return c}catch(c){console.warn("bin cache corrupt, refetching",e,String(c));try{await(await caches.open(fn)).delete(e)}catch{}if($[t].loaded=0,$[t].total=0,r>=1)throw c}}}let[Ot,ze]=await Promise.all([Yt("assets.tar.zst","assets","Decompressing assets"),Yt(wn()+".wasm.zst","wasm","Decompressing Blender")]);lt.terminate();const Io=Bo(Co(Ot));N(`assets indexed zero-copy: ${Ot.length/1048576|0} MB · wasm ${ze.length/1048576|0} MB`);Rt({phase:"ready",percent:1,message:"Ready to launch"});Tt("ready");hn=!0;dt();if(new URLSearchParams(location.search).has("memstage")){const e=document.createElement("div");e.style.cssText="position:fixed;left:8px;bottom:8px;z-index:99999;background:#000c;color:#fff;font:13px monospace;padding:8px;max-width:520px;white-space:pre-wrap";const t=document.createElement("div");t.textContent=`KROK A: stránka načtena, drží se assets ${Ot.length/1048576|0} MB + wasm bajty ${ze.length/1048576|0} MB.
Zapiš paměť procesu této karty (Monitor aktivity), pak klikni B.`;let n=null;const o=(r,i)=>{const c=document.createElement("button");c.textContent=r,c.style.margin="4px 4px 0 0",c.onclick=async()=>{try{await i()}catch(d){t.textContent+=`
CHYBA `+d}},e.appendChild(c)};o("B: compile",async()=>{const r=performance.now();n=await WebAssembly.compile(ze),t.textContent+=`
KROK B: compile hotov za ${Math.round(performance.now()-r)} ms. Zapiš paměť, pak klikni C.`}),o("C: zahodit bajty",async()=>{ze=new Uint8Array(0),await new Promise(r=>setTimeout(r,3e3)),t.textContent+=`
KROK C: bajty zahozeny (modul ${n?"drží":"nemá"}). Zapiš paměť. Pak obnov stránku bez ?memstage a spusť Blender normálně (Launch).`}),e.appendChild(t),document.body.appendChild(e)}const No=()=>new Promise((e,t)=>{const n=indexedDB.open("blender-fs",2);n.onupgradeneeded=()=>{const o=n.result;o.objectStoreNames.contains("files")||o.createObjectStore("files",{keyPath:"path"}),o.objectStoreNames.contains("wgsl")||o.createObjectStore("wgsl",{keyPath:"key"})},n.onsuccess=()=>e(n.result),n.onerror=()=>t(n.error)});if(new URLSearchParams(location.search).get("perf")==="1"){const e=document.createElement("div");e.style.cssText="position:fixed;top:4px;right:4px;z-index:99999;background:rgba(0,0,0,.7);color:#9f9;font:12px/1.35 monospace;padding:4px 8px;border-radius:4px;pointer-events:none;white-space:pre",e.textContent="perf: čekám na snímky…",document.body?document.body.appendChild(e):document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(e));let t=0;new BroadcastChannel("blender-perf").onmessage=n=>{const o=n.data;t=performance.now(),window.__PERF__=o,e.textContent=`${(1e3/o.dt_avg_ms).toFixed(0)} FPS  ${o.dt_avg_ms.toFixed(1)} ms (max ${o.dt_max_ms.toFixed(0)})
submits ${o.submits}  passes ${o.passes}  bindgroups ${o.bindgroups}
WebGPU draw/submit ${o.api_ms.toFixed(1)} ms   immediate bufs ${o.imm_bufs} (${o.imm_kb} KB)
textures ${o.tex} / ${o.tex_mb} MB   wasm heap ${o.heap_mb.toFixed(0)} MB`},setInterval(()=>{t&&performance.now()-t>2500?e.style.opacity=".4":e.style.opacity="1"},1e3)}{const e=document.createElement("div");e.style.cssText="position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:99998;background:rgba(20,20,20,.88);color:#fff;font:14px/1.3 system-ui,sans-serif;padding:8px 16px;border-radius:8px;pointer-events:none;display:none",e.textContent="⏳ Kompiluji shadery… (jen poprvé, může to trvat několik sekund)";const t=()=>document.body.appendChild(e);document.body?t():document.addEventListener("DOMContentLoaded",t);let n=0,o=0;new BroadcastChannel("blender-compile").onmessage=()=>{const r=performance.now();n||(n=r),r-n>700&&(e.style.display="block"),clearTimeout(o),o=setTimeout(()=>{e.style.display="none",n=0,window.__COMPILE_SHOWN__=!1},2500),e.style.display==="block"&&(window.__COMPILE_SHOWN__=!0)}}window.__BGUI__={booted:!1,device:!1,window:!1};const Do=(e,t)=>{if(document.getElementById("gpu-lost"))return;window.__GPU_LOST__=e;const n=document.createElement("div");n.id="gpu-lost",n.style.cssText="position:fixed;left:0;right:0;top:0;z-index:99999;padding:14px 18px;background:#b3261e;color:#fff;font:16px system-ui;text-align:center",n.innerHTML="GPU se odpojila ("+e+"). Obnov stránku — rozdělaná práce je v <code>/opfs/home/_autosave.blend</code> (📁). <button style='margin-left:12px;font-size:16px' onclick='location.reload()'>Obnovit</button>",document.body.appendChild(n)},jo=()=>{if(document.getElementById("blender-quit"))return;window.__BLENDER_QUIT__=!0;const e=document.createElement("div");e.id="blender-quit",e.style.cssText="position:fixed;left:0;right:0;top:0;z-index:99999;padding:14px 18px;background:#444;color:#fff;font:16px system-ui;text-align:center",e.innerHTML="Blender skončil (File ▸ Quit / Ctrl+Q). Uložené soubory v 📁 zůstaly; rozdělaná práce je v <code>/opfs/home/_autosave.blend</code>. <button style='margin-left:12px;font-size:16px' onclick='location.reload()'>Spustit znovu</button>",document.body.appendChild(e)},Xt=+(new URLSearchParams(location.search).get("memwarn")||1500);let Jt=0;const bn=new URLSearchParams(location.search).has("memwarn")||new URLSearchParams(location.search).get("ipad")==="1"||navigator.maxTouchPoints>1&&/Macintosh|iPad|iPhone/.test(navigator.userAgent),Fo=e=>{try{if(!bn){window.__HEAP_MB__=Math.round(e);return}e=Math.round(e),window.__HEAP_MB__=e;const t=e>=Xt+500?2:e>=Xt?1:0;if(t<=Jt)return;Jt=t;let n=document.getElementById("mem-warn");n||(n=document.createElement("div"),n.id="mem-warn",n.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99996;color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",document.body.appendChild(n)),n.style.background=t===2?"rgba(179,38,30,.95)":"rgba(160,100,0,.95)",n.textContent=(t===2?"⚠️ Paměť "+e+" MB — iPad může tab zabít! ":"Paměť "+e+" MB — blíží se limit iPadu. ")+"Ulož práci (autosave běží) a smaž těžké objekty / sniž Subdivision. ";const o=document.createElement("button");o.textContent="OK",o.style.cssText="margin-left:8px;font-size:15px",o.onclick=()=>{n.style.display="none"},n.append(o),n.style.display="block"}catch{}};new BroadcastChannel("blender-perf").addEventListener("message",e=>{e.data&&e.data.heap_mb&&(Fo(e.data.heap_mb),Go(e.data))});const Ze=new URLSearchParams(location.search),Ko=Ze.get("memhud")==="1"||Ze.get("memhud")!=="0"&&bn,Wo=+(Ze.get("membase")||2250),yt=+(Ze.get("memlimit")||4300);let Zt=0;const Go=e=>{try{if(!Ko)return;const t=Math.round(Wo+(e.heap_used_mb||0)+(e.tex_mb||0)),n=t/yt,o=n>=.85?2:n>=.7?1:0;window.__MEMHUD__={est:t,limit:yt,pct:Math.round(n*100),level:o,used:Math.round(e.heap_used_mb||0),tex:e.tex_mb||0};let r=document.getElementById("mem-hud");r||(r=document.createElement("div"),r.id="mem-hud",r.style.cssText="position:fixed;right:6px;bottom:2px;z-index:99990;font:11px system-ui,sans-serif;padding:1px 6px;border-radius:6px;color:#fff;pointer-events:none;opacity:.85",document.body.appendChild(r)),r.style.background=["rgba(30,110,50,.9)","rgba(160,100,0,.95)","rgba(179,38,30,.95)"][o],r.textContent="RAM ~"+(t/1e3).toFixed(1).replace(".",",")+" / "+(yt/1e3).toFixed(1).replace(".",",")+" GB"+(o===1?" · ulož, vypni Rendered":"");let i=document.getElementById("mem-hud-warn");if(o===2){if(!i){i=document.createElement("div"),i.id="mem-hud-warn",i.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99995;background:rgba(179,38,30,.96);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",i.append("⚠️ Hrozí pád — ulož práci (autosave právě proběhl) a zjednoduš scénu. ");const d=document.createElement("button");d.textContent="OK",d.style.cssText="margin-left:8px;font-size:15px",d.onclick=()=>{i.style.display="none"},i.append(d),document.body.appendChild(i)}const c=Date.now();try{FS.writeFile("/tmp/mem_red.txt","1")}catch{}if(c-Zt>6e4){Zt=c;try{FS.writeFile("/tmp/autosave_req.txt","mem-red"),window.__MEMHUD_AS__=(window.__MEMHUD_AS__||0)+1}catch{}}}else i&&i.remove()}catch{}};Ze.get("memhud")==="1"&&performance.measureUserAgentSpecificMemory&&setInterval(async()=>{try{window.__UASM_MB__=Math.round((await performance.measureUserAgentSpecificMemory()).bytes/1048576)}catch{}},2e4);const Ho=e=>{const t=new Date(Number(e)*1e3),n=t.toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}),o=document.createElement("div");o.id="restored-note",o.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(20,50,80,.94);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",o.append("↩️ Obnoveno z "+n+" (rozdělaná práce) ");const r=document.createElement("button");r.textContent="Zahodit",r.style.cssText="margin-left:8px;font-size:15px",r.onclick=()=>{const c=new URL(location.href);c.searchParams.set("restore","no"),location.href=c.toString()};const i=document.createElement("button");i.textContent="OK",i.style.cssText="margin-left:6px;font-size:15px",i.onclick=()=>o.remove(),o.append(r,i),document.body.appendChild(o),window.__RESTORED_AT__=Number(e)},$o=()=>{const e=document.createElement("div");e.id="restore-crashed-note",e.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(110,50,10,.95);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",e.append("⚠️ Minule to spadlo — otevřít autosave? ");const t=document.createElement("button");t.textContent="Otevřít",t.style.cssText="margin-left:8px;font-size:15px",t.onclick=()=>{const o=new URL(location.href);o.searchParams.set("restore","auto"),location.href=o.toString()};const n=document.createElement("button");n.textContent="Ne",n.style.cssText="margin-left:6px;font-size:15px",n.onclick=()=>{localStorage.removeItem("restoring"),e.remove()},e.append(t,n),document.body.appendChild(e)},Vo=e=>{let t=document.getElementById("saved-note");t||(t=document.createElement("div"),t.id="saved-note",t.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(20,60,20,.94);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",document.body.appendChild(t)),t.innerHTML="",t.append("💾 Uloženo: "+e+" ");const n=document.createElement("button");n.textContent="📁 Stáhnout / složka",n.style.cssText="margin-left:8px;font-size:15px",n.onclick=()=>{t.style.display="none",window.__openFileManager&&window.__openFileManager()},t.append(n),t.style.display="block",clearTimeout(t._t),t._t=setTimeout(()=>{t.style.display="none"},9e3)},ht=navigator.maxTouchPoints>1&&/Macintosh|iPad/.test(navigator.userAgent)?"ze zařízení":"z počítače",qo=()=>{let e=document.getElementById("mp-note");e||(e=document.createElement("div"),e.id="mp-note",e.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(90,50,10,.95);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",e.textContent="Material Preview je vypnutý (?mp=0) — dostal jsi „MP Lite“ (Solid s texturami, světlem a stíny). Plný MP zapneš odebráním ?mp=0 z adresy.",document.body.appendChild(e)),e.style.display="block",clearTimeout(e._t),e._t=setTimeout(()=>{e.style.display="none"},9e3)},Yo=()=>{const e=document.getElementById("import-bar");e&&(e.style.display="none")},Xo=()=>{let e=document.getElementById("import-bar");if(!e){e=document.createElement("div"),e.id="import-bar",e.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(20,50,90,.95);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw";const t=document.createElement("input");t.type="file",t.multiple=!0,t.id="import-input",t.style.display="none";const n=document.createElement("button");n.id="import-btn",n.textContent="📂 Vybrat soubory "+ht+"…",n.style.cssText="margin-left:8px;font-size:15px",n.onclick=()=>t.click();const o=async(c,d,_)=>{try{const m=window.Module.FS,y=E=>{let L="";for(const g of E.split("/").filter(Boolean)){L+="/"+g;try{m.mkdir(L)}catch{}}};y("/uploads");let w=null;const b=/\.(blend|obj|fbx|glb|gltf|stl|ply|usd[acz]?|abc|dae|svg|x3d|wrl)$/i;for(const E of c){d.textContent="Nahrávám „"+E.name+"“…";const g="/uploads/"+(E.webkitRelativePath||E.name);y(g.slice(0,g.lastIndexOf("/"))),m.writeFile(g,new Uint8Array(await E.arrayBuffer())),(!w||!b.test(w)&&b.test(g))&&(w=g)}if(w){const E=w.lastIndexOf("/"),L=d===n?[...c].map(g=>g.name).join("	"):"";m.writeFile("/tmp/web_pick.txt",new TextEncoder().encode(w.slice(0,E+1)+`
`+w.slice(E+1)+(L?`
`+L:""))),e.style.display="none"}}catch(m){d.textContent="Chyba: "+(m&&m.message||m);return}d.textContent=_};t.onchange=async()=>{await o(t.files,n,"📂 Vybrat soubory "+ht+"…"),t.value=""};const r=document.createElement("input");r.type="file",r.id="import-dir-input",r.style.display="none",r.setAttribute("webkitdirectory","");const i=document.createElement("button");i.id="import-dir-btn",i.textContent="📁 Celá složka (model + textury)…",i.style.cssText="margin-left:8px;font-size:15px",i.onclick=()=>r.click(),r.onchange=async()=>{await o(r.files,i,"📁 Celá složka (model + textury)…"),r.value=""},e.append("Soubor "+ht+": ",n,t,i,r),document.body.appendChild(e)}e.style.display="block"},xt=e=>{uo(e);const t=/Writing to (\/\S+)|^Saved "([^"]+)"/.exec(e.trim());t&&Vo(t[1]||t[2]),/^Blender quit\b/.test(e.trim())&&jo();{const n=/^WEB_RESTORED (\d+)/.exec(e.trim());n&&Ho(n[1])}if(/^WEB_FONT (BAD|ERR)\b/.test(e.trim())&&!document.getElementById("font-bad")){const n=document.createElement("div");n.id="font-bad",n.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99998;background:rgba(179,38,30,.96);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",n.append("⚠️ UI fonty se nenačetly (chybí text). Obnov stránku — práce je v autosave. ");const o=document.createElement("button");o.textContent="Obnovit",o.style.cssText="margin-left:8px;font-size:15px",o.onclick=()=>location.reload(),n.append(o),document.body.appendChild(n)}if(e.includes("anim stepper: cannot open movie writer")){document.getElementById("movie-bad")?.remove();const n=document.createElement("div");n.id="movie-bad",n.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99998;background:rgba(179,38,30,.96);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:90vw",n.textContent="⚠️ Video se nepodařilo zapsat (soubor nevznikl). Liché rozlišení u H.264 (i v desktopu) nebo kodek, který web nemá (WebM, AV1…)? Zkus sudé rozlišení a MP4/Matroska s H.264.",document.body.appendChild(n),setTimeout(()=>n.remove(),15e3)}if(/^RESTORE_AUTO\b/.test(e.trim())&&(localStorage.setItem("restoring","1"),setTimeout(()=>localStorage.removeItem("restoring"),6e4)),/^RESTORE_CRASHED_OFFER\b/.test(e.trim())&&window.__RESTORE_CRASHED__&&!document.getElementById("restore-crashed-note")&&$o(),e.includes("WEB_MP_BLOCKED")&&qo(),e.startsWith("WEB_EXPORT /")&&aa(e.slice(11).trim()),e.includes("WEB_FILE_IMPORT_END")?Yo():e.includes("WEB_FILE_IMPORT")&&Xo(),e.startsWith("WEB_OPEN_URL ")){const n=e.slice(13).trim();/^https?:\/\//.test(n)&&(window.__LAST_OPEN_URL__=n,window.open(n,"_blank","noopener"))}e.includes("WEBGPU_LOST")&&Do(e.split("WEBGPU_LOST ")[1].split(" ")[0],e.split("WEBGPU_LOST ")[1]),e.includes("WEBGPU_CONTEXT")&&e.includes("real device acquired")&&(window.__BGUI__.device=!0),e.includes("WGPU_FIRST_CONTENT")&&!window.__BGUI__.window&&(window.__BGUI__.window=!0,fo.classList.add("done"),G.classList.add("ready"))};window.__scan=xt;const G=document.getElementById("canvas");window.__DPR__=Math.min(3,Math.max(1,parseFloat(new URLSearchParams(location.search).get("dpr"))||1));const gn=()=>{if(G.width!==window.innerWidth||G.height!==window.innerHeight)try{G.width=window.innerWidth,G.height=window.innerHeight}catch{}};gn();window.addEventListener("resize",gn);window.addEventListener("contextmenu",e=>e.preventDefault());Yn(G);const vn=e=>e.preventDefault();G.addEventListener("wheel",vn,{passive:!1});document.addEventListener("wheel",e=>{for(let t=e.target;t&&t!==document.documentElement;t=t.parentElement)if(t.scrollHeight>t.clientHeight+1&&/auto|scroll/.test(getComputedStyle(t).overflowY))return;e.preventDefault()},{passive:!1});let qe=1,xn=0;for(const e of["touchstart","touchend","touchcancel"])G.addEventListener(e,t=>{xn=t.touches.length},{passive:!0,capture:!0});const Lt=e=>{if(e.preventDefault(),!(xn>0)){if(e.type==="gesturestart"||typeof e.scale!="number"||!(e.scale>0)){qe=1;return}if(e.type==="gesturechange")for(;e.scale/qe>1.2||e.scale/qe<1/1.2;){const t=e.scale>qe;qe*=t?1.2:1/1.2,G.dispatchEvent(new WheelEvent("wheel",{deltaY:t?-100:100,clientX:e.clientX,clientY:e.clientY,bubbles:!0,cancelable:!0}))}}};G.addEventListener("gesturestart",Lt);G.addEventListener("gesturechange",Lt);G.addEventListener("gestureend",Lt);G.addEventListener("mousedown",e=>{e.button===1&&e.preventDefault()});G.addEventListener("dragstart",vn);const pt=e=>!!e&&(e.tagName==="INPUT"||e.tagName==="TEXTAREA"||e.tagName==="SELECT"||e.isContentEditable),Jo=new Set(["Tab"," ","Spacebar","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","PageUp","PageDown","Home","End","Backspace","/"]),at=new Map,En=e=>e.altKey||!/^Key[A-Z]$/.test(e.code)||!/^[a-zA-Z]$/.test(e.key)?e.code:"Key"+e.key.toUpperCase(),Zo=new Set(["KeyR","KeyT","KeyW","KeyN","KeyQ","KeyL","KeyH","KeyM","Tab"]);let Qe=!1;const Qt=(e,t,n,o,r,i)=>window.dispatchEvent(new KeyboardEvent(e,{code:t,key:n,bubbles:!0,cancelable:!0,ctrlKey:!0,shiftKey:o,altKey:r,repeat:!!i})),Qo=()=>{Qe&&(Qe=!1,window.dispatchEvent(new KeyboardEvent("keyup",{code:"ControlLeft",key:"Control",bubbles:!0,cancelable:!0})))};window.addEventListener("keydown",e=>{if(!window.Module||!e.isTrusted||pt(document.activeElement))return;if(e.code==="MetaLeft"||e.code==="MetaRight"){e.stopImmediatePropagation();return}if(!e.metaKey||e.ctrlKey||!e.code||Zo.has(e.code))return;e.stopImmediatePropagation(),e.code!=="KeyV"&&e.preventDefault(),Qe||(Qe=!0,window.dispatchEvent(new KeyboardEvent("keydown",{code:"ControlLeft",key:"Control",ctrlKey:!0,bubbles:!0,cancelable:!0})));const t=En(e);Qt("keydown",t,e.key,e.shiftKey,e.altKey,e.repeat),setTimeout(()=>Qt("keyup",t,e.key,e.shiftKey,e.altKey),40)},{capture:!0});window.addEventListener("keyup",e=>{if(e.isTrusted){if(e.code==="MetaLeft"||e.code==="MetaRight"){e.stopImmediatePropagation(),setTimeout(Qo,60);return}e.metaKey&&Qe&&e.stopImmediatePropagation()}},{capture:!0});window.addEventListener("keydown",e=>{if(!window.Module||!e.isTrusted||pt(document.activeElement))return;const t=En(e);t!==e.code&&(e.stopImmediatePropagation(),e.preventDefault(),at.set(e.code,t),window.dispatchEvent(new KeyboardEvent("keydown",{code:t,key:e.key,bubbles:!0,cancelable:!0,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey,repeat:e.repeat})))},{capture:!0});window.addEventListener("keyup",e=>{if(!e.isTrusted||!at.has(e.code))return;const t=at.get(e.code);at.delete(e.code),e.stopImmediatePropagation(),window.dispatchEvent(new KeyboardEvent("keyup",{code:t,key:e.key,bubbles:!0,cancelable:!0,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey}))},{capture:!0});window.addEventListener("keydown",e=>{window.Module&&(pt(document.activeElement)||(e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==="v"||e.key==="V")||(e.ctrlKey||e.metaKey||Jo.has(e.key)||/^F([1-9]|1[0-2])$/.test(e.key)||e.altKey&&/^[a-zA-Z]$/.test(e.key))&&e.preventDefault())},{capture:!0});window.addEventListener("paste",e=>{if(!window.Module||!Module.ccall||pt(document.activeElement))return;const t=e.clipboardData&&e.clipboardData.getData("text/plain");if(typeof t=="string")try{Module.ccall("blender_web_set_clipboard",null,["string"],[t])}catch{}},!0);const Be=new Map;window.addEventListener("keydown",e=>{e.isTrusted&&Be.set(e.code,{code:e.code,key:e.key,keyCode:e.keyCode})},!0);window.addEventListener("keyup",e=>{Be.delete(e.code)},!0);const kn=()=>{for(const e of Be.values())window.dispatchEvent(new KeyboardEvent("keyup",{code:e.code,key:e.key,keyCode:e.keyCode,bubbles:!0,cancelable:!0}));Be.size&&N("KEYS_RELEASED_ON_BLUR "+[...Be.keys()].join(",")),Be.clear()};window.addEventListener("blur",kn);document.addEventListener("visibilitychange",()=>{document.hidden&&kn()});if(new URLSearchParams(location.search).get("mouserelease")!=="0"){const e=new Set,t={0:1,1:4,2:2,3:8,4:16};let n=0,o=0;const r=(c,d,_)=>{e.delete(c);const m=`H32_RELEASE why=${d} button=${c} target=${_?_.id||_.tagName:"-"}`;console.log(m),_&&(_.id||_.tagName),G.dispatchEvent(new MouseEvent("mouseup",{bubbles:!0,cancelable:!0,view:window,clientX:n,clientY:o,button:c,buttons:0}))},i=c=>{for(const d of[...e])r(d,c)};G.addEventListener("mousedown",c=>{c.isTrusted&&(e.add(c.button),n=c.clientX,o=c.clientY)},!0),window.addEventListener("mouseup",c=>{c.isTrusted&&(n=c.clientX,o=c.clientY,c.target===G?e.delete(c.button):e.has(c.button)&&r(c.button,"offcanvas",c.target))},!0),window.addEventListener("mousemove",c=>{if(c.isTrusted){n=c.clientX,o=c.clientY;for(const d of[...e])c.buttons&t[d]||r(d,"move_nobtn",c.target)}},!0),window.addEventListener("pointercancel",c=>{c.isTrusted&&c.pointerType==="mouse"&&i("pointercancel")},!0),window.addEventListener("blur",()=>i("blur")),document.addEventListener("visibilitychange",()=>{document.hidden&&i("hidden")})}const ut="/mnt",ea=(e,t)=>new Promise((n,o)=>{const r=indexedDB.open("blender-localmount",1);r.onupgradeneeded=()=>{const i=r.result;i.objectStoreNames.contains("handles")||i.createObjectStore("handles",{keyPath:"key"})},r.onsuccess=()=>{const c=r.result.transaction("handles","readwrite");c.objectStore("handles").put({key:e,handle:t}),c.objectStore("handles").put({key:"current",handle:t}),c.oncomplete=()=>n(),c.onerror=()=>o(c.error)},r.onerror=()=>o(r.error)}),en=e=>new Promise(t=>{const n=indexedDB.open("blender-localmount",1);n.onupgradeneeded=()=>{const o=n.result;o.objectStoreNames.contains("handles")||o.createObjectStore("handles",{keyPath:"key"})},n.onsuccess=()=>{try{const o=n.result.transaction("handles").objectStore("handles").get(e);o.onsuccess=()=>t(o.result?o.result.handle:null),o.onerror=()=>t(null)}catch{t(null)}},n.onerror=()=>t(null)}),tn=new BroadcastChannel("localdir-perm");tn.onmessage=async e=>{const t=e.data;if(!t||t.type!=="request")return;let n=!1;try{const o=await en(t.mountPoint)||await en("current");if(o&&o.requestPermission){let r=await o.queryPermission({mode:"readwrite"});r!=="granted"&&(r=await o.requestPermission({mode:"readwrite"})),n=r==="granted"}}catch(o){N("localdir readwrite promotion failed: "+(o&&o.message||o))}tn.postMessage({type:"response",id:t.id,granted:n})};async function ta(e){const t=[],n=async(o,r)=>{for await(const[i,c]of o.entries()){const d=r?r+"/"+i:i;c.kind==="directory"?(t.push("D	"+d),await n(c,d)):t.push("F	"+d)}};return await n(e,""),t}const nn=new Set,Tn=new Map;let Ie=!1;const Sn=(()=>{try{return window.self!==window.top}catch{return!0}})(),Et=!!window.showDirectoryPicker&&!Sn&&new URLSearchParams(location.search).get("webkit_sim")!=="1";if(Sn){const e=document.createElement("a");e.id="open-new-window",e.href=location.href,e.target="_blank",e.rel="noopener",e.textContent="↗ Otevřít v novém okně",e.style.cssText="position:fixed;right:8px;bottom:8px;z-index:900;padding:6px 10px;border-radius:6px;background:#222c;color:#ddd;font:13px system-ui,sans-serif;text-decoration:none;",document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(e)),document.readyState!=="loading"&&document.body.appendChild(e)}async function Mt(){const e=await window.showDirectoryPicker({mode:"read"}),t=ut+"/"+e.name;if(!nn.has(e.name)){await ea(t,e);const n=await ta(e);Tn.set(e.name,n.filter(i=>i.startsWith("F	")&&!i.includes("/")&&/\.blend$/i.test(i)).map(i=>i.slice(2)));const o=window.Module.ccall("wasmfs_mount_localdir","number",["string","string"],[t,n.join(`
`)]);if(o!==0)throw new Error("mount spawn failed ("+o+")");let r=0;for(let i=0;i<300&&r===0;i++)await new Promise(c=>setTimeout(c,50)),r=window.Module.ccall("wasmfs_localdir_mount_status","number",[],[]);if(r!==1)throw new Error("mount did not complete (status "+r+")");nn.add(e.name),N("mounted "+n.length+" entries at "+t)}return t}function na(){return new Promise(e=>{const t=document.createElement("div");t.style.cssText="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:14px system-ui,sans-serif;color:#ddd;";const n=document.createElement("div");n.id="localdir-dropzone",n.style.cssText="width:440px;max-width:86vw;padding:26px;border-radius:10px;background:#1c1c1c;border:2px dashed #555;text-align:center;transition:border-color .12s,background .12s;",n.innerHTML="<div style='font-size:17px;font-weight:600;margin-bottom:8px'>Open a folder</div><div style='color:#aaa;line-height:1.5'>Your browser doesn't support the folder picker.<br><b>Drag &amp; drop a folder here</b> to open it.<br>(iPad: choose a file instead)</div><button id='dz-files' style='margin-top:14px;padding:12px 22px;border:0;border-radius:8px;background:#e87d0d;color:#111;font:600 16px system-ui;cursor:pointer'>Choose file(s)…</button><input id='dz-input' type='file' multiple style='display:none'><div id='dz-status' style='margin-top:14px;color:#e87d0d;min-height:18px'></div><button id='dz-cancel' style='margin-top:16px;padding:6px 16px;border:0;border-radius:5px;background:#333;color:#ddd;cursor:pointer'>Cancel</button>",t.appendChild(n),document.body.appendChild(t);const o=n.querySelector("#dz-status");let r=!1;const i=m=>{r||(r=!0,t.remove(),e(m))};n.querySelector("#dz-cancel").onclick=()=>i(null);const c=n.querySelector("#dz-input");n.querySelector("#dz-files").onclick=()=>c.click();const d=async m=>{try{const y=window.Module.FS;try{y.mkdir("/uploads")}catch{}for(const b of m)o.textContent="Loading “"+b.name+"”…",y.writeFile("/uploads/"+b.name,new Uint8Array(await b.arrayBuffer()));const w=[...m];w.length===1&&/\.blend$/i.test(w[0].name)?i("file:/uploads/"+w[0].name):w.length&&i("/uploads")}catch(y){o.textContent="Failed: "+(y&&y.message||y)}};c.onchange=()=>d(c.files),t.addEventListener("click",m=>{m.target===t&&i(null)});const _=m=>{n.style.borderColor=m?"#e87d0d":"#555",n.style.background=m?"#242018":"#1c1c1c"};["dragenter","dragover"].forEach(m=>n.addEventListener(m,y=>{y.preventDefault(),y.stopPropagation(),_(!0)})),["dragleave","dragend"].forEach(m=>n.addEventListener(m,y=>{y.preventDefault(),_(!1)})),n.addEventListener("drop",async m=>{m.preventDefault(),m.stopPropagation(),_(!1);const y=m.dataTransfer&&m.dataTransfer.items;let w=null;for(let b=0;y&&b<y.length;b++){const E=y[b].webkitGetAsEntry&&y[b].webkitGetAsEntry();if(E&&E.isDirectory){w=E;break}}if(!w){m.dataTransfer.files.length?d(m.dataTransfer.files):o.textContent="Please drop a folder or a file.";return}try{o.textContent="Reading “"+w.name+"”…";const b=await oa(w);i(b)}catch(b){o.textContent="Failed: "+(b&&b.message||b)}})})}const on=1;async function oa(e){const t=ut+"/"+e.name,n=m=>new Promise((y,w)=>{const b=m.createReader(),E=[],L=()=>b.readEntries(g=>{if(!g.length)return y(E);E.push(...g),L()},w);L()}),o=m=>new Promise((y,w)=>m.file(y,w)),r=new Map,i=new Map([["",new Set]]),c=async(m,y)=>{for(const w of await n(m)){const b=y?y+"/"+w.name:w.name,E=b.split("/").filter(Boolean);w.isDirectory?(it(i,E,!0),await c(w,b)):(r.set(b,w),it(i,E,!1))}};await c(e,"");const d={async stat(m){const y=Ue(m),w=r.get(y);return w?{size:(await o(w)).size,isDir:!1}:i.has(y)?{size:0,isDir:!0}:null},readdir(m){const y=i.get(Ue(m));if(!y)throw new Error(`drop-fs: no such directory ${m}`);return[...y]},async readFile(m){const y=r.get(Ue(m));if(!y)throw new Error(`drop-fs: no such file ${m}`);const w=await o(y);return new Uint8Array(await w.arrayBuffer())}};Module.geckoProviders=Module.geckoProviders||{},Module.geckoProviders[on]=d;const _=window.Module.ccall("blender_web_mount_provider","number",["number","string"],[on,t]);if(_!==0)throw new Error("provider mount failed ("+_+")");return N("mounted "+r.size+" files at "+t+" (drag-drop, on-demand)"),t}window.__blenderSaveHook=async()=>{if(!Ie&&!(!window.Module||!window.Module.ccall)){Ie=!0;try{const e=await Mt();e&&window.Module.ccall("blender_web_file_save_at",null,["string"],[e+"/"])}catch(e){e&&e.name==="AbortError"||N("Save folder pick failed: "+(e&&e.message||e))}finally{Ie=!1}}};window.__blenderSaveDownload=e=>{try{const t=window.Module.FS.readFile(e),n=e.split("/").pop()||"untitled.blend",o=new Blob([t],{type:"application/octet-stream"}),r=URL.createObjectURL(o),i=document.createElement("a");i.href=r,i.download=n,document.body.appendChild(i),i.click(),i.remove(),setTimeout(()=>URL.revokeObjectURL(r),15e3);try{window.Module.FS.unlink(e)}catch{}N("downloaded "+n+" ("+t.length+" bytes)")}catch(t){N("save download failed: "+(t&&t.message||t))}};const Ne=new Map,aa=e=>{Ne.set(e,Date.now()),clearTimeout(Ne._t),Ne._t=setTimeout(sa,800)},ra=e=>{const t=window.Module.FS.readFile(e),n=document.createElement("a"),o=URL.createObjectURL(new Blob([t],{type:"application/octet-stream"}));n.href=o,n.download=e.split("/").pop()||"export",document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(o),15e3),N("downloaded "+n.download+" ("+t.length+" bytes)")},sa=()=>{let e=document.getElementById("export-bar");e||(e=document.createElement("div"),e.id="export-bar",e.style.cssText="position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:99997;background:rgba(20,60,20,.95);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",document.body.appendChild(e)),e.innerHTML="";const t=window.Module.FS,n=[...Ne.keys()].filter(r=>{try{return t.stat(r).size>0}catch{return!1}});if(!n.length){e.style.display="none";return}e.append("💾 Export hotový: ");for(const r of n.slice(0,6)){const i=document.createElement("button");i.className="export-dl",i.dataset.path=r,i.textContent="⬇ Stáhnout "+r.split("/").pop(),i.style.cssText="margin:0 4px;font-size:15px",i.onclick=()=>{try{ra(r)}catch(c){i.textContent="Chyba: "+(c&&c.message||c)}},e.append(i)}n.length>6&&e.append("+"+(n.length-6)+" dalších ");const o=document.createElement("button");o.textContent="✕",o.style.cssText="margin-left:8px;font-size:15px",o.onclick=()=>{Ne.clear(),e.style.display="none"},e.append(o),e.style.display="block",Ne.clear()};function ia(){return new Promise(e=>{const t=document.createElement("div");t.id="open-chooser",t.style.cssText="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:14px system-ui,sans-serif;color:#ddd;",t.innerHTML="<div style='width:460px;max-width:88vw;padding:24px;border-radius:10px;background:#1c1c1c;text-align:center'><div style='font-size:17px;font-weight:600;margin-bottom:10px'>Otevřít .blend</div><div style='color:#aaa;line-height:1.5'>Vyber <b>SLOŽKU</b>, ve které je tvůj .blend (Blender pak uvidí celou složku i s texturami).</div><button id='oc-folder' style='margin-top:16px;padding:12px 22px;border:0;border-radius:8px;background:#e87d0d;color:#111;font:600 16px system-ui;cursor:pointer'>Vybrat složku…</button><div style='margin-top:14px;color:#aaa'>nebo</div><button id='oc-file' style='margin-top:10px;padding:10px 20px;border:0;border-radius:8px;background:#333;color:#ddd;font:15px system-ui;cursor:pointer'>Jen jeden soubor…</button><div style='margin-top:6px;color:#888;font-size:12px'>(textury vedle souboru se nenačtou)</div><div><button id='oc-cancel' style='margin-top:16px;padding:6px 16px;border:0;border-radius:5px;background:#2a2a2a;color:#ddd;cursor:pointer'>Zrušit</button></div></div>",document.body.appendChild(t);const n=o=>{t.remove(),e(o)};t.querySelector("#oc-folder").onclick=()=>n("folder"),t.querySelector("#oc-file").onclick=()=>n("file"),t.querySelector("#oc-cancel").onclick=()=>n(null),t.addEventListener("click",o=>{o.target===t&&n(null)})})}function Pn(){return new Promise(e=>{const t=document.createElement("input");t.type="file",t.accept=".blend",t.id="open-single-input",t.style.display="none",document.body.appendChild(t),t.addEventListener("cancel",()=>{t.remove(),e(null)}),t.onchange=async()=>{const n=t.files[0];if(t.remove(),!n)return e(null);const o=window.Module.FS;try{o.mkdir("/uploads")}catch{}o.writeFile("/uploads/"+n.name,new Uint8Array(await n.arrayBuffer())),e("file:/uploads/"+n.name)},t.click()})}const ca=new URLSearchParams(location.search).get("openchooser")==="1";async function la(){try{const[e]=await window.showOpenFilePicker({multiple:!1,types:[{description:"Blender .blend",accept:{"application/x-blender":[".blend"]}}]}),t=await e.getFile(),n=window.Module.FS;try{n.mkdir("/uploads")}catch{}return n.writeFile("/uploads/"+t.name,new Uint8Array(await t.arrayBuffer())),"file:/uploads/"+t.name}catch(e){return e&&e.name==="AbortError"?null:(N("showOpenFilePicker failed, fallback: "+(e&&e.message||e)),Pn())}}function da(){let e=document.getElementById("open-folder-offer");e&&e.remove(),e=document.createElement("div"),e.id="open-folder-offer",e.style.cssText="position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99997;background:rgba(20,50,90,.95);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",e.append("Chybí textury? ");const t=document.createElement("button");t.id="open-folder-btn",t.textContent="📁 Otevřít celou složku…",t.style.cssText="margin-left:8px;font-size:15px",t.onclick=async()=>{e.remove();try{const o=await Mt();o&&window.Module.ccall("blender_web_file_open_at",null,["string"],[o+"/"])}catch(o){o&&o.name==="AbortError"||N("folder pick failed: "+(o&&o.message||o))}};const n=document.createElement("button");n.textContent="✕",n.style.cssText="margin-left:6px;font-size:15px",n.onclick=()=>e.remove(),e.append(t,n),document.body.appendChild(e),setTimeout(()=>e.remove(),2e4)}function Rn(e){const t=window.Module.FS;let n="0";try{n=new TextDecoder().decode(t.readFile("/tmp/dirty.txt"))}catch{}n==="1"&&!window.confirm("Aktuální scéna má neuložené změny. Otevřít soubor a změny zahodit?")||(t.writeFile("/tmp/open_req.txt",e),N("open .blend directly: "+e))}try{history.pushState({blender:1},""),window.addEventListener("popstate",()=>{let e="0";try{e=new TextDecoder().decode(window.Module.FS.readFile("/tmp/dirty.txt"))}catch{}e!=="1"||window.confirm("Odejít z Blenderu? Neuložené změny se ztratí.")?history.back():history.pushState({blender:1},"")})}catch{}const On=e=>!!e.dataTransfer&&[...e.dataTransfer.types||[]].includes("Files");window.addEventListener("dragover",e=>{On(e)&&e.preventDefault()});window.addEventListener("drop",async e=>{if(!On(e))return;e.preventDefault();const t=[...e.dataTransfer.files];if(!t.length||!window.Module||!window.Module.FS)return;const n=window.Module.FS;try{n.mkdir("/uploads")}catch{}for(const o of t)n.writeFile("/uploads/"+o.name,new Uint8Array(await o.arrayBuffer()));N("dropped "+t.map(o=>o.name).join(", ")),t.length===1&&/\.blend$/i.test(t[0].name)?Rn("/uploads/"+t[0].name):n.writeFile("/tmp/drop_req.txt",t.map(o=>"/uploads/"+o.name).join(`
`))});window.__blenderFileOpenHook=async()=>{if(!Ie&&!(!window.Module||!window.Module.ccall)){Ie=!0;try{let e=null;if(Et&&!ca)e=await la(),e&&da();else if(Et){const t=await ia();if(t==="folder"){e=await Mt();const n=Tn.get(e.slice(ut.length+1))||[];n.length===1&&(e="file:"+e+"/"+n[0])}else t==="file"&&(e=await Pn())}else e=await na();e&&e.startsWith("file:")?Rn(e.slice(5)):e&&window.Module.ccall("blender_web_file_open_at",null,["string"],[e+"/"])}catch(e){e&&e.name==="AbortError"||N("File ▸ Open mount failed: "+(e&&e.message||e))}finally{Ie=!1}}};const an=new URLSearchParams(location.search).get("safe")==="1";function pa(){const e=+(window.__WATCHDOG_MS||45e3);setTimeout(()=>{if(window.__BGUI__.window||document.getElementById("start-hang"))return;const t=document.createElement("div");t.id="start-hang",t.style.cssText="position:fixed;left:0;right:0;top:0;z-index:99999;padding:14px 18px;background:#8a5a00;color:#fff;font:16px system-ui;text-align:center",t.innerHTML=`Start trvá nezvykle dlouho. Po pádu může iPad držet zámek souborů: <b>zavři tento tab úplně</b> (přepínač aplikací) a otevři stránku znovu. <button style='margin-left:12px;font-size:16px' onclick="location.search='?safe=1'">Spustit bez ukládání</button>`,document.body.appendChild(t);const n=setInterval(()=>{window.__BGUI__.window&&(t.remove(),clearInterval(n))},1e3)},e)}async function ua(){if(await window.__swCheck,window.__blenderStarted=!0,ue&&ue.fatal){console.error(ue.message.replace(/<[^>]+>/g,""));return}ue&&ue.software&&console.warn("WebGPU is using a SOFTWARE renderer — Blender will be extremely slow."),Tt("console"),Xe.disabled=!0,Xe.textContent="Starting…",pa();const e=(new URLSearchParams(location.search).get("shadowpool")||"128").replace(/[^0-9]/g,"")||"128",t=(new URLSearchParams(location.search).get("autosave")||"30").replace(/[^0-9]/g,"")||"30",n=new URLSearchParams(location.search).get("restore"),o=localStorage.getItem("restoring")==="1"&&n!=="auto"&&n!=="ask",r=(()=>{if(o)return"crashed";const u=n;return u==="no"||u==="ask"||u==="auto"?u:new URLSearchParams(location.search).get("auto")||window.__BARGS?"ask":"auto"})();o&&(window.__RESTORE_CRASHED__=!0);const i=(new URLSearchParams(location.search).get("undomem")||"300").replace(/[^0-9]/g,"")||"300",c=new URLSearchParams(location.search).get("resetprefs")==="1"?"1":"0",d=(new URLSearchParams(location.search).get("uiscale")||"").replace(/[^0-9.]/g,""),_=new URLSearchParams(location.search),m=_.get("ipad")==="1"||_.get("ipad")!=="0"&&navigator.maxTouchPoints>1&&/Macintosh|iPad/.test(navigator.userAgent),y=m&&_.get("mp")==="0"?"1":"0",w=_.get("mplite")==="1"||m&&_.get("mp")!=="0"?"1":"0",b=(_.get("mppx")||"2").replace(/[^0-9]/g,"")||"2",E=`import bpy
from bpy.app.handlers import persistent
def _cap_pool():
    try:
        for sc in bpy.data.scenes: sc.eevee.shadow_pool_size = '${e}'
    except Exception as e: print('shadowpool', e)
def _cap_pool_opened():
    # iPad: soubor otevřený z disku nese 512 MB shadow pool (+384 MB) → zastropovat jen když je větší než cíl
    try:
        cap = int('${e}')
        for sc in bpy.data.scenes:
            if int(sc.eevee.shadow_pool_size) > cap:
                sc.eevee.shadow_pool_size = '${e}'; print('SHADOWPOOL capped')
    except Exception as e: print('shadowpool', e)
@persistent
def _on_new(*a):
    if not bpy.data.filepath: _cap_pool()
    elif '${y}' == '1' and '${_.get("shadowpool")||""}' == '': _cap_pool_opened()
# Preferences: --factory-startup nečte userpref a na webu není „quit“, který by je uložil → UI scale, navigace,
# klávesové zkratky apod. se po každém načtení stránky ztrácely. Načíst při startu, ukládat při změně.
import os as _os
_UP = bpy.utils.user_resource('CONFIG') + '/userpref.blend'
try:
    if '${c}' == '1' and _os.path.exists(_UP): _os.remove(_UP); print('USERPREF reset')
    if _os.path.exists(_UP): bpy.ops.wm.read_userpref(); print('USERPREF loaded')
except Exception as e: print('USERPREF load ERR', e)
try:
    if '${d}': bpy.context.preferences.view.ui_scale = max(0.5, min(3.0, float('${d}'))); print('UISCALE set ${d}', flush=True)
except Exception as e: print('UISCALE ERR', e)
# Undo paměť: každý undo krok s velkou změnou meshe drží plnou kopii (fuzz: halda 1→3,7 GB za 40 těžkých kroků).
# iPad to nepřežije → výchozí limit ${i} MB (Preferences ▸ System ▸ Undo Memory Limit; ?undomem=0 = bez limitu).
try:
    if float('${i}') > 0 and bpy.context.preferences.edit.undo_memory_limit == 0: bpy.context.preferences.edit.undo_memory_limit = int(float('${i}'))
except Exception as e: print('UNDOMEM ERR', e)
# H7: na iPadu zatím Material Preview/Rendered shazuje GPU → místo toho Solid „MP Lite“ (H22a) + hláška (JS ji zachytí z WEB_MP_BLOCKED).
def _mp_lite_colors(*a):
    # H22g: Workbench kreslí barvu Viewport Display (diffuse_color), ne Base Color z uzlů → u výchozí šedé ji vezmi z Principled BSDF.
    try:
        for m in bpy.data.materials:
            if not m.use_nodes or not m.node_tree or tuple(round(c, 3) for c in m.diffuse_color) != (0.8, 0.8, 0.8, 1.0): continue
            bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not bsdf: continue
            bc = bsdf.inputs['Base Color']
            if bc.is_linked: continue
            m.diffuse_color = tuple(bc.default_value)
            m.metallic = bsdf.inputs['Metallic'].default_value; m.roughness = bsdf.inputs['Roughness'].default_value
    except Exception as e: print('MPLITE_COLORS ERR', e)
def _mp_guard():
    try:
        for win in bpy.context.window_manager.windows:
            for a in win.screen.areas:
                if a.type == 'VIEW_3D':
                    for sp in a.spaces:
                        if sp.type == 'VIEW_3D' and sp.shading.type in {'MATERIAL', 'RENDERED'}:
                            _mp_lite_colors()
                            sh = sp.shading; sh.type = 'SOLID'
                            # H22a „MP Lite“: Workbench s texturami z materiálů, studiové světlo, bez EEVEE
                            sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_specular_highlight = True
                            sh.show_shadows = True; sh.show_cavity = True; sh.use_dof = False
                            print('WEB_MP_BLOCKED', flush=True)
    except Exception as e: print('MPGUARD ERR', e)
    return 0.5
if '${y}' == '1': bpy.app.timers.register(_mp_guard, first_interval=1.0, persistent=True)
# H24: bl_pkg (Extensions ▸ Install from Disk / Install) spouští blender_ext.py jako podproces → na webu OSError 138
# (emscripten nepodporuje procesy). Nahraď command_output_from_json_0 verzí, která CLI spustí V PROCESU a vrátí stejné zprávy.
def _bl_pkg_inproc(args, use_idle, *, python_args):
    import io, json, contextlib
    import bl_pkg.bl_extension_utils as U
    E = U._web_ext
    buf = io.StringIO(); code = 1
    import shutil
    _o_rename, _o_replace = _os.rename, _os.replace
    def _mv(src, dst, *a, _orig=_o_rename, **k):
        # OPFS (wasmfs) neumí přejmenovat adresář („Resource busy“) → zkopíruj a smaž.
        try: return _orig(src, dst, *a, **k)
        except OSError:
            if _os.path.isdir(src):
                shutil.copytree(src, dst); shutil.rmtree(src)
            else:
                shutil.copy2(src, dst); _os.remove(src)
    _os.rename = _os.replace = _mv
    try:
        with contextlib.redirect_stdout(buf):
            code = E.main([*args, '--output-type=JSON_0'])
    except SystemExit as e: code = e.code
    except BaseException as e:
        buf.write(json.dumps(['ERROR', 'blender_ext in-process: ' + repr(e)]) + chr(0))
    finally:
        _os.rename, _os.replace = _o_rename, _o_replace
    msgs = []
    for part in buf.getvalue().split(chr(0)):
        if part.strip():
            j = json.loads(part); msgs.append((j[0], j[1]))
    print('BL_PKG inproc', args[0] if args else '', 'exit', code, 'msgs', len(msgs), flush=True)
    for m in msgs: print('BL_PKG msg', str(m)[:130], flush=True)
    yield msgs
def _patch_bl_pkg():
    try:
        import importlib.util, sys as _sys
        import bl_pkg.bl_extension_utils as U
        if getattr(U, '_web_ext', None) is not None: return None
        path = _os.path.join(U.BASE_DIR, 'cli', 'blender_ext.py')
        spec = importlib.util.spec_from_file_location('blender_ext_inproc', path)
        mod = importlib.util.module_from_spec(spec); _sys.modules['blender_ext_inproc'] = mod; spec.loader.exec_module(mod)
        U._web_ext = mod; U.command_output_from_json_0 = _bl_pkg_inproc
        print('BL_PKG patched (in-process blender_ext)', flush=True)
        return None
    except ImportError: return 2.0
    except Exception as e:
        print('BL_PKG patch ERR', e, flush=True); return None
bpy.app.timers.register(_patch_bl_pkg, first_interval=1.0, persistent=True)
# H19: import operátory (File ▸ Import, Image ▸ Open, Append…) otevřou vnitřní file browser, který vidí jen wasm FS.
# Pokud takový browser vznikne, řekni stránce (WEB_FILE_IMPORT → tlačítko „Vybrat soubory z počítače“); stránka nahraje
# soubory do /uploads a zapíše /tmp/web_pick.txt (adresář + jména) → tady je nastavíme do file browseru.
_imp = {'seen': set()}
def _is_import_op(idn):
    # H23: SpaceFileBrowser.active_operator.bl_idname je ve tvaru 'IMAGE_OT_open' (ne 'image.open') → normalizuj.
    idn = idn.lower().replace('_ot_', '.')
    # H24: Preferences ▸ Add-ons/Extensions ▸ Install from Disk (extensions.package_install_files, preferences.addon_install,
    # theme/studiolight/app_template_install) je taky čtecí file browser → stejná lišta „Vybrat soubory z počítače“.
    # H42 (Lukáš 9.11.): seznam povolených operátorů pořád něco vynechal (Add ▸ Image ▸ Reference, ikonka složky u cesty
    # v poli = buttons.file_browse, sequencer strip_add, node.add_file…). Obráceně: KAŽDÝ souborový prohlížeč je "čtecí"
    # (ukáže lištu „Vybrat soubory ze zařízení“), KROMĚ těch, co ukládají. Zbytečná lišta nevadí, chybějící zablokuje uživatele.
    # H42a (17. 11., h42_win.sh): wm.recover_auto_save ČTE soubor (název obsahuje 'save'), sound.mixdown ZAPISUJE zvuk.
    if 'recover' in idn: return True
    if any(w in idn for w in ('export', 'save', 'render.', 'bake', 'write', 'screenshot', 'directory_browse', 'mixdown')):
        return False
    return True
_u3 = {'close': None}
def _u3_cleanup():
    # po file.execute zůstal Blenderův prohlížeč otevřený → zavřít (cancel), když tentýž areál po chvíli pořád existuje
    c = _u3['close']
    if not c: return
    for win in bpy.context.window_manager.windows:
        for a in win.screen.areas:
            if a.type == 'FILE_BROWSER' and a.as_pointer() == c[0]:
                _u3['close'] = (c[0], c[1] - 1)
                if c[1] <= 4:
                    try:
                        with bpy.context.temp_override(window=win, area=a, region=[r for r in a.regions if r.type == 'WINDOW'][0]):
                            try: bpy.ops.file.cancel()
                            except Exception: bpy.ops.screen.back_to_previous()
                        print('U3_CLOSED', flush=True)
                    except Exception as e: print('U3_CLOSE failed', e, flush=True)
                    _u3['close'] = None
                return
    _u3['close'] = None
_DIRECT_OK = ('image.open', 'object.empty_image_add', 'node.add_file', 'wm.obj_import', 'wm.stl_import', 'wm.ply_import', 'wm.usd_import',
              'wm.alembic_import', 'wm.collada_import', 'import_scene.fbx', 'import_scene.gltf', 'import_scene.obj', 'import_curve.svg', 'import_anim.bvh', 'import_scene.x3d')
def _direct_ok(idn): return idn.lower().replace('_ot_', '.') in _DIRECT_OK
def _import_assist():
    try:
        _u3_cleanup()
        cur = set()
        pick = None
        if _os.path.exists('/tmp/web_pick.txt'):
            pick = open('/tmp/web_pick.txt').read().split('\\n'); _os.remove('/tmp/web_pick.txt')
        for win in bpy.context.window_manager.windows:
            for a in win.screen.areas:
                if a.type != 'FILE_BROWSER': continue
                for sp in a.spaces:
                    if sp.type != 'FILE_BROWSER' or sp.active_operator is None or not _is_import_op(sp.active_operator.bl_idname): continue
                    key = sp.as_pointer(); cur.add(key)
                    if key not in _imp['seen']:
                        _imp['seen'].add(key); print('WEB_FILE_IMPORT ' + sp.active_operator.bl_idname.lower().replace('_ot_', '.'), flush=True)
                    if pick and len(pick) > 1:
                        sp.params.directory = pick[0].encode(); sp.params.filename = pick[1]
                        print('WEB_FILE_IMPORT_PICKED ' + pick[0] + ' ' + str(len(pick) - 1), flush=True)
                        if len(pick) > 2 and pick[2] and _direct_ok(sp.active_operator.bl_idname):
                            # U3: rovnou spustit (jako tlačítko Import), uživatel nemusí v Blenderově prohlížeči klikat znovu
                            try:
                                reg = [r for r in a.regions if r.type == 'WINDOW'][0]
                                with bpy.context.temp_override(window=win, area=a, region=reg, space_data=sp):
                                    names = pick[2].split('	')
                                    if len(names) > 1 and sp.active_operator.bl_idname.lower().replace('_ot_', '.') == 'image.open':
                                        op = sp.active_operator
                                        for n in names: bpy.data.images.load(pick[0] + n, check_existing=True)
                                        print('U3_DIRECT images ' + str(len(names)), flush=True)
                                        bpy.ops.file.cancel(); _u3['close'] = (a.as_pointer(), 6)
                                    else:
                                        r = bpy.ops.file.execute(); print('U3_DIRECT ' + str(r), flush=True); _u3['close'] = (a.as_pointer(), 6)
                            except Exception as e: print('U3_DIRECT failed', e, flush=True)
        if _imp['seen'] - cur:
            _imp['seen'] &= cur
            if not cur: print('WEB_FILE_IMPORT_END', flush=True)
    except Exception as e: print('IMPORT_ASSIST ERR', e)
    return 0.4
bpy.app.timers.register(_import_assist, first_interval=2.0, persistent=True)
# H20: export watcher — WASMFS obchází JS FS, proto Python hlídá adresáře a hlásí nové/změněné soubory (WEB_EXPORT <cesta>).
_ew = {'snap': None, 'pend': {}, 'render_t': 0.0}
import time as _time
@bpy.app.handlers.persistent
def _ew_render_evt(*a): _ew['render_t'] = _time.time()
for _h in (bpy.app.handlers.render_init, bpy.app.handlers.render_post, bpy.app.handlers.render_complete, bpy.app.handlers.render_cancel): _h.append(_ew_render_evt)
_EW_VIDEO = ('.mp4', '.avi', '.mkv', '.mov')
_EW_EXT = ('.obj', '.mtl', '.fbx', '.glb', '.gltf', '.bin', '.stl', '.ply', '.usd', '.usda', '.usdc', '.usdz', '.abc', '.dae', '.svg', '.x3d', '.wrl', '.png', '.jpg', '.jpeg', '.exr', '.tif', '.tiff', '.bmp', '.tga', '.hdr', '.webp', '.dds', '.mp4', '.avi', '.mkv', '.mov', '.wav', '.mp3', '.flac', '.ogg', '.pdf', '.json', '.csv', '.zip', '.vdb', '.bvh', '.blend')
def _ew_scan():
    out = {}
    for root, depth in (('/uploads', 3), ('/tmp', 1), ('/opfs/home', 2), ('/home', 2), (_os.getcwd(), 1)):
        stack = [(root, 0)]
        while stack:
            d, k = stack.pop()
            try: it = list(_os.scandir(d))
            except Exception: continue
            for e in it:
                try:
                    if e.is_dir(follow_symlinks=False):
                        if k + 1 < depth and e.name not in ('.config', '__pycache__', '.cache'): stack.append((e.path, k + 1))
                    elif e.name.lower().endswith(_EW_EXT) and 'autosave' not in e.name and not e.name.endswith(('.blend1', '.blend@')) and e.name != 'quit.blend' and not e.name.startswith('copybuffer'):
                        st = e.stat(); out[e.path] = (st.st_mtime_ns, st.st_size)
                except Exception: pass
    return out
def _export_watch():
    try:
        cur = _ew_scan()
        if _ew['snap'] is None: _ew['snap'] = cur; return 0.5
        rendering = _time.time() - _ew['render_t'] < 5.0   # V2: video se zapisuje po snímcích → nenabízet rozepsaný soubor
        for p, v in cur.items():
            if _ew['snap'].get(p) == v: continue
            if rendering and p.lower().endswith(_EW_VIDEO): _ew['pend'].pop(p, None); continue
            if _ew['pend'].get(p) == v:
                _ew['snap'][p] = v; del _ew['pend'][p]
                if v[1] > 0: print('WEB_EXPORT ' + p, flush=True)
            else: _ew['pend'][p] = v
        for p in list(_ew['snap']):
            if p not in cur: del _ew['snap'][p]
    except Exception as e: print('EXPORT_WATCH ERR', e)
    return 0.5
bpy.app.timers.register(_export_watch, first_interval=3.0, persistent=True)
def _save_prefs():
    try:
        if bpy.context.preferences.is_dirty: bpy.ops.wm.save_userpref(); print('USERPREF saved')
    except Exception as e: print('USERPREF save ERR', e)
    return 5.0
bpy.app.timers.register(_save_prefs, first_interval=10.0, persistent=True)
# Help ▸ Manual, odkazy v dialozích: webbrowser.open() na webu nic nedělá → pošli URL stránce (main.js scan → window.open).
import webbrowser as _wb, sys as _sys
class _WebBrowser(_wb.BaseBrowser):
    def open(self, url, new=0, autoraise=True):
        print('WEB_OPEN_URL ' + url); _sys.stdout.flush(); return True
_wb.register('blender-web', None, _WebBrowser('blender-web'), preferred=True)
_cap_pool()
bpy.app.handlers.load_post.append(_on_new)
# B3k: lite platí i po File ▸ New / otevření souboru (persistent). Původní hodnoty si pamatuje a do .blend je při ukládání
# vrátí (save_pre), po uložení zase lite (save_post), takže soubor z iPadu má na PC svoje stíny / vzorky.
_ml_orig = {}
def _ml_items(sc):
    return ((sc.render, 'render', 'preview_pixel_size', '${b}'), (sc.eevee, 'eevee', 'taa_samples', 1), (sc.eevee, 'eevee', 'use_shadows', False),
            (sc.eevee, 'eevee', 'use_raytracing', False), (sc.eevee, 'eevee', 'use_volumetric_shadows', False), (sc.eevee, 'eevee', 'use_gtao', False))
def _mp_lite_eevee(*a):
    if '${w}' != '1': return
    ok = []
    for sc in bpy.data.scenes:
        for obj, grp, name, val in _ml_items(sc):
            try:
                if hasattr(obj, name):
                    k = (sc.name, grp, name)
                    if k not in _ml_orig: _ml_orig[k] = getattr(obj, name)
                    setattr(obj, name, val); ok.append(name)
            except Exception as e: print('MPLITE_EEVEE', name, e)
    print('MPLITE_EEVEE applied ' + ','.join(sorted(set(ok))), flush=True)
def _ml_load(*a):
    _ml_orig.clear(); _mp_lite_eevee()
def _ml_save_pre(*a):
    for sc in bpy.data.scenes:
        for obj, grp, name, val in _ml_items(sc):
            k = (sc.name, grp, name)
            try:
                if k in _ml_orig and getattr(obj, name) == val: setattr(obj, name, _ml_orig[k])
            except Exception as e: print('MPLITE_EEVEE save', name, e)
_mp_lite_eevee()
if '${w}' == '1':
    bpy.app.handlers.load_post.append(bpy.app.handlers.persistent(_ml_load))
    bpy.app.handlers.save_pre.append(bpy.app.handlers.persistent(_ml_save_pre))
    bpy.app.handlers.save_post.append(bpy.app.handlers.persistent(_mp_lite_eevee))
# Autosave: Blenderův vlastní autosave timer na webu nezapíše nic (ověřeno 3 min, 1 min interval) a /tmp je v paměti.
# iPad Safari zabíjí tab na pozadí → vlastní kopie do /opfs/home/_autosave.blend (viditelná v 📁), jen když je scéna změněná.
import os, time
_AS = '/opfs/home/_autosave.blend'
_AS_EVERY = float('${t}')
_as = {'wait': _AS_EVERY}
try:
    if os.path.exists(_AS): os.replace(_AS, '/opfs/home/_autosave_prev.blend'); print('AUTOSAVE previous session kept as /opfs/home/_autosave_prev.blend')
except Exception as e: print('AUTOSAVE rotate ERR', e)
_PREV = '/opfs/home/_autosave_prev.blend'
_RESTORE = '${r}'
_offer = {'tries': 0}
def _offer_restore():
    # Po pádu/zavření tabu nabídnout poslední autosave (popup v Blenderu, funguje i prstem).
    _offer['tries'] += 1
    try:
        wm = bpy.context.window_manager
        if not wm.windows:
            return 2.0 if _offer['tries'] < 30 else None
        if bpy.data.filepath or not os.path.exists(_PREV) or os.path.getsize(_PREV) < 1000: return None
        if _RESTORE == 'no': return None
        if _RESTORE == 'crashed': print('RESTORE_CRASHED_OFFER', os.path.getsize(_PREV), flush=True); return None
        if _RESTORE == 'auto':
            mt = int(os.path.getmtime(_PREV)); print('RESTORE_AUTO', os.path.getsize(_PREV), flush=True)
            bpy.ops.wm.open_mainfile(filepath=_PREV)
            print('WEB_RESTORED', mt, flush=True); return None
        def _draw(self, ctx):
            op = self.layout.operator('wm.open_mainfile', text='Obnovit poslední práci', icon='FILE_REFRESH')
            op.filepath = _PREV
            self.layout.label(text='Soubor: _autosave_prev.blend (též v 📁)')
        print('RESTORE_OFFER', os.path.getsize(_PREV), flush=True)
        wm.popup_menu(_draw, title='Našel jsem rozdělanou práci', icon='INFO')
    except Exception as e: print('RESTORE_OFFER ERR', e)
    return None
def _file_menu_restore(self, ctx):
    if os.path.exists(_PREV) and os.path.getsize(_PREV) > 1000:
        self.layout.separator()
        self.layout.operator('wm.open_mainfile', text='Obnovit poslední práci (autosave)', icon='FILE_REFRESH').filepath = _PREV
try: bpy.types.TOPBAR_MT_file.append(_file_menu_restore)
except Exception as e: print('RESTORE menu ERR', e)
bpy.app.timers.register(_offer_restore, first_interval=5.0, persistent=True)
def _autosave():
    try:
        if bpy.data.is_dirty and bpy.context.window_manager.windows:
            t = time.time()
            bpy.ops.wm.save_as_mainfile(filepath=_AS, copy=True, compress=True)
            dt = time.time() - t
            _as['wait'] = max(_AS_EVERY, dt * 20); _as['last'] = time.time()
            print('AUTOSAVE', os.path.getsize(_AS), round(dt, 2))
    except Exception as e: print('AUTOSAVE ERR', e)
    return _as['wait']
bpy.app.timers.register(_autosave, first_interval=_AS_EVERY, persistent=True)
# B3-POJISTKA: iPad padá typicky 0,2–2 s po přepnutí na Material Preview / jiný workspace (tvorba shaderů). msgbus zavolá
# uložení hned po přepnutí, ještě před vykreslením, takže se neztratí práce od posledního 30s autosave.
_as['last'] = 0.0
def _autosave_now(reason):
    try:
        if bpy.data.is_dirty and time.time() - _as['last'] > 3.0:
            t = time.time()
            bpy.ops.wm.save_as_mainfile(filepath=_AS, copy=True, compress=True)
            _as['last'] = time.time()
            print('AUTOSAVE', reason, os.path.getsize(_AS), round(_as['last'] - t, 2), flush=True)
    except Exception as e: print('AUTOSAVE ERR', reason, e)
_as_owner = object()
def _as_subscribe(*_):
    bpy.msgbus.clear_by_owner(_as_owner)
    bpy.msgbus.subscribe_rna(key=(bpy.types.View3DShading, 'type'), owner=_as_owner, args=('shading',), notify=_autosave_now)
    bpy.msgbus.subscribe_rna(key=(bpy.types.Window, 'workspace'), owner=_as_owner, args=('workspace',), notify=_autosave_now)
# H52: kontrola UI fontu po startu (BLF měří text na CPU; nulová šířka = font se nenačetl → JS ukáže lištu).
def _font_probe():
    try:
        import blf
        w = blf.dimensions(0, 'Hello World')[0]
        print('WEB_FONT', 'OK' if w > 10 else 'BAD', round(w, 1), flush=True)
    except Exception as e: print('WEB_FONT ERR', e, flush=True)
    return None
bpy.app.timers.register(_font_probe, first_interval=12.0, persistent=True)
# M2: JS (ukazatel RAM, červená) napíše /tmp/autosave_req.txt → uložit hned.
def _autosave_req():
    try:
        # H53: červený ukazatel RAM zastaví přehrávání (soft body/cloth/částice cache roste ~24 B/vrchol/snímek)
        if os.path.exists('/tmp/mem_red.txt'):
            os.remove('/tmp/mem_red.txt')
            for w in bpy.context.window_manager.windows:
                if w.screen.is_animation_playing:
                    with bpy.context.temp_override(window=w, screen=w.screen): bpy.ops.screen.animation_cancel(restore_frame=False)
                    print('WEB_MEM_STOP playback stopped (RAM red)', flush=True)
        # žádost zůstává, dokud není co uložit (scéna nezměněná = nic nehrozí ztratit)
        if os.path.exists('/tmp/autosave_req.txt') and bpy.data.is_dirty and bpy.context.window_manager.windows:
            os.remove('/tmp/autosave_req.txt')
            _as['last'] = 0.0
            _autosave_now('mem-red')
    except Exception as e: print('AUTOSAVE REQ ERR', e)
    return 2.0
bpy.app.timers.register(_autosave_req, first_interval=5.0, persistent=True)
_as_subscribe()
bpy.app.handlers.load_post.append(bpy.app.handlers.persistent(_as_subscribe))`,L=navigator.maxTouchPoints>1&&/Macintosh|iPad/.test(navigator.userAgent),g=_.get("webkit_sim")==="1"||/AppleWebKit/.test(navigator.userAgent)&&!/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(navigator.userAgent),A=parseInt(_.get("pool")||(L?"8":"32"),10)||32,B=`import bpy, os
_dirty = [None]
try:
    # C1: uložené uživatelské nastavení z doby před Cycles nemá add-on zapnutý
    if bpy.app.build_options.cycles and 'cycles' not in bpy.context.preferences.addons:
        import addon_utils; addon_utils.enable('cycles', default_set=True)
except Exception: pass
def _drop_one(fp):
    # H38: soubor přetažený na plátno (main.js): import jako FileHandlery desktopu, obrázky načíst
    ext = os.path.splitext(fp)[1].lower()
    imp = {'.obj': 'wm.obj_import', '.stl': 'wm.stl_import', '.ply': 'wm.ply_import', '.fbx': 'import_scene.fbx',
           '.glb': 'import_scene.gltf', '.gltf': 'import_scene.gltf', '.usd': 'wm.usd_import', '.usda': 'wm.usd_import',
           '.usdc': 'wm.usd_import', '.usdz': 'wm.usd_import', '.abc': 'wm.alembic_import', '.svg': 'import_curve.svg', '.bvh': 'import_anim.bvh'}
    try:
        if ext in imp:
            mod, op = imp[ext].split('.'); r = getattr(getattr(bpy.ops, mod), op)(filepath=fp)
        elif ext in ('.png', '.jpg', '.jpeg', '.exr', '.hdr', '.tif', '.tiff', '.bmp', '.tga', '.webp'):
            r = bpy.data.images.load(fp, check_existing=True).name
        else:
            r = 'jen nahráno do /uploads'
        print('DROP_REQ', fp, r)
    except Exception as e: print('DROP_REQ failed', fp, e)
_packed_try = set()
def _pack_uploads():
    # H54: obrázek ze zařízení leží v /uploads (MEMFS, po reloadu/obnově autosave pryč) → zabalit do .blend, jinak je růžový
    for im in bpy.data.images:
        if im.source != 'FILE' or im.packed_file is not None or not im.filepath or im.library: continue
        k = (im.name, im.filepath)
        if k in _packed_try: continue
        try: ap = bpy.path.abspath(im.filepath)
        except Exception: continue
        if not ap.startswith('/uploads/') or not os.path.isfile(ap): continue
        _packed_try.add(k)
        try: im.pack(); print('H54 packed', im.name)
        except Exception as e: print('H54 pack failed', im.name, e)
def _open_tick():
    try:
        _pack_uploads()
        d = '1' if bpy.data.is_dirty else '0'
        if d != _dirty[0]:
            _dirty[0] = d
            with open('/tmp/dirty.txt', 'w') as f: f.write(d)
        p = '/tmp/open_req.txt'
        if os.path.exists(p):
            with open(p) as f: fp = f.read().strip()
            os.remove(p)
            print('OPEN_REQ', fp)
            bpy.ops.wm.open_mainfile(filepath=fp)
        p = '/tmp/drop_req.txt'
        if os.path.exists(p):
            with open(p) as f: fps = [x for x in f.read().split('\\n') if x]
            os.remove(p)
            for fp in fps: _drop_one(fp)
    except Exception as e: print('OPEN_REQ failed', e)
    return 0.3
bpy.app.timers.register(_open_tick, first_interval=1.0, persistent=True)`,K=`import bpy
_WEB_LINKS = (
    ("About Blender Web (unofficial)", "https://github.com/GGlukyy/blender-wasm#readme"),
    ("GitHub: GGlukyy/blender-wasm", "https://github.com/GGlukyy/blender-wasm"),
    ("itch.io: ggluki", "https://ggluki.itch.io/blender-web-unofficial-test"),
    ("Source code (GPL): GGlukyy/blender", "https://github.com/GGlukyy/blender"),
    ("Based on HeyPuter/blender-wasm", "https://github.com/heyputer/blender-wasm"),
)
def _web_status(self, context):
    self.layout.operator("wm.url_open", text="Unofficial web port · GGluki", emboss=False).url = _WEB_LINKS[1][1]
def _web_help(self, context):
    self.layout.separator()
    for t, u in _WEB_LINKS:
        self.layout.operator("wm.url_open", text=t, icon='URL').url = u
bpy.types.STATUSBAR_HT_header.append(_web_status)
bpy.types.TOPBAR_MT_help.append(_web_help)`,te=_.has("threads")?parseInt(_.get("threads"),10)||0:L||_.get("ipad")==="1"?4:0,X=zn(_);window.Module={poolSize:A,arguments:["--factory-startup",...te>0?["-t",String(te)]:[],"--python-expr",E,"--python-expr",B,"--python-expr",K,...io(),...Kn(X),...window.__BARGS||[]],canvas:G,print:u=>{N(u),xt(u)},printErr:u=>{N("[err] "+u),xt(u)},instantiateWasm:(u,C)=>(WebAssembly.instantiate(ze,u).then(T=>{ze=null,C(T.instance,T.module)}),{}),preRun:[function(){try{if(an||(ENV.BLENDER_WEB_OPFS="1"),ENV.HOME=an?"/tmp":"/opfs/home",ENV.BLENDER_SYSTEM_RESOURCES="/assets/5.3",ENV.BLENDER_SYSTEM_PYTHON="/assets",ENV.PYTHONHOME="/assets",ENV.WGSL_SEED_URL=new URL("wgsl-cache.json",location.href).href,window.__CAPENV)for(const u in window.__CAPENV)ENV[u]=window.__CAPENV[u];ENV.WGPU_PERF="1";{const u=new URLSearchParams(location.search);u.get("bgpurge")==="0"&&(ENV.WGPU_BG_PURGE="0");const C=u.get("bp");(C==="1"||C!=="0"&&(u.get("ipad")==="1"||L))&&(ENV.WGPU_BP="1")}ENV.WGPU_BP,new URLSearchParams(location.search).get("perf")==="1"&&new URLSearchParams(location.search).get("reglog")==="1"&&(ENV.WGPU_REGIONLOG="1"),new URLSearchParams(location.search).get("passlog")==="1"&&(ENV.WGPU_PASSLOG="1"),new URLSearchParams(location.search).get("nocompute")==="1"&&(ENV.WGPU_NO_COMPUTE="1");{const u=new URLSearchParams(location.search).get("nodualsrc");(u==="1"||u!=="0"&&(L||g||window.__noDualSrc))&&(ENV.WGPU_NO_DUALSRC="1")}console.log("WEB_FLAGS "+JSON.stringify({nodualsrc:ENV.WGPU_NO_DUALSRC||"0",mp_lite:w,pool:A,bp:ENV.WGPU_BP||"0",webkit:g,ipad_ua:L})),new URLSearchParams(location.search).get("compilelog")==="1"&&(ENV.WGPU_LOG_COMPILE="1"),new URLSearchParams(location.search).get("drawlog")==="1"&&(ENV.WGPU_LOG_DRAWS="1"),new URLSearchParams(location.search).get("iconprev")==="1"&&(ENV.BLENDER_WEB_ICON_PREVIEWS="1");{const u=new URLSearchParams(location.search).get("env");if(u)for(const C of u.split(",")){const[T,p]=C.split("=");/^[A-Z0-9_]+$/.test(T)&&(ENV[T]=p??"1")}}}catch(u){N("preRun ENV: "+u)}Module.geckoProviders={0:Io},ENV.BLENDER_WEB_ASSET_PROVIDER="1",addRunDependency("wgsl-cache"),(async()=>{const u=await No(),C=await new Promise((f,ne)=>{const H=u.transaction("wgsl").objectStore("wgsl").getAll();H.onsuccess=()=>f(H.result),H.onerror=()=>ne(H.error)});let T=[];try{const f=await fetch("wgsl-cache.json");f.ok&&(T=await f.json())}catch{}const p=f=>{if(typeof f!="string")return f;const ne=/^override\s+(\w+)\s*:\s*\w+\s*=\s*([^;]+);[ \t]*\n?/gm;let H=f,oe,fe=[];for(;(oe=ne.exec(f))!==null;){const be=f.slice(f.lastIndexOf(`
`,oe.index-1)+1,oe.index),ge=f.slice(0,Math.max(oe.index-1,0)).split(`
`).pop();/@id\(\d+\)/.test(be)||/^\s*@id\(\d+\)\s*$/.test(ge)||fe.push([oe[0],oe[1],oe[2].trim()])}for(const[be,ge,_e]of fe)H=H.replace(be,""),H=H.replace(new RegExp("(?<![\\w.])"+ge+"(?!\\w)","g"),"("+_e+")");return H},V=new URLSearchParams(location.search).has("noovfix"),me=f=>V?f:p(f);globalThis.__WGSL_CACHE__=new Map([...T.map(([f,ne])=>[f,me(ne)]),...C.map(f=>[f.key,me(f.wgsl)])]),globalThis.__WGSL_CACHE_PUT__=(f,ne)=>{try{u.transaction("wgsl","readwrite").objectStore("wgsl").put({key:f,wgsl:ne})}catch{}}})().catch(u=>N("wgsl cache: "+u)).finally(()=>removeRunDependency("wgsl-cache"))}],onRuntimeInitialized:()=>{po(),Wn(X,G,N),window.__rtInit=!0;try{window.Module.FS.mkdir(ut)}catch{}try{window.Module.ccall("blender_web_set_has_fsaccess",null,["number"],[Et?1:0])}catch(u){N("set_has_fsaccess: "+u)}},onAbort:u=>{let C="";try{C=String(new Error().stack).slice(0,1500)}catch{}const T=String(u),p=T.indexOf(" @@STACK@@ ");T.slice(0,p<0?200:Math.min(p,200)),p<0||T.slice(p+11,p+4011),N("ABORT: "+u),Vt("Failed to start: "+u)}};const Ee=(u,C,T)=>{if(document.getElementById("oom-overlay"))return;const p=document.createElement("div");if(p.id="oom-overlay",p.style.cssText="position:fixed;inset:0;z-index:99999;background:#b00020;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;font:600 28px/1.4 -apple-system,sans-serif",p.innerHTML="<div style='font-size:64px'>⚠️</div><div>"+u+"</div><div style='font-weight:400;font-size:22px;margin-top:16px;max-width:640px'>"+C+"</div>",T){const V=document.createElement("button");V.textContent=T.label,V.style.cssText="margin-top:24px;font-size:22px;padding:10px 22px",V.onclick=T.onclick,p.appendChild(V)}document.body.appendChild(p)},ke=/out of memory|Cannot allocate Wasm memory/i,De=()=>{Vt("Out of memory — close this tab completely and reopen the page. / Nedostatek paměti — zavři tento tab a otevři stránku znovu."),Ee("Safari didn't give Blender memory / Safari nedalo Blenderu paměť","<b>Close this tab completely</b> (swipe it away in the tab overview) and open the page again — Safari frees the memory of a crashed tab late. Close other heavy tabs too. Private tabs have a lower limit.<br><br><b>Zavři tuhle záložku úplně</b> (v přehledu záložek ji odsuň pryč) a otevři stránku znovu — Safari uvolňuje paměť spadlé záložky se zpožděním. Zavři i ostatní těžké záložky. V soukromém tabu je limit nižší.",{label:"Try with less memory / Zkusit s menší pamětí",onclick:()=>{const u=new URL(location.href);u.searchParams.set("pool","4"),location.href=u.toString()}})};addEventListener("unhandledrejection",u=>{ke.test(String(u.reason&&(u.reason.message||u.reason)))&&De()}),addEventListener("error",u=>{ke.test(String(u.message||u.error&&u.error.message||""))&&De()});try{const u=indexedDB.open("blender-probe");u.onerror=()=>Ee("Soukromý tab není podporován","Otevři Blender v normálním tabu Safari (ne v soukromém)."),u.onsuccess=()=>{try{u.result.close()}catch{}}}catch{Ee("Soukromý tab není podporován","Otevři Blender v normálním tabu Safari (ne v soukromém).")}const P=function(){const u=globalThis.__PT_SEARCH||location.search,C=/[?&]webkit_sim=1/.test(u),T=C&&/[?&]sim_nos1=1/.test(u);if(C&&globalThis.GPUAdapter&&!GPUAdapter.prototype.__sim){const h=GPUAdapter.prototype;h.__sim=!0;const v=new Set(["atomic-vec2u-min-max","clip-distances","dual-source-blending","primitive-index","subgroup-size-control","subgroups","texture-component-swizzle","texture-compression-unaligned","texture-formats-tier2"]),S={maxBufferSize:1073741824,maxStorageBufferBindingSize:1073741824,maxColorAttachmentBytesPerSample:64,maxSampledTexturesPerShaderStage:44};T&&(S.maxStorageBuffersPerShaderStage=8);const j=(/[?&]sim_keep=([^&]*)/.exec(u)||[])[1],z=(/[?&]sim_nocap=([^&]*)/.exec(u)||[])[1];if(j)for(const D of j.split(","))v.delete(D);if(z)for(const D of z.split(","))delete S[D];const q=Object.getOwnPropertyDescriptor(h,"features"),se=Object.getOwnPropertyDescriptor(h,"limits");Object.defineProperty(h,"features",{get(){return new Set([...q.get.call(this)].filter(D=>!v.has(D)&&!D.startsWith("chromium-")))}}),Object.defineProperty(h,"limits",{get(){const D=se.get.call(this),J={};for(const W in D)J[W]=W in S?Math.min(D[W],S[W]):D[W];return J}}),console.log("WEBKIT_SIM on")}if(globalThis.GPUAdapter&&!GPUAdapter.prototype.__s1){const h=GPUAdapter.prototype,v=h.requestDevice;h.__s1=!0,h.requestDevice=function(S){S=Object.assign({},S||{});const j=Object.assign({},S.requiredLimits||{});for(const z of["maxStorageBuffersInFragmentStage","maxStorageBuffersInVertexStage","maxStorageTexturesInFragmentStage","maxStorageTexturesInVertexStage"])z in this.limits&&!(z in j)&&(j[z]=T?8:this.limits[z]);return S.requiredLimits=j,v.call(this,S)}}if(!globalThis.GPUDevice)return;const p=GPUDevice.prototype,V=new WeakMap,me=new Map,f=globalThis.__OVR_STATS={specialized:0,leftover:0,modules:0,ovModules:0,pipes:0},ne=()=>{(f.specialized<=3||f.specialized%100===0)&&console.log("OVR_SPEC "+JSON.stringify(f))},H=p.createShaderModule;p.createShaderModule=function(h){const v=H.call(this,h);if(f.modules++,h&&typeof h.code=="string"&&/\boverride\b/.test(h.code)&&(V.set(v,h),f.ovModules++),h&&typeof h.code=="string")for(const S of h.code.matchAll(/(\w+)\s*:\s*texture_storage_\w+<(\w+),\s*read_write>/g))/^r32(float|uint|sint)$/.test(S[2])||console.log("WGPU_RW_STORAGE_BAD '"+(h.label||"?")+"' var="+S[1]+" fmt="+S[2]);return v};const oe=(h,v)=>h==="bool"?v?"true":"false":h==="u32"?String(v>>>0):h==="i32"?String(v|0):Number.isInteger(v)?v.toFixed(1):String(v),fe=(h,v)=>{if(!v)return;const S=V.get(v.module);if(!S)return;const j=v.constants||{},z=S.code+"\0"+JSON.stringify(j);let q=me.get(z);if(!q){const se=S.code.replace(/(?:@id\((\d+)\)\s*)?override\s+(\w+)\s*:\s*(\w+)\s*(?:=\s*([^;]+))?;/g,(D,J,W,de,Z)=>{let Q=j[W];return Q===void 0&&J!==void 0&&(Q=j[J]),Q!==void 0?`const ${W} : ${de} = ${oe(de,Q)};`:Z!==void 0?`const ${W} : ${de} = ${Z.trim()};`:D});/\boverride\b/.test(se)&&(f.leftover++,C&&console.log("WEBKIT_SIM_BAD override zůstal: '"+(S.label||"?")+"'")),f.specialized++,q=H.call(h,{...S,code:se}),me.set(z,q),ne()}v.module=q,delete v.constants},be=p.createRenderPipeline,ge=p.createComputePipeline,_e=/[?&]pipethrow=(\w+)/.exec(globalThis.__PT_SEARCH||location.search);let Pe=null,je=null;const ve=h=>{try{(je||(je=new BroadcastChannel("blender-gpuerr"))).postMessage(h)}catch{}},Fe=/[?&]tel=1/.test(globalThis.__PT_SEARCH||location.search);let le=null;const Re=h=>{try{const v=(h.vertex&&h.vertex.buffers||[]).map(S=>S?S.arrayStride+":"+[...S.attributes].map(j=>j.shaderLocation+"="+j.format).join(","):"-").join("|");(le||(le=new BroadcastChannel("blender-pipe"))).postMessage({label:h.label,vb:v,n:f.pipes})}catch{}};if(Fe){const h={rgba32float:16,rg32float:8,rgba16float:8,"depth32float-stencil8":8,r8unorm:1,r8uint:1,r8snorm:1,rg8unorm:2,r16float:2,r16uint:2,rg16float:4},v=new WeakMap,S={alloc:0,freed:0};let j=null;const z=()=>{try{(j||(j=new BroadcastChannel("blender-churn"))).postMessage(S)}catch{}},q=p.createTexture,se=globalThis.GPUTexture&&GPUTexture.prototype,D=se&&se.destroy;se&&(p.createTexture=function(J){const W=q.call(this,J),de=W.width*W.height*W.depthOrArrayLayers*(h[W.format]||4)*(W.mipLevelCount>1?1.33:1)/1048576;return v.set(W,de),S.alloc+=de,z(),W},se.destroy=function(){const J=v.get(this);return J&&(S.freed+=J,v.delete(this),z()),D.call(this)})}p.createRenderPipeline=function(h){f.pipes++;try{Fe&&Re(h),fe(this,h.vertex),fe(this,h.fragment);const v=h.fragment&&h.fragment.targets;if(v){for(let z=0;z<v.length;z++)if(v[z]===void 0){if(_e&&_e[1]==="sparse")throw new TypeError("Type error (simulated sparse target)");v[z]=null,f.sparse=(f.sparse||0)+1,f.sparse<=10&&ve("PIPE_SPARSE '"+h.label+"' slot="+z+" of "+v.length+" fmts="+v.map(q=>q?q.format:"null"))}}if(_e&&_e[1]==="all")throw new TypeError("Type error (simulated)");const S=this;S.pushErrorScope("validation");const j=be.call(this,h);return S.popErrorScope().then(z=>{z&&(f.pipeInvalid=(f.pipeInvalid||0)+1)<=10&&ve("PIPE_INVALID '"+h.label+"' tgts="+(h.fragment&&h.fragment.targets?h.fragment.targets.map(q=>q?q.format+(q.blend?"+blend":""):"null"):"-")+" "+z.message.slice(0,160))},()=>{}),j}catch(v){return f.pipeThrown=(f.pipeThrown||0)+1,console.log("WGPU_PIPE_THROW '"+(h&&h.label)+"' "+v),f.pipeThrown<=10&&ve("PIPE_THROW '"+(h&&h.label)+"' "+v),Pe||(Pe=H.call(this,{code:"@vertex fn main() -> @builtin(position) vec4f { return vec4f(0); }"})),be.call(this,{label:"invalid_after_throw",layout:"auto",vertex:{module:Pe,entryPoint:"nope"}})}},p.createComputePipeline=function(h){return fe(this,h.compute),ge.call(this,h)}};if(!new URLSearchParams(location.search).has("overrides")){P();const u=globalThis.Worker;globalThis.Worker=class extends u{constructor(C,T){if(T&&String(T.name).startsWith("em-pthread")&&!T.type){const p=new URL(String(C),location.href).href;C=URL.createObjectURL(new Blob(["globalThis.__PT_SEARCH="+JSON.stringify(location.search)+";("+P+")();importScripts("+JSON.stringify(p)+");"],{type:"text/javascript"}))}super(C,T)}}}N("loading Blender…");const Te=document.createElement("script");Te.src=wn()+".js",document.body.appendChild(Te)}Xe.onclick=()=>{ua()};dt();
